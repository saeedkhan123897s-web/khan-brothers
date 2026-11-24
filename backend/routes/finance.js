'use strict';

const express = require('express');
const { problem } = require('../supabase');
const { today, text, money, date, id, account, requestKey, run } = require('./shared');

function finance(db, zone) {
    const router = express.Router();
    const validDate = value => {
        const day = date(value, today(zone));
        if (day > today(zone) || day < '1900-01-01') throw problem(400,'Enter a date up to today.');
        return day;
    };
    const paymentAccount = value => {
        const selected = account(value);
        if (!selected) throw problem(400,'Select an account.');
        return selected;
    };
    const amount = body => money(body.amount,'Amount',{min:.01,max:999999999999.99});

    router.get('/cashbook',run(async (req,res) => {
        const end = validDate(req.query.to);
        const start = date(req.query.from,new Date(Date.parse(end)-29*86400000).toISOString().slice(0,10));
        if (start > end || start < '1900-01-01') throw problem(400,'Enter a valid statement date range.');
        res.json(await db.rpc('kb_cashbook',{p_to:end,p_from:start}));
    }));
    router.post('/openings',run(async (req,res) => {
        res.status(201).json(await db.insert('kb_cash_openings',{
            account:paymentAccount(req.body.account),date:validDate(req.body.date),
            amount:money(req.body.amount,'Opening balance',{max:999999999999.99}),
            note:text(req.body.note,'Opening balance note',250,true),request_key:requestKey(req.body.request_key)
        }));
    }));
    router.get('/suppliers',run(async (_req,res) => {
        const [ledger,suppliers,parts] = await Promise.all([
            db.rpc('kb_supplier_ledger',{}),db.list('kb_suppliers'),db.list('kb_spare_parts')
        ]);
        res.json({...ledger,suppliers:suppliers.map(({id,name})=>({id,name})),parts:parts.map(({id,name,sku})=>({id,name,sku}))});
    }));
    router.post('/suppliers/bills',run(async (req,res) => {
        const body = req.body;
        const part = body.part_id ? id(body.part_id) : null;
        const quantity = part ? Number(body.quantity) : null;
        if (part && (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 2147483647)) {
            throw problem(400,'Enter a valid receiving quantity.');
        }
        res.status(201).json(await db.rpc('kb_add_supplier_bill',{p_bill:{
            supplier_id:id(body.supplier_id),part_id:part,quantity,date:validDate(body.date),
            description:text(body.description,'Invoice or description',250,true),amount:amount(body),request_key:requestKey(body.request_key)
        }}));
    }));
    router.post('/suppliers/bills/:id/payments',run(async (req,res) => {
        res.status(201).json(await db.rpc('kb_pay_supplier_bill',{p_id:id(req.params.id),p_payment:{
            date:today(zone),amount:amount(req.body),account:paymentAccount(req.body.account),request_key:requestKey(req.body.request_key)
        }}));
    }));
    return router;
}

module.exports = finance;
