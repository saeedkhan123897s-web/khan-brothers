BEGIN;

ALTER TABLE public.sales
    ADD COLUMN IF NOT EXISTS salesman text CHECK (length(trim(salesman)) BETWEEN 1 AND 100);
ALTER TABLE public.kb_spare_part_sales
    ADD COLUMN IF NOT EXISTS salesman text CHECK (length(trim(salesman)) BETWEEN 1 AND 100);
GRANT UPDATE (salesman) ON public.kb_spare_part_sales TO service_role;

CREATE OR REPLACE FUNCTION public.kb_sell(p_bike_id bigint, p_sale jsonb)
RETURNS bigint LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
    bike public.bikes%ROWTYPE;
    buyer_id bigint;
    sale_id bigint;
    request_id uuid := (p_sale->>'request_key')::uuid;
    base_price numeric(12,2) := (p_sale->>'bike_price')::numeric;
    method text := p_sale->>'payment_method';
    rate numeric(5,2) := CASE WHEN method = 'qist' THEN coalesce((p_sale->>'interest_rate')::numeric,0) ELSE 0 END;
    interest numeric(14,2) := round(base_price * rate / 100,2);
    total numeric(14,2) := base_price + interest;
    advance numeric(14,2) := coalesce((p_sale->>'advance')::numeric,0);
    monthly numeric(14,2) := (p_sale->>'monthly_qist')::numeric;
    today date := (p_sale->>'date')::date;
    due date := (p_sale->>'next_date')::date;
BEGIN
    SELECT * INTO bike FROM public.bikes WHERE id = p_bike_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='Bike not found.'; END IF;
    SELECT id INTO sale_id FROM public.sales WHERE request_key=request_id AND bike_id=p_bike_id;
    IF FOUND THEN RETURN sale_id; END IF;
    IF bike.status <> 'stock' THEN RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='This bike is already sold.'; END IF;

    IF method = 'qist' AND (advance >= total OR monthly IS NULL OR monthly > total - advance OR due IS NULL OR due < today) THEN
        RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Enter a valid advance, monthly Qist and next payment date.';
    END IF;

    INSERT INTO public.customers (name,phone,cnic) VALUES (p_sale->>'customer_name',p_sale->>'customer_phone',p_sale->>'customer_cnic')
    ON CONFLICT (phone_key) DO UPDATE SET cnic=coalesce(public.customers.cnic,excluded.cnic)
    RETURNING id INTO buyer_id;

    INSERT INTO public.sales (bike_id,customer_id,customer_name,customer_phone,customer_cnic,bike_price,interest_rate,
        interest_amount,sell_price,cost_at_sale,payment_method,date,request_key,salesman)
    VALUES (bike.id,buyer_id,p_sale->>'customer_name',p_sale->>'customer_phone',p_sale->>'customer_cnic',base_price,rate,
        interest,total,bike.total_cost,method,today,request_id,p_sale->>'salesman') RETURNING id INTO sale_id;

    IF method = 'qist' THEN
        INSERT INTO public.qist (sale_id,total,advance,remaining,monthly_qist,next_date)
        VALUES (sale_id,total,advance,total-advance,monthly,due);
    END IF;
    UPDATE public.bikes SET status='sold' WHERE id=bike.id;
    RETURN sale_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.kb_sell_spare_part(p_part_id bigint, p_sale jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
    part public.kb_spare_parts%ROWTYPE;
    sale public.kb_spare_part_sales%ROWTYPE;
    request_id uuid := (p_sale->>'request_key')::uuid;
    requested_quantity integer := (p_sale->>'quantity')::integer;
    price numeric(12,2) := (p_sale->>'unit_price')::numeric;
BEGIN
    SELECT * INTO part FROM public.kb_spare_parts WHERE id = p_part_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='Spare part not found.';
    END IF;
    SELECT * INTO sale FROM public.kb_spare_part_sales WHERE request_key = request_id;
    IF FOUND THEN
        IF sale.part_id <> part.id OR sale.quantity <> requested_quantity OR sale.unit_price <> price THEN
            RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='This sale request was already used.';
        END IF;
    ELSE
        IF requested_quantity IS NULL OR requested_quantity < 1 OR requested_quantity > part.quantity THEN
            RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Sale quantity must be within available stock.';
        END IF;
        INSERT INTO public.kb_spare_part_sales (request_key, part_id, quantity, unit_cost, unit_price, date, salesman)
        VALUES (request_id, part.id, requested_quantity, part.unit_cost, price, (p_sale->>'date')::date, p_sale->>'salesman')
        RETURNING * INTO sale;
        UPDATE public.kb_spare_parts SET quantity = quantity - requested_quantity WHERE id = part.id RETURNING * INTO part;
    END IF;
    RETURN jsonb_build_object('sale_id', sale.id, 'part', to_jsonb(part));
END;
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
        SELECT 'labour', j.id, j.bike_name, j.mechanic, j.created_on, 1, j.labour_charge, j.labour_cost,
            j.labour_charge - j.labour_cost, j.customer_name, NULL, NULL, NULL, NULL, NULL, NULL, NULL
        FROM public.kb_workshop_jobs j
        WHERE j.status IN ('completed','delivered') AND j.labour_charge IS NOT NULL AND j.labour_cost IS NOT NULL
    )
    SELECT coalesce(jsonb_agg(entries ORDER BY date DESC, source, id DESC), '[]'::jsonb) FROM entries
$$;

REVOKE ALL ON FUNCTION public.kb_profit_entries() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.kb_profit_entries() TO service_role;

COMMIT;
