'use strict';

const express = require('express');
const { problem } = require('../supabase');
const { has } = require('../access');
const { today, text, money, date, id, requestKey, run } = require('./shared');

function commission(db) {
    const router = express.Router();
    router.get('/options',run(async (_req,res) => {
        const [mechanics,workshops,parts] = await Promise.all(['kb_mechanics','kb_referral_workshops','kb_spare_parts'].map(table=>db.list(table)));
        res.json({mechanics:mechanics.map(({id,name,rate})=>({id,name,rate:has(res.locals.user,'commission') ? rate : undefined})),
            workshops:workshops.map(({id,name})=>({id,name})),
            parts:parts.filter(row=>row.quantity>0).map(({id,name,sku,quantity,sell_price})=>({id,name,sku,quantity,sell_price}))});
    }));
    router.get('/',run(async (_req,res) => res.json(await db.rpc('kb_partner_ledger',{}))));
    router.post('/mechanics',run(async (req,res) => {
        const rate=money(req.body.rate === '' ? '10' : req.body.rate ?? '10','Commission rate',{max:100});
        res.status(201).json(await db.insert('kb_mechanics',{ name:text(req.body.name,'Name',100,true),
            phone:text(req.body.phone,'Phone',24),rate,request_key:requestKey(req.body.request_key) }));
    }));
    router.post('/workshops',run(async (req,res) => {
        res.status(201).json(await db.insert('kb_referral_workshops',{name:text(req.body.name,'Workshop name',100,true),
            owner:text(req.body.owner,'Owner',100,true),phone:text(req.body.phone,'Phone',24,true),
            request_key:requestKey(req.body.request_key)}));
    }));
    router.post('/:kind/:id/payments',run(async (req,res) => {
        const kind=req.params.kind;
        if (!['mechanic','workshop'].includes(kind)) throw problem(400,'Choose a partner.');
        const payment={amount:money(req.body.amount,'Amount',{min:.01,max:99999999999.99}),date:today(),
            request_key:requestKey(req.body.request_key)};
        res.status(201).json(await db.rpc('kb_pay_partner',{p_kind:kind,p_id:id(req.params.id),p_payment:payment}));
    }));
    return router;
}

function capital(db,zone) {
    const router=express.Router();
    router.get('/',run(async (req,res) => {
        const day=today(zone);
        const year=req.query.year == null ? Number(day.slice(0,4)) : Number(req.query.year);
        if (!Number.isInteger(year) || year<1900 || year>Number(day.slice(0,4))) throw problem(400,'Choose a valid year.');
        res.json({year,...await db.rpc('kb_capital_report',{p_day:day,p_timezone:zone,p_year:year})});
    }));
    router.post('/',run(async (req,res) => {
        const method=req.body.method;
        if (!['cash','bank','western_union'].includes(method)) throw problem(400,'Select a payment method.');
        const day=today(zone);
        const investmentDate=date(req.body.date,day);
        if (investmentDate>day) throw problem(400,'Investment date cannot be in the future.');
        res.status(201).json(await db.insert('kb_investments',{date:investmentDate,amount:money(req.body.amount,'Amount',{min:.01,max:99999999999.99}),
            note:text(req.body.note,'Note',250),method,request_key:requestKey(req.body.request_key)}));
    }));
    return router;
}

function dashboard(db,zone) {
    return run(async (req,res) => {
        const range=req.query.range ?? '30';
        if (!['today','7','30','all'].includes(range)) throw problem(400,'Choose a valid range.');
        const overview=await db.rpc('kb_dashboard_overview',{p_day:today(zone),p_timezone:zone,p_range:range});
        for (const row of [...overview.rows,...overview.weeks]) {
            if (!has(res.locals.user,'commission')) { delete row.commission; delete row.bonus; }
            if (!has(res.locals.user,'profit')) delete row.profit;
            if (!has(res.locals.user,'qist')) delete row.qist_collected;
            if (!has(res.locals.user,'parts')) delete row.part_sales;
            if (!has(res.locals.user,'workshop')) delete row.workshop_income;
        }
        if (!res.locals.user.admin) delete overview.investment;
        res.json(overview);
    });
}

module.exports={commission,capital,dashboard};
