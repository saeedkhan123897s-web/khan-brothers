BEGIN;
SET LOCAL ROLE service_role;

DO $$
DECLARE
    bike_id bigint;
    created_sale bigint;
    plan_id bigint;
    pay_key uuid := gen_random_uuid();
    plan public.qist%ROWTYPE;
    date_one date := date '2020-01-02';
BEGIN
    INSERT INTO public.bikes(bike_name,model,purchase_price) VALUES('Test Bike','2025',20000) RETURNING id INTO bike_id;
    created_sale := public.kb_sell(bike_id,jsonb_build_object('customer_name','Test Rider','customer_phone','03000000000',
        'bike_price',30000,'payment_method','qist','advance',1000,'advance_account','cash','monthly_qist',5000,
        'next_date',date_one,'date',date_one,'request_key',gen_random_uuid()));
    SELECT id INTO plan_id FROM public.qist q WHERE q.sale_id=created_sale;
    PERFORM public.kb_collect(plan_id,jsonb_build_object('request_key',pay_key,'amount',2500,'date',date_one,'account','bank'));
    PERFORM public.kb_collect(plan_id,jsonb_build_object('request_key',pay_key,'amount',2500,'date',date_one,'account','bank'));
    SELECT * INTO plan FROM public.qist WHERE id=plan_id;
    IF plan.next_date IS DISTINCT FROM date_one OR plan.remaining IS DISTINCT FROM 26500 THEN
        RAISE EXCEPTION 'First split Qist or its retry incorrectly updated %',plan;
    END IF;
    PERFORM public.kb_collect(plan_id,jsonb_build_object('request_key',gen_random_uuid(),'amount',2500,'date',date_one+1,'account','bank'));
    SELECT * INTO plan FROM public.qist WHERE id=plan_id;
    IF plan.next_date IS DISTINCT FROM date '2020-02-02' OR plan.remaining IS DISTINCT FROM 24000 THEN
        RAISE EXCEPTION 'Split Qist did not advance the due date %',plan;
    END IF;
END;
$$;
ROLLBACK;

BEGIN;
SET LOCAL ROLE service_role;
DO $$
DECLARE
    report jsonb;
    skipped_day date := date '2020-02-02';
BEGIN
    INSERT INTO public.kb_day_closings(date,opening_balance,sale_income,qist_collected,workshop_income,expense)
    VALUES (skipped_day-1,10000,0,0,0,0);
    INSERT INTO public.expenses(type,amount,date) VALUES ('Other',500,skipped_day);
    report := public.kb_daily_overview(skipped_day+1,'Asia/Muscat');
    IF (report->'report'->>'opening_balance')::numeric IS DISTINCT FROM 9500 THEN
        RAISE EXCEPTION 'Opening lost the skipped day expense %',report->'report';
    END IF;
    report := public.kb_close_day(skipped_day,'Asia/Muscat');
    IF (report->>'closing_balance')::numeric IS DISTINCT FROM 9500 THEN
        RAISE EXCEPTION 'An earlier day failed to close %',report;
    END IF;
    BEGIN
        INSERT INTO public.expenses(type,amount,date) VALUES ('Other',10,skipped_day);
        RAISE EXCEPTION 'A closed day accepted a new expense';
    EXCEPTION WHEN invalid_parameter_value THEN NULL;
    END;
END;
$$;
ROLLBACK;

BEGIN;
SET LOCAL ROLE service_role;
DO $$
DECLARE
    mechanic_id bigint;
    referral_id bigint;
    part_id bigint;
    created_job bigint;
    line_id bigint;
    void_data jsonb;
    work_day date := date '2020-03-01';
    job jsonb;
BEGIN
    INSERT INTO public.kb_mechanics(request_key,name) VALUES(gen_random_uuid(),'Test Mechanic') RETURNING id INTO mechanic_id;
    INSERT INTO public.kb_referral_workshops(request_key,name,owner,phone)
    VALUES(gen_random_uuid(),'Test Workshop','Test Owner','03000000000') RETURNING id INTO referral_id;
    INSERT INTO public.kb_spare_parts(request_key,name,sku,quantity,unit_cost,sell_price)
    VALUES(gen_random_uuid(),'Test Part','CANCEL',10,600,1000) RETURNING id INTO part_id;
    INSERT INTO public.kb_workshop_jobs(request_key,customer_name,bike_name,status,mechanic_id,referral_id,created_on)
    VALUES(gen_random_uuid(),'Test Customer','Test Bike','in_progress',mechanic_id,referral_id,work_day) RETURNING id INTO created_job;
    line_id := (public.kb_add_job_part(created_job,jsonb_build_object('request_key',gen_random_uuid(),'part_id',part_id,
        'quantity',2,'unit_price',1000,'commission_rate',15,'bonus_rate',10,'date',work_day))->'line'->>'id')::bigint;
    PERFORM public.kb_collect_workshop(created_job,jsonb_build_object('request_key',gen_random_uuid(),'amount',500,'date',work_day,'account','cash'));
    BEGIN
        PERFORM public.kb_workshop_status(created_job,'in_progress','cancelled');
        RAISE EXCEPTION 'Workshop status bypassed cancellation adjustment';
    EXCEPTION WHEN invalid_parameter_value THEN NULL;
    END;
    void_data := jsonb_build_object('request_key',gen_random_uuid(),'expected','in_progress','date',work_day+1,
        'reason','Customer declined repair','refund',500,'refund_account','cash','returns',jsonb_build_object(line_id::text,1));
    job := public.kb_cancel_workshop(created_job,void_data);
    PERFORM public.kb_cancel_workshop(created_job,void_data);
    IF job->>'status' <> 'cancelled' OR (SELECT quantity FROM public.kb_spare_parts WHERE id=part_id) IS DISTINCT FROM 9 THEN
        RAISE EXCEPTION 'Workshop cancellation did not restore exactly one unused part';
    END IF;
    IF (SELECT sum(commission+bonus) FROM public.kb_job_part_postings p WHERE p.job_id=created_job) IS DISTINCT FROM 0 OR
        (SELECT sum(revenue-total_cost-commission-bonus) FROM public.kb_job_part_postings p WHERE p.job_id=created_job) IS DISTINCT FROM -600 THEN
        RAISE EXCEPTION 'Workshop cancellation did not reverse partner commission and recognize consumed stock';
    END IF;
    IF (SELECT workshop_income FROM public.kb_daily_figures(work_day+1,work_day+1,'Asia/Muscat')) IS DISTINCT FROM -500 THEN
        RAISE EXCEPTION 'Refund did not reduce the cash received';
    END IF;
END;
$$;
ROLLBACK;

BEGIN;
SET LOCAL ROLE service_role;
DO $$
DECLARE
    current_day date := date '2020-04-01';
    supplier_id bigint;
    part_id bigint;
    bill_id bigint;
    supply jsonb;
    payment jsonb;
BEGIN
    PERFORM set_config('request.headers','{"x-kb-actor":"fixture-user"}',true);
    INSERT INTO public.kb_suppliers(request_key,name) VALUES(gen_random_uuid(),'Test Supplier') RETURNING id INTO supplier_id;
    INSERT INTO public.kb_spare_parts(request_key,name,sku,quantity,unit_cost,sell_price)
    VALUES(gen_random_uuid(),'Test Part','RESTOCK',2,100,180) RETURNING id INTO part_id;
    supply := jsonb_build_object('request_key',gen_random_uuid(),'supplier_id',supplier_id,'part_id',part_id,
        'quantity',2,'date',current_day,'description','Test invoice','amount',280);
    bill_id := (public.kb_add_supplier_bill(supply)->>'id')::bigint;
    PERFORM public.kb_add_supplier_bill(supply);
    IF NOT EXISTS (SELECT 1 FROM public.kb_spare_parts WHERE id=part_id AND quantity=4 AND unit_cost=120) THEN
        RAISE EXCEPTION 'Stock receipt or weighted cost is wrong';
    END IF;
    INSERT INTO public.kb_cash_openings(request_key,account,date,amount,note)
    VALUES(gen_random_uuid(),'bank',current_day,1000,'Verified bank opening');
    payment := jsonb_build_object('request_key',gen_random_uuid(),'date',current_day,'amount',230,'account','bank');
    PERFORM public.kb_pay_supplier_bill(bill_id,payment);
    PERFORM public.kb_pay_supplier_bill(bill_id,payment);
    IF (public.kb_supplier_ledger()->>'balance')::numeric IS DISTINCT FROM 50 OR
        (SELECT (b->>'amount')::numeric FROM jsonb_array_elements(public.kb_cashbook(current_day,current_day)->'balances') b
            WHERE b->>'account'='bank') IS DISTINCT FROM 770 THEN
        RAISE EXCEPTION 'Payables and bank ledger disagree';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.kb_audit_log WHERE actor='fixture-user' AND resource='kb_supplier_payments') THEN
        RAISE EXCEPTION 'Supplier payment was not recorded in the audit log';
    END IF;
END;
$$;
ROLLBACK;
