'use strict';

const express = require('express');
const { problem } = require('../supabase');
const { today, text, money, date, id, requestKey, run } = require('./shared');

const jobStatuses = ['in_progress','completed','delivered'];
const optionalAmount = (value, label) => value == null || value === '' ? null : money(value, label);

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
        res.json(jobs.reverse());
    }));

    router.post('/', run(async (req, res) => {
        const input = req.body;
        const status = input.status ?? 'received';
        if (input.status != null && !jobStatuses.includes(status)) throw problem(400, 'Choose a valid job status.');
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
        const job = await db.insert('kb_workshop_jobs', {
            request_key: requestKey(input.request_key),
            customer_name: text(input.customer_name, 'Customer name', 100, true),
            customer_phone: phone,
            bike_name: text(input.bike_name, 'Bike', 150, true),
            registration_number: text(input.registration_number, 'Registration number', 40),
            mileage,
            complaints: text(input.complaints, 'Work details', 2000),
            mechanic: text(input.mechanic, 'Mechanic', 100),
            oil_change_on: changed,
            next_oil_change_on: next,
            estimated_cost: money(input.estimated_cost || 0, 'Estimated cost'),
            status,
            ...billAmounts(input),
            created_on: today()
        });
        res.status(201).json(job);
    }));

    router.post('/:id/status', run(async (req, res) => {
        const expected = text(req.body.expected, 'Current status', 30, true);
        const next = text(req.body.status, 'Next status', 30, true);
        const job = await db.rpc('kb_workshop_status', { p_job_id: id(req.params.id), p_expected: expected, p_next: next });
        res.json(Array.isArray(job) ? job[0] : job);
    }));
    router.patch('/:id/bill', run(async (req, res) => {
        const { parts_cost, labour_charge, labour_cost } = billAmounts(req.body);
        res.json(await db.rpc('kb_workshop_bill', { p_job_id:id(req.params.id),
            p_parts_cost:parts_cost, p_labour_charge:labour_charge, p_labour_cost:labour_cost }));
    }));
    router.post('/:id/payments', run(async (req, res) => {
        const payment = {
            amount: money(req.body.amount, 'Amount collected', { min:.01, max:19999999999.98 }),
            date: today(), request_key: requestKey(req.body.request_key)
        };
        res.status(201).json(await db.rpc('kb_collect_workshop', { p_job_id:id(req.params.id), p_payment:payment }));
    }));
    router.patch('/:id/labour', run(async (req, res) => {
        res.json(await db.rpc('kb_record_labour', {
            p_job_id: id(req.params.id),
            p_charge: money(req.body.labour_charge, 'Labour charge'),
            p_cost: money(req.body.labour_cost, 'Labour cost')
        }));
    }));

    return router;
};
