BEGIN;

CREATE TABLE IF NOT EXISTS public.kb_day_closings (
    date date PRIMARY KEY,
    opening_balance numeric NOT NULL,
    sale_income numeric NOT NULL,
    qist_collected numeric NOT NULL,
    workshop_income numeric NOT NULL,
    expense numeric NOT NULL,
    total_income numeric GENERATED ALWAYS AS (sale_income + qist_collected + workshop_income) STORED,
    closing_balance numeric GENERATED ALWAYS AS (opening_balance + sale_income + qist_collected + workshop_income - expense) STORED,
    closed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.kb_day_closings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.kb_day_closings FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.kb_day_closings TO service_role;

ALTER TABLE public.kb_spare_parts ADD COLUMN IF NOT EXISTS repurchase_checked_at timestamptz;
CREATE OR REPLACE FUNCTION public.kb_reset_repurchase_check()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
    NEW.repurchase_checked_at := NULL;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS kb_reset_repurchase_check ON public.kb_spare_parts;
CREATE TRIGGER kb_reset_repurchase_check BEFORE UPDATE OF quantity ON public.kb_spare_parts
FOR EACH ROW WHEN (OLD.quantity IS DISTINCT FROM NEW.quantity)
EXECUTE FUNCTION public.kb_reset_repurchase_check();

CREATE INDEX IF NOT EXISTS kb_qist_payments_date_idx ON public.qist_payments(date);
CREATE INDEX IF NOT EXISTS kb_workshop_payments_date_idx ON public.kb_workshop_payments(date);

CREATE OR REPLACE FUNCTION public.kb_daily_figures(p_from date, p_to date, p_timezone text)
RETURNS TABLE(day date, sale numeric, sale_income numeric, expense numeric, profit numeric, qist_collected numeric, workshop_income numeric)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
    WITH activity(entry_day, sale, sale_income, expense, profit, qist_collected, workshop_income) AS (
        SELECT s.date, s.sell_price, CASE WHEN s.payment_method = 'qist' THEN coalesce(q.advance,0) ELSE s.sell_price END,
            0, s.profit, 0, 0
        FROM public.sales s LEFT JOIN public.qist q ON q.sale_id = s.id WHERE s.date BETWEEN p_from AND p_to
        UNION ALL
        SELECT s.date, s.unit_price * s.quantity, s.unit_price * s.quantity, 0, s.profit, 0, 0
        FROM public.kb_spare_part_sales s WHERE s.date BETWEEN p_from AND p_to
        UNION ALL
        SELECT e.date, 0, 0, e.amount, -e.amount, 0, 0 FROM public.expenses e WHERE e.date BETWEEN p_from AND p_to
        UNION ALL
        SELECT p.date, 0, 0, 0, 0, p.amount, 0 FROM public.qist_payments p WHERE p.date BETWEEN p_from AND p_to
        UNION ALL
        SELECT p.date, 0, 0, 0, 0, 0, p.amount FROM public.kb_workshop_payments p WHERE p.date BETWEEN p_from AND p_to
        UNION ALL
        SELECT coalesce((j.ready_at AT TIME ZONE p_timezone)::date,j.created_on), 0, 0, 0, j.labour_charge - j.labour_cost, 0, 0
        FROM public.kb_workshop_jobs j
        WHERE j.status IN ('completed','delivered') AND j.labour_charge IS NOT NULL AND j.labour_cost IS NOT NULL
            AND coalesce((j.ready_at AT TIME ZONE p_timezone)::date,j.created_on) BETWEEN p_from AND p_to
    ), days AS (
        SELECT p_from + n AS day FROM generate_series(0,p_to - p_from) n
    )
    SELECT d.day, coalesce(sum(a.sale),0), coalesce(sum(a.sale_income),0), coalesce(sum(a.expense),0),
        coalesce(sum(a.profit),0), coalesce(sum(a.qist_collected),0), coalesce(sum(a.workshop_income),0)
    FROM days d LEFT JOIN activity a ON a.entry_day = d.day GROUP BY d.day ORDER BY d.day
$$;

CREATE OR REPLACE FUNCTION public.kb_opening_balance(p_day date)
RETURNS numeric LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
    SELECT coalesce((SELECT c.closing_balance FROM public.kb_day_closings c
        WHERE c.date < p_day ORDER BY c.date DESC LIMIT 1),0)
$$;

CREATE OR REPLACE FUNCTION public.kb_daily_overview(p_day date,p_timezone text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
    WITH figures AS MATERIALIZED (SELECT * FROM public.kb_daily_figures(p_day - 29,p_day,p_timezone)),
    current_report AS (
        SELECT p_day AS date, public.kb_opening_balance(p_day) AS opening_balance, f.sale_income,
            f.qist_collected, f.workshop_income, f.expense, f.sale_income + f.qist_collected + f.workshop_income AS total_income
        FROM figures f WHERE f.day = p_day
    )
    SELECT jsonb_build_object(
        'days', (SELECT jsonb_agg(f ORDER BY f.day) FROM figures f),
        'report', coalesce((SELECT to_jsonb(c) FROM public.kb_day_closings c WHERE c.date = p_day),
            (SELECT to_jsonb(r) || jsonb_build_object('closing_balance',r.opening_balance + r.total_income - r.expense,'closed_at',NULL::timestamptz)
                FROM current_report r)),
        'history', coalesce((SELECT jsonb_agg(h ORDER BY h.date DESC) FROM
            (SELECT * FROM public.kb_day_closings WHERE date <= p_day ORDER BY date DESC LIMIT 10) h),'[]'::jsonb),
        'repurchase', coalesce((SELECT jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'quantity',p.quantity,
            'needed',10 - p.quantity,'supplier',s.name) ORDER BY p.quantity,lower(p.name),p.id)
            FROM public.kb_spare_parts p LEFT JOIN public.kb_suppliers s ON s.id = p.supplier_id
            WHERE p.quantity <= 5 AND p.repurchase_checked_at IS NULL),'[]'::jsonb)
    )
$$;

CREATE OR REPLACE FUNCTION public.kb_close_day(p_day date,p_timezone text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
    saved public.kb_day_closings%ROWTYPE;
BEGIN
    IF p_day IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Enter a valid date.'; END IF;
    PERFORM pg_advisory_xact_lock(192747810, -2147483648);
    PERFORM pg_advisory_xact_lock(192747810,p_day - date '2000-01-01');
    SELECT * INTO saved FROM public.kb_day_closings WHERE date = p_day;
    IF FOUND THEN RETURN to_jsonb(saved); END IF;
    IF p_day <> (clock_timestamp() AT TIME ZONE p_timezone)::date THEN
        RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Day changed. Refresh the report before closing.';
    END IF;
    INSERT INTO public.kb_day_closings (date,opening_balance,sale_income,qist_collected,workshop_income,expense)
    SELECT p_day, public.kb_opening_balance(p_day), f.sale_income, f.qist_collected, f.workshop_income, f.expense
    FROM public.kb_daily_figures(p_day,p_day,p_timezone) f RETURNING * INTO saved;
    RETURN to_jsonb(saved);
END;
$$;

CREATE OR REPLACE FUNCTION public.kb_guard_closed_day()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
    PERFORM pg_advisory_xact_lock(192747810,NEW.date - date '2000-01-01');
    IF EXISTS (SELECT 1 FROM public.kb_day_closings c WHERE c.date = NEW.date) THEN
        IF TG_TABLE_NAME = 'expenses' AND EXISTS (
            SELECT 1 FROM public.expenses e WHERE e.request_key = NEW.request_key
        ) THEN RETURN NEW; END IF;
        RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='This day is closed for new transactions.';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS kb_guard_closed_day ON public.sales;
CREATE TRIGGER kb_guard_closed_day BEFORE INSERT ON public.sales FOR EACH ROW EXECUTE FUNCTION public.kb_guard_closed_day();
DROP TRIGGER IF EXISTS kb_guard_closed_day ON public.kb_spare_part_sales;
CREATE TRIGGER kb_guard_closed_day BEFORE INSERT ON public.kb_spare_part_sales FOR EACH ROW EXECUTE FUNCTION public.kb_guard_closed_day();
DROP TRIGGER IF EXISTS kb_guard_closed_day ON public.qist_payments;
CREATE TRIGGER kb_guard_closed_day BEFORE INSERT ON public.qist_payments FOR EACH ROW EXECUTE FUNCTION public.kb_guard_closed_day();
DROP TRIGGER IF EXISTS kb_guard_closed_day ON public.kb_workshop_payments;
CREATE TRIGGER kb_guard_closed_day BEFORE INSERT ON public.kb_workshop_payments FOR EACH ROW EXECUTE FUNCTION public.kb_guard_closed_day();
DROP TRIGGER IF EXISTS kb_guard_closed_day ON public.expenses;
CREATE TRIGGER kb_guard_closed_day BEFORE INSERT ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.kb_guard_closed_day();

REVOKE ALL ON FUNCTION public.kb_reset_repurchase_check(), public.kb_daily_figures(date,date,text),
    public.kb_opening_balance(date), public.kb_daily_overview(date,text), public.kb_close_day(date,text), public.kb_guard_closed_day()
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.kb_reset_repurchase_check(), public.kb_daily_figures(date,date,text),
    public.kb_opening_balance(date), public.kb_daily_overview(date,text), public.kb_close_day(date,text), public.kb_guard_closed_day()
    TO service_role;

COMMIT;
