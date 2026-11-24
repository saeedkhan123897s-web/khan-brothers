'use strict';

const express = require('express');
const { problem } = require('../supabase');
const { denied, has } = require('../access');
const { today, text, money, date, id, account, requestKey, run } = require('./shared');

const jobStatuses = ['in_progress','completed','delivered'];
const optionalAmount = (value, label) => value == null || value === '' ? null : money(value, label);
const optionalId = value => value === '' || value == null ? null : id(value);
const hideRates = ({commission_rate,bonus_rate,...row}) => row;

function billAmounts(input) {
    return {
        parts_cost: optionalAmount(input.parts_cost, 'Parts cost'),
        labour_charge: optionalAmount(input.labour_charge, 'Labour charge'),
        labour_cost: optionalAmount(input.labour_cost, 'Labour cost')
    };
}

module.exports = function workshop(db) {
    const router = express.Router();

    router.get('/', run(async (_req, res) => {
        const jobs = await db.list('kb_workshop_jobs');
        res.json((has(res.locals.user,'commission') ? jobs : jobs.map(hideRates)).reverse());
    }));

    router.post('/', run(async (req, res) => {
        const input = req.body;
        const status = input.status ?? 'received';
        if (input.status != null && !jobStatuses.includes(status)) throw problem(400, 'Choose a valid job status.');
        if (!has(res.locals.user,'workshop_status') && ['completed','delivered'].includes(status)) throw denied();
        const phone = text(input.customer_phone, 'Phone', 24);
        if (phone && (!/^[+0-9()\s-]+$/.test(phone) || phone.replace(/\D/g,'').length < 7)) {
            throw problem(400, 'Enter a valid phone number.');
        }
        const changed = date(input.oil_change_on, null);
        const next = date(input.next_oil_change_on, null);
        if (changed && next && next <= changed) throw problem(400, 'Next oil change must be after the last oil change.');
        const mileage = input.mileage === '' || input.mileage == null ? null : Number(input.mileage);
        if (mileage !== null && (!Number.isSafeInteger(mileage) || mileage < 0 || mileage > 2147483647)) {
            throw problem(400, 'Enter a valid mileage.');
        }
        const mechanicId = optionalId(input.mechanic_id);
        const referralId = optionalId(input.referral_id);
        const mechanic = mechanicId ? (await db.list('kb_mechanics',{id:'eq.'+mechanicId}))[0] : null;
        if (mechanicId && !mechanic) throw problem(400,'Select a mechanic.');
        const job = await db.insert('kb_workshop_jobs', {
            request_key: requestKey(input.request_key),
            customer_name: text(input.customer_name, 'Customer name', 100, true),
            customer_phone: phone,
            bike_name: text(input.bike_name, 'Bike', 150, true),
            registration_number: text(input.registration_number, 'Registration number', 40),
            mileage,
            complaints: text(input.complaints, 'Work details', 2000),
            mechanic: mechanic?.name ?? text(input.mechanic, 'Mechanic', 100),
            mechanic_id:mechanicId,referral_id:referralId,
            commission_rate:mechanic?.rate ?? null,bonus_rate:referralId ? 10 : null,
            oil_change_on: changed,
            next_oil_change_on: next,
            estimated_cost: money(input.estimated_cost || 0, 'Estimated cost'),
            status,
            ...billAmounts(input),
            created_on: today()
        });
        res.status(201).json(has(res.locals.user,'commission') ? job : hideRates(job));
    }));

    router.get('/:id/parts',run(async (req,res) => {
        const rows = await db.list('kb_job_parts',{job_id:'eq.'+id(req.params.id)});
        res.json(has(res.locals.user,'commission') ? rows : rows.map(({commission,bonus,unit_cost,...row})=>hideRates(row)));
    }));
    router.patch('/:id/partners',run(async (req,res) => {
        const job = await db.rpc('kb_update_job_partners',{p_id:id(req.params.id),
            p_mechanic:id(req.body.mechanic_id),p_referral:optionalId(req.body.referral_id)});
        res.json(has(res.locals.user,'commission') ? job : hideRates(job));
    }));
    router.post('/:id/parts',run(async (req,res) => {
        const input = req.body;
        const qty = Number(input.quantity);
        if (!/^\d+$/.test(String(input.quantity)) || qty < 1 || qty > 2147483647) throw problem(400,'Enter a valid quantity.');
        const part = {part_id:id(input.part_id),quantity:qty,unit_price:money(input.unit_price,'Unit sale price',{min:.01}),
            commission_rate:optionalAmount(input.commission_rate,'Commission rate'),
            bonus_rate:optionalAmount(input.bonus_rate,'Bonus rate'),
            date:today(),request_key:requestKey(input.request_key)};
        if ([part.commission_rate,part.bonus_rate].some(rate=>rate > 100)) throw problem(400,'Enter a rate from 0 to 100.');
        if (!has(res.locals.user,'commission')) { part.commission_rate = null; part.bonus_rate = null; }
        const result = await db.rpc('kb_add_job_part',{p_id:id(req.params.id),p_part:part});
        if (has(res.locals.user,'commission')) return res.status(201).json(result);
        const {commission,bonus,unit_cost,...line} = result.line;
        res.status(201).json({job:hideRates(result.job),line:hideRates(line)});
    }));

    router.post('/:id/status', run(async (req, res) => {
        const expected = text(req.body.expected, 'Current status', 30, true);
        const next = text(req.body.status, 'Next status', 30, true);
        const job = await db.rpc('kb_workshop_status', { p_job_id: id(req.params.id), p_expected: expected, p_next: next });
        const row=Array.isArray(job) ? job[0] : job;
        res.json(has(res.locals.user,'commission') ? row : hideRates(row));
    }));
    router.post('/:id/cancel', run(async (req, res) => {
        const { returns, refund_account: account } = req.body;
        if (!returns || typeof returns !== 'object' || Array.isArray(returns) ||
            Object.entries(returns).some(([key,value]) => !/^\d+$/.test(key) || !Number.isInteger(value) || value<0 || value>2147483647)) {
            throw problem(400,'Enter valid quantities for returned parts.');
        }
        const refund = money(req.body.refund,'Refund',{max:19999999999.98});
        if (refund>0 && !['cash','bank','wallet'].includes(account)) throw problem(400,'Select a refund account.');
        const job = await db.rpc('kb_cancel_workshop', { p_job_id:id(req.params.id),p_cancel:{
            expected:text(req.body.expected,'Current status',30,true),returns,refund,refund_account:refund ? account : null,
            reason:text(req.body.reason,'Cancellation reason',250,true),date:today(),request_key:requestKey(req.body.request_key)
        } });
        res.json(has(res.locals.user,'commission') ? job : hideRates(job));
    }));
    router.patch('/:id/bill', run(async (req, res) => {
        const { parts_cost, labour_charge, labour_cost } = billAmounts(req.body);
        const row=await db.rpc('kb_workshop_bill', { p_job_id:id(req.params.id),
            p_parts_cost:parts_cost, p_labour_charge:labour_charge, p_labour_cost:labour_cost });
        res.json(has(res.locals.user,'commission') ? row : hideRates(row));
    }));
    router.post('/:id/payments', run(async (req, res) => {
        const payment = {
            amount: money(req.body.amount, 'Amount collected', { min:.01, max:19999999999.98 }),
            account: account(req.body.account), date: today(), request_key: requestKey(req.body.request_key)
        };
        const result=await db.rpc('kb_collect_workshop', { p_job_id:id(req.params.id), p_payment:payment });
        res.status(201).json(has(res.locals.user,'commission') ? result : {...result,job:hideRates(result.job)});
    }));
    router.patch('/:id/labour', run(async (req, res) => {
        const row=await db.rpc('kb_record_labour', {
            p_job_id: id(req.params.id),
            p_charge: money(req.body.labour_charge, 'Labour charge'),
            p_cost: money(req.body.labour_cost, 'Labour cost')
        });
        res.json(has(res.locals.user,'commission') ? row : hideRates(row));
    }));

    return router;
};
