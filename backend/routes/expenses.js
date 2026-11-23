'use strict';

const express = require('express');
const { problem } = require('../supabase');
const { expenseTypes, today, text, money, date, requestKey, run } = require('./shared');

module.exports = function expenses(db) {
    const router = express.Router();
    router.get('/', run(async (_req, res) => res.json(await db.list('expenses'))));
    router.post('/', run(async (req, res) => {
        const type = req.body.type;
        if (!expenseTypes.includes(type)) throw problem(400, 'Select an expense category.');
        res.status(201).json(await db.insert('expenses', { type, amount: money(req.body.amount, 'Expense amount', { min: .01 }),
            date: date(req.body.date, today()), description: text(req.body.description, 'Description', 250), request_key: requestKey(req.body.request_key) }));
    }));
    return router;
};
