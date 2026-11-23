'use strict';

const express = require('express');
const { today, money, date, id, requestKey, run } = require('./shared');

module.exports = function qist(db) {
    const router = express.Router();
    router.get('/', run(async (_req, res) => res.json(await db.list('qist'))));
    router.post('/:id/payments', run(async (req, res) => {
        const payment = { amount: money(req.body.amount, 'Amount collected', { min: .01 }),
            next_date: date(req.body.next_date, null), date: today(), request_key: requestKey(req.body.request_key) };
        const paymentId = await db.rpc('kb_collect', { p_qist_id: id(req.params.id), p_payment: payment });
        res.status(201).json({ id: paymentId });
    }));
    return router;
};
