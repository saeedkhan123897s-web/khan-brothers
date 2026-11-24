BEGIN;

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
        SELECT p.date,p.revenue,0,0,p.revenue-p.unit_cost*p.quantity-p.commission-p.bonus,0,0
        FROM public.kb_job_parts p WHERE p.date BETWEEN p_from AND p_to
        UNION ALL
        SELECT p.date,0,0,p.amount,0,0,0 FROM public.kb_commission_payments p WHERE p.date BETWEEN p_from AND p_to
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

CREATE OR REPLACE FUNCTION public.kb_snapshot()
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
    WITH sources(position, source, amount) AS (
        VALUES
            (1, 'bike', (SELECT coalesce(sum(s.profit), 0) FROM public.sales s)),
            (2, 'parts', (SELECT coalesce(sum(p.profit), 0) FROM public.kb_spare_part_sales p) +
                (SELECT coalesce(sum(p.revenue-p.unit_cost*p.quantity-p.commission-p.bonus),0) FROM public.kb_job_parts p)),
            (3, 'labour', (SELECT coalesce(sum(j.labour_charge - j.labour_cost), 0) FROM public.kb_workshop_jobs j
                WHERE j.status IN ('completed','delivered')))
    )
    SELECT jsonb_build_object(
        'bikes', coalesce((SELECT jsonb_agg(b order by b.id) FROM public.bikes b),'[]'::jsonb),
        'sales', coalesce((SELECT jsonb_agg(s order by s.id) FROM public.sales s),'[]'::jsonb),
        'customers', coalesce((SELECT jsonb_agg(c order by c.id) FROM public.customers c),'[]'::jsonb),
        'qist', coalesce((SELECT jsonb_agg(q order by q.id) FROM public.qist q),'[]'::jsonb),
        'expenses', coalesce((SELECT jsonb_agg(e order by e.id) FROM public.expenses e),'[]'::jsonb),
        'settings', (SELECT to_jsonb(s) FROM public.kb_business_settings s WHERE s.id = 1),
        'profit', (SELECT jsonb_object_agg(source, amount) || jsonb_build_object(
            'net', sum(amount),
            'leading', coalesce((SELECT jsonb_agg(s.source ORDER BY s.position) FROM sources s
                WHERE s.amount > 0 AND s.amount = (SELECT max(amount) FROM sources)), '[]'::jsonb)
        ) FROM sources)
    )
$$;

CREATE OR REPLACE FUNCTION public.kb_profit_entries()
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
    WITH entries AS (
        SELECT 'bike' AS source, s.id, b.bike_name AS item, s.salesman AS person, s.date,
            1 AS quantity, s.sell_price AS revenue, s.cost_at_sale AS cost, s.profit,
            s.customer_name AS customer, b.purchase_price, b.repair_cost, b.other_cost, b.chassis_no,
            NULL::text AS sku, NULL::numeric AS unit_cost, NULL::numeric AS unit_price
        FROM public.sales s JOIN public.bikes b ON b.id = s.bike_id
        UNION ALL
        SELECT 'parts', s.id, p.name, s.salesman, s.date, s.quantity, s.unit_price * s.quantity,
            s.unit_cost * s.quantity, s.profit, NULL, NULL, NULL, NULL, NULL, p.sku, s.unit_cost, s.unit_price
        FROM public.kb_spare_part_sales s JOIN public.kb_spare_parts p ON p.id = s.part_id
        UNION ALL
        SELECT 'parts',-p.id,p.part_name,m.name,p.date,p.quantity,p.revenue,
            p.unit_cost*p.quantity+p.commission+p.bonus,p.revenue-p.unit_cost*p.quantity-p.commission-p.bonus,
            j.customer_name,NULL,NULL,NULL,NULL,s.sku,p.unit_cost,p.unit_price
        FROM public.kb_job_parts p JOIN public.kb_mechanics m ON m.id=p.mechanic_id
        JOIN public.kb_workshop_jobs j ON j.id=p.job_id JOIN public.kb_spare_parts s ON s.id=p.part_id
        UNION ALL
        SELECT 'labour', j.id, j.bike_name, j.mechanic, j.created_on, 1, j.labour_charge, j.labour_cost,
            j.labour_charge - j.labour_cost, j.customer_name, NULL, NULL, NULL, NULL, NULL, NULL, NULL
        FROM public.kb_workshop_jobs j
        WHERE j.status IN ('completed','delivered') AND j.labour_charge IS NOT NULL AND j.labour_cost IS NOT NULL
    )
    SELECT coalesce(jsonb_agg(entries ORDER BY date DESC, source, id DESC), '[]'::jsonb) FROM entries
$$;

CREATE OR REPLACE FUNCTION public.kb_dashboard_series(p_from date,p_day date,p_timezone text,p_monthly boolean)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
    WITH extras(day,part_sales,commission,bonus,bike_cost,bike_price) AS (
        SELECT p.date,p.unit_price*p.quantity,0,0,0,0
        FROM public.kb_spare_part_sales p WHERE p.date BETWEEN p_from AND p_day
        UNION ALL
        SELECT p.date,p.revenue,p.commission,p.bonus,0,0 FROM public.kb_job_parts p WHERE p.date BETWEEN p_from AND p_day
        UNION ALL
        SELECT s.date,0,0,0,s.cost_at_sale,s.sell_price FROM public.sales s WHERE s.date BETWEEN p_from AND p_day
    ), extra_days AS (
        SELECT e.day,sum(e.part_sales) AS part_sales,sum(e.commission) AS commission,sum(e.bonus) AS bonus,
            sum(e.bike_cost) AS bike_cost,sum(e.bike_price) AS bike_price FROM extras e GROUP BY e.day
    ), period AS (
        SELECT CASE WHEN p_monthly THEN date_trunc('month',f.day::timestamp)::date ELSE f.day END AS day,
            sum(f.sale) AS sale,sum(f.expense) AS expense,sum(f.profit) AS profit,sum(f.qist_collected) AS qist_collected,
            sum(f.workshop_income) AS workshop_income,coalesce(sum(e.part_sales),0) AS part_sales,
            coalesce(sum(e.commission),0) AS commission,coalesce(sum(e.bonus),0) AS bonus,
            coalesce(sum(e.bike_cost),0) AS bike_cost,coalesce(sum(e.bike_price),0) AS bike_price
        FROM public.kb_daily_figures(p_from,p_day,p_timezone) f LEFT JOIN extra_days e ON e.day=f.day
        GROUP BY 1
    )
    SELECT coalesce(jsonb_agg(p ORDER BY p.day),'[]'::jsonb) FROM period p
$$;

CREATE OR REPLACE FUNCTION public.kb_dashboard_overview(p_day date,p_timezone text,p_range text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
    WITH oldest AS (
        SELECT least(
            (SELECT min(date) FROM public.sales),(SELECT min(date) FROM public.expenses),
            (SELECT min(date) FROM public.kb_spare_part_sales),(SELECT min(date) FROM public.kb_job_parts),
            (SELECT min(date) FROM public.kb_workshop_payments),(SELECT min(date) FROM public.kb_commission_payments),
            (SELECT min(date) FROM public.qist_payments),
            (SELECT min(coalesce((ready_at AT TIME ZONE p_timezone)::date,created_on)) FROM public.kb_workshop_jobs
                WHERE status IN ('completed','delivered') AND labour_charge IS NOT NULL AND labour_cost IS NOT NULL),p_day
        ) AS day WHERE p_range='all'
    )
    SELECT jsonb_build_object(
        'rows',public.kb_dashboard_series(CASE p_range WHEN 'today' THEN p_day WHEN '7' THEN p_day-6
            WHEN 'all' THEN (SELECT day FROM oldest) ELSE p_day-29 END,p_day,p_timezone,p_range='all'),
        'weeks',public.kb_dashboard_series(date_trunc('week',p_day::timestamp)::date-7,p_day,p_timezone,false),
        'investment',(SELECT coalesce(sum(amount),0) FROM public.kb_investments WHERE date<=p_day)
    )
$$;

CREATE OR REPLACE FUNCTION public.kb_capital_report(p_day date,p_timezone text,p_year integer)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
    WITH period AS (
        SELECT make_date(p_year,1,1) AS first_day,least(make_date(p_year,12,31),p_day) AS last_day
    ), invested AS (
        SELECT i.*,sum(i.amount) OVER(ORDER BY i.date,i.id) AS running_total
        FROM public.kb_investments i WHERE i.date <= p_day
    ), earnings AS (
        SELECT extract(month FROM f.day)::int AS month,sum(f.profit) AS profit
        FROM period p CROSS JOIN LATERAL public.kb_daily_figures(p.first_day,p.last_day,p_timezone) f GROUP BY 1
    ), monthly AS (
        SELECT make_date(p_year,m,1) AS day,coalesce(e.profit,0) AS profit,
            coalesce((SELECT sum(i.amount) FROM invested i WHERE extract(year FROM i.date)=p_year AND extract(month FROM i.date)=m),0) AS investment
        FROM generate_series(1,12) m LEFT JOIN earnings e ON e.month=m
    ), overall AS (
        SELECT coalesce((SELECT sum(amount) FROM invested),0) AS investment,
            coalesce(((public.kb_snapshot()->'profit'->>'net')::numeric),0) -
            coalesce((SELECT sum(amount) FROM public.expenses WHERE date <= p_day),0) AS profit
    )
    SELECT jsonb_build_object(
        'investments',coalesce((SELECT jsonb_agg(i ORDER BY i.date,i.id) FROM invested i),'[]'::jsonb),
        'months',(SELECT jsonb_agg(m ORDER BY m.day) FROM monthly m),
        'total',(SELECT to_jsonb(o) || jsonb_build_object('funds',o.investment+o.profit) FROM overall o),
        'year',(SELECT jsonb_build_object('investment',sum(m.investment),'profit',sum(m.profit),
            'funds',sum(m.investment)+sum(m.profit),'return_rate',100*sum(m.profit)/nullif(sum(m.investment),0)) FROM monthly m)
    )
$$;

REVOKE ALL ON FUNCTION public.kb_dashboard_series(date,date,text,boolean),public.kb_dashboard_overview(date,text,text),
    public.kb_capital_report(date,text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.kb_dashboard_series(date,date,text,boolean),public.kb_dashboard_overview(date,text,text),
    public.kb_capital_report(date,text,integer) TO service_role;

COMMIT;
