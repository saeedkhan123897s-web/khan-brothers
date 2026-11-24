'use strict';

const express = require('express');
const { problem } = require('../supabase');
const { today, text, money, id, account, requestKey, run } = require('./shared');

function choice(value, allowed, message) {
    if (!allowed.includes(value)) throw problem(400, message);
    return value;
}

function quantity(value, min = 0) {
    if (!/^\d+$/.test(String(value)) || Number(value) < min || Number(value) > 2147483647) {
        throw problem(400, 'Enter a valid quantity.');
    }
    return Number(value);
}

const directories = {
    suppliers: {
        table: 'kb_suppliers',
        fields: body => ({
            name: text(body.name, 'Supplier name', 100, true),
            phone: text(body.phone, 'Phone', 24),
            company: text(body.company, 'Company', 100),
            address: text(body.address, 'Address', 250)
        })
    },
    parts: {
        table: 'kb_spare_parts',
        fields: body => ({
            name: text(body.name, 'Part name', 100, true),
            sku: text(body.sku, 'SKU', 60, true).toUpperCase(),
            supplier_id: body.supplier_id ? id(body.supplier_id) : null,
            quantity: quantity(body.quantity),
            unit_cost: money(body.unit_cost, 'Unit cost'),
            sell_price: money(body.sell_price, 'Sell price')
        })
    },
    staff: {
        table: 'kb_staff_members',
        fields: body => ({
            name: text(body.name, 'Staff name', 100, true),
            phone: text(body.phone, 'Phone', 24),
            role: choice(body.role, ['manager','sales','mechanic','helper'], 'Choose a staff role.'),
            status: choice(body.status, ['active','inactive'], 'Choose a staff status.')
        })
    }
};

function directory(db, name) {
    const router = express.Router();
    const { table, fields } = directories[name];
    router.get('/', run(async (_req, res) => res.json((await db.list(table)).reverse())));
    router.post('/', run(async (req, res) => {
        const record = await db.insert(table, { ...fields(req.body), request_key: requestKey(req.body.request_key) });
        res.status(201).json(record);
    }));
    if (name === 'parts') router.post('/:id/sales', run(async (req, res) => {
        const sale = {
            quantity: quantity(req.body.quantity, 1),
            unit_price: money(req.body.unit_price, 'Unit sale price', { min: .01 }),
            account: account(req.body.account),
            salesman: text(req.body.salesman, 'Salesman', 100),
            request_key: requestKey(req.body.request_key),
            date: today()
        };
        res.status(201).json(await db.rpc('kb_sell_spare_part', { p_part_id: id(req.params.id), p_sale: sale }));
    }));
    if (name === 'parts') router.patch('/sales/:id/salesman', run(async (req, res) => {
        const salesman = text(req.body.salesman, 'Salesman', 100, true);
        const updated = await db.update('kb_spare_part_sales', id(req.params.id), { salesman });
        res.json({ salesman: updated.salesman });
    }));
    router.patch('/:id', run(async (req, res) => {
        const expected = name === 'parts' && req.body.expected_quantity != null
            ? { quantity: 'eq.' + quantity(req.body.expected_quantity) } : {};
        res.json(await db.update(table, id(req.params.id), fields(req.body), expected));
    }));
    return router;
}

function settingsRouter(db) {
    const router = express.Router();
    router.get('/', run(async (_req, res) => res.json((await db.list('kb_business_settings'))[0])));
    router.patch('/', run(async (req, res) => {
        const { business_name, phone, address } = req.body;
        res.json(await db.update('kb_business_settings', 1, {
            business_name: text(business_name, 'Business name', 100, true),
            phone: text(phone, 'Phone', 24),
            address: text(address, 'Address', 250)
        }));
    }));
    return router;
}

module.exports = { directory, settingsRouter };
