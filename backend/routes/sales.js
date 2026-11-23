'use strict';

const express = require('express');
const { problem } = require('../supabase');
const { methods, today, text, money, date, id, requestKey, run } = require('./shared');

module.exports = function sales(db) {
    const router = express.Router();
    router.get('/', run(async (_req, res) => res.json(await db.list('sales'))));
    router.post('/', run(async (req, res) => {
        const data = req.body;
        const method = data.payment_method;
        if (!methods.includes(method)) throw problem(400, 'Select a payment method.');
        const name = text(data.customer_name, 'Customer name', 100, true);
        const phone = text(data.customer_phone, 'Phone', 24, true);
        const cnic = text(data.customer_cnic, 'CNIC', 15);
        if (!/^[0-9+()\s-]+$/.test(phone) || phone.replace(/\D/g, '').length < 7) throw problem(400, 'Enter a valid phone number.');
        if (cnic && !/^(?:\d{13}|\d{5}-\d{7}-\d)$/.test(cnic)) throw problem(400, 'Enter a valid 13-digit CNIC.');
        const sale = { customer_name: name, customer_phone: phone, customer_cnic: cnic,
            bike_price: money(data.sell_price, 'Sell price', { min: .01 }), date: today(),
            payment_method: method, request_key: requestKey(data.request_key) };
        if (method === 'qist') Object.assign(sale, {
            interest_rate: money(data.interest_rate || 0, 'Interest rate', { max: 999.99 }),
            advance: money(data.advance || 0, 'Advance'), monthly_qist: money(data.monthly_qist, 'Monthly Qist', { min: .01 }),
            next_date: date(data.next_date, null)
        });
        const saleId = await db.rpc('kb_sell', { p_bike_id: id(data.bike_id), p_sale: sale });
        res.status(201).json({ id: saleId });
    }));
    return router;
};
