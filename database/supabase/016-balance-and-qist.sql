BEGIN;

CREATE OR REPLACE FUNCTION public.kb_collect(p_qist_id bigint, p_payment jsonb)
RETURNS bigint LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
    plan public.qist%ROWTYPE;
    payment public.qist_payments%ROWTYPE;
    request_id uuid := (p_payment->>'request_key')::uuid;
    paid numeric(14,2) := (p_payment->>'amount')::numeric;
    payment_day date := (p_payment->>'date')::date;
    due date := (p_payment->>'next_date')::date;
    balance numeric(14,2);
    collected numeric;
    months integer;
BEGIN
    SELECT * INTO plan FROM public.qist WHERE id=p_qist_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='Qist plan not found.'; END IF;
    SELECT * INTO payment FROM public.qist_payments WHERE request_key=request_id;
    IF FOUND THEN
        IF payment.qist_id<>p_qist_id OR payment.amount<>paid THEN
            RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='This payment request was already used.';
        END IF;
        RETURN payment.id;
    END IF;
    IF paid IS NULL OR paid <= 0 OR paid > plan.remaining THEN
        RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Payment must be within the remaining balance.';
    END IF;
    IF due IS NOT NULL AND due < payment_day THEN
        RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Next payment date must be today or later.';
    END IF;
    balance := plan.remaining - paid;
    collected := greatest(plan.total-plan.advance-plan.remaining,0);
    months := floor((collected+paid)/plan.monthly_qist) - floor(collected/plan.monthly_qist);
    INSERT INTO public.qist_payments(qist_id,amount,date,request_key)
    VALUES (p_qist_id,paid,payment_day,request_id) RETURNING * INTO payment;
    UPDATE public.qist SET remaining=balance,next_date=CASE WHEN balance=0 THEN NULL
        ELSE coalesce(due,(plan.next_date+make_interval(months=>months))::date) END WHERE id=p_qist_id;
    RETURN payment.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.kb_opening_balance(p_day date,p_timezone text)
RETURNS numeric LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
    WITH prior AS (
        SELECT c.date,c.closing_balance FROM public.kb_day_closings c
        WHERE c.date < p_day ORDER BY c.date DESC LIMIT 1
    ), first_activity AS (
        SELECT least((SELECT min(date) FROM public.sales),(SELECT min(date) FROM public.expenses),
            (SELECT min(date) FROM public.qist_payments),(SELECT min(date) FROM public.kb_workshop_payments),
            (SELECT min(date) FROM public.kb_spare_part_sales),(SELECT min(date) FROM public.kb_commission_payments),p_day) AS date
        WHERE NOT EXISTS (SELECT 1 FROM prior)
    )
    SELECT coalesce((SELECT closing_balance FROM prior),0) + coalesce((
        SELECT sum(f.sale_income+f.qist_collected+f.workshop_income-f.expense)
        FROM public.kb_daily_figures(
            coalesce((SELECT date+1 FROM prior),(SELECT date FROM first_activity)),p_day-1,p_timezone
        ) f
    ),0)
$$;

CREATE OR REPLACE FUNCTION public.kb_opening_balance(p_day date)
RETURNS numeric LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
    SELECT public.kb_opening_balance(p_day,'Asia/Muscat')
$$;

CREATE OR REPLACE FUNCTION public.kb_daily_overview(p_day date,p_timezone text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
    WITH figures AS MATERIALIZED (SELECT * FROM public.kb_daily_figures(p_day-29,p_day,p_timezone)),
    current_report AS (
        SELECT p_day AS date,public.kb_opening_balance(p_day,p_timezone) AS opening_balance,f.sale_income,
            f.qist_collected,f.workshop_income,f.expense,f.sale_income+f.qist_collected+f.workshop_income AS total_income
        FROM figures f WHERE f.day=p_day
    )
    SELECT jsonb_build_object(
        'days',(SELECT jsonb_agg(f ORDER BY f.day) FROM figures f),
        'report',coalesce((SELECT to_jsonb(c) FROM public.kb_day_closings c WHERE c.date=p_day),
            (SELECT to_jsonb(r)||jsonb_build_object('closing_balance',r.opening_balance+r.total_income-r.expense,'closed_at',NULL::timestamptz)
                FROM current_report r)),
        'history',coalesce((SELECT jsonb_agg(h ORDER BY h.date DESC) FROM
            (SELECT * FROM public.kb_day_closings WHERE date<=p_day ORDER BY date DESC LIMIT 10) h),'[]'::jsonb),
        'repurchase',coalesce((SELECT jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'quantity',p.quantity,
            'needed',10-p.quantity,'supplier',s.name) ORDER BY p.quantity,lower(p.name),p.id)
            FROM public.kb_spare_parts p LEFT JOIN public.kb_suppliers s ON s.id=p.supplier_id
            WHERE p.quantity<=5 AND p.repurchase_checked_at IS NULL),'[]'::jsonb)
    )
$$;

CREATE OR REPLACE FUNCTION public.kb_close_day(p_day date,p_timezone text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
    saved public.kb_day_closings%ROWTYPE;
    business_day date := (clock_timestamp() AT TIME ZONE p_timezone)::date;
BEGIN
    IF p_day IS NULL OR p_day>business_day OR p_day<date '1900-01-01' THEN
        RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Enter a valid day to close.';
    END IF;
    PERFORM pg_advisory_xact_lock(192747810,-2147483648);
    SELECT * INTO saved FROM public.kb_day_closings WHERE date=p_day;
    IF FOUND THEN RETURN to_jsonb(saved); END IF;
    IF EXISTS (SELECT 1 FROM public.kb_day_closings WHERE date>p_day) THEN
        RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Choose a date after the most recent closed day.';
    END IF;
    INSERT INTO public.kb_day_closings(date,opening_balance,sale_income,qist_collected,workshop_income,expense)
    SELECT p_day,public.kb_opening_balance(p_day,p_timezone),f.sale_income,f.qist_collected,f.workshop_income,f.expense
    FROM public.kb_daily_figures(p_day,p_day,p_timezone) f RETURNING * INTO saved;
    RETURN to_jsonb(saved);
END;
$$;

CREATE OR REPLACE FUNCTION public.kb_guard_closed_day()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
    PERFORM pg_advisory_xact_lock(192747810,-2147483648);
    IF EXISTS (SELECT 1 FROM public.kb_day_closings c WHERE c.date>=NEW.date) THEN
        IF TG_TABLE_NAME='expenses' AND EXISTS (SELECT 1 FROM public.expenses e WHERE e.request_key=NEW.request_key) THEN
            RETURN NEW;
        END IF;
        RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='This day is already included in a closed report.';
    END IF;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.kb_opening_balance(date,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.kb_opening_balance(date,text) TO service_role;

COMMIT;
