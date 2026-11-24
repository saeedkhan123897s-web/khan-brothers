BEGIN;

-- Separate ADD and DEFAULT keep existing transactions out of the new activity feed.
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS recorded_at timestamptz;
ALTER TABLE public.sales ALTER COLUMN recorded_at SET DEFAULT clock_timestamp();
ALTER TABLE public.qist_payments ADD COLUMN IF NOT EXISTS recorded_at timestamptz;
ALTER TABLE public.qist_payments ALTER COLUMN recorded_at SET DEFAULT clock_timestamp();
ALTER TABLE public.kb_spare_part_sales ADD COLUMN IF NOT EXISTS recorded_at timestamptz;
ALTER TABLE public.kb_spare_part_sales ALTER COLUMN recorded_at SET DEFAULT clock_timestamp();
ALTER TABLE public.kb_workshop_jobs ADD COLUMN IF NOT EXISTS ready_at timestamptz;

CREATE OR REPLACE FUNCTION public.kb_stamp_workshop_ready()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
    NEW.ready_at := clock_timestamp();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS kb_stamp_workshop_ready ON public.kb_workshop_jobs;
CREATE TRIGGER kb_stamp_workshop_ready BEFORE UPDATE OF status ON public.kb_workshop_jobs
FOR EACH ROW WHEN (NEW.status = 'completed' AND OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION public.kb_stamp_workshop_ready();

CREATE INDEX IF NOT EXISTS kb_sales_recorded_idx ON public.sales(recorded_at) WHERE recorded_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS kb_qist_payments_recorded_idx ON public.qist_payments(recorded_at) WHERE recorded_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS kb_spare_part_sales_recorded_idx ON public.kb_spare_part_sales(recorded_at) WHERE recorded_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS kb_spare_part_sales_date_idx ON public.kb_spare_part_sales(date);
CREATE INDEX IF NOT EXISTS kb_workshop_ready_idx ON public.kb_workshop_jobs(ready_at) WHERE ready_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS kb_expenses_date_idx ON public.expenses(date);

CREATE OR REPLACE FUNCTION public.kb_notification_feed(p_timezone text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
    WITH clock AS (
        SELECT statement_timestamp() AS observed_at, statement_timestamp() AT TIME ZONE p_timezone AS local_time
    ), bounds AS (
        SELECT observed_at, local_time::date AS today,
            local_time::date - CASE WHEN local_time::time < time '21:00' THEN 1 ELSE 0 END AS summary_day
        FROM clock
    ), activity AS (
        SELECT 'sale:' || s.id AS id, 'sale' AS kind, s.recorded_at AS at,
            jsonb_build_object('item', b.bike_name, 'amount', s.sell_price) AS values
        FROM public.sales s JOIN public.bikes b ON b.id = s.bike_id, bounds
        WHERE s.recorded_at >= bounds.observed_at - interval '7 days'
        UNION ALL
        SELECT 'part-sale:' || s.id, 'sale', s.recorded_at,
            jsonb_build_object('item', p.name, 'amount', s.unit_price * s.quantity)
        FROM public.kb_spare_part_sales s JOIN public.kb_spare_parts p ON p.id = s.part_id, bounds
        WHERE s.recorded_at >= bounds.observed_at - interval '7 days'
        UNION ALL
        SELECT 'qist-payment:' || p.id, 'qist-payment', p.recorded_at,
            jsonb_build_object('customer', s.customer_name, 'amount', p.amount)
        FROM public.qist_payments p JOIN public.qist q ON q.id = p.qist_id
        JOIN public.sales s ON s.id = q.sale_id, bounds
        WHERE p.recorded_at >= bounds.observed_at - interval '7 days'
        UNION ALL
        SELECT 'ready:' || j.id, 'ready', j.ready_at,
            jsonb_build_object('bike', j.bike_name, 'job', j.id)
        FROM public.kb_workshop_jobs j, bounds
        WHERE j.ready_at >= bounds.observed_at - interval '7 days'
    ), reminders AS (
        SELECT q.id, q.next_date, q.remaining, s.customer_name, b.bike_name,
            CASE WHEN q.next_date = bounds.today THEN 'due-today'
                WHEN q.next_date = bounds.today + 1 THEN 'due-tomorrow' ELSE 'overdue' END AS kind,
            bounds.today - q.next_date AS days
        FROM public.qist q JOIN public.sales s ON s.id = q.sale_id
        JOIN public.bikes b ON b.id = s.bike_id, bounds
        WHERE q.remaining > 0 AND (q.next_date IN (bounds.today, bounds.today + 1) OR q.next_date < bounds.today - 7)
    )
    SELECT jsonb_build_object(
        'now', bounds.observed_at,
        'timeZone', p_timezone,
        'nextSummary', ((bounds.summary_day + 1) + time '21:00') AT TIME ZONE p_timezone,
        'activity', coalesce((SELECT jsonb_agg(recent ORDER BY recent.at DESC, recent.id DESC)
            FROM (SELECT * FROM activity ORDER BY at DESC, id DESC LIMIT 100) recent), '[]'::jsonb),
        'reminders', coalesce((SELECT jsonb_agg(r ORDER BY r.next_date, r.id) FROM reminders r), '[]'::jsonb),
        'bikeStock', (SELECT count(*) FROM public.bikes WHERE status = 'stock'),
        'lowParts', coalesce((SELECT jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'quantity', p.quantity) ORDER BY p.id)
            FROM public.kb_spare_parts p WHERE p.quantity <= 5), '[]'::jsonb),
        'summary', (SELECT jsonb_build_object(
            'day', bounds.summary_day,
            'at', (bounds.summary_day + time '21:00') AT TIME ZONE p_timezone,
            'sales', coalesce(sum(s.sell_price), 0) + (SELECT coalesce(sum(p.unit_price * p.quantity), 0)
                FROM public.kb_spare_part_sales p WHERE p.date = bounds.summary_day),
            'cash', coalesce(sum(s.sell_price) FILTER (WHERE s.payment_method = 'cash'), 0),
            'expenses', (SELECT coalesce(sum(e.amount), 0) FROM public.expenses e WHERE e.date = bounds.summary_day)
        ) FROM public.sales s WHERE s.date = bounds.summary_day)
    ) FROM bounds
$$;

REVOKE ALL ON FUNCTION public.kb_stamp_workshop_ready(), public.kb_notification_feed(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.kb_stamp_workshop_ready(), public.kb_notification_feed(text) TO service_role;

COMMIT;
