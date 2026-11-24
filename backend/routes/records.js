'use strict';

const express = require('express');
const { problem } = require('../supabase');
const { run } = require('./shared');

const records = {
    'bike-expenses': ['stock','kb_bike_expenses',['id','bike_id','date','name','amount','account']],
    'part-sales': ['parts','kb_spare_part_sales',['id','part_id','date','quantity','unit_price','salesman','account']],
    'qist-payments': ['qist','qist_payments',['id','qist_id','date','amount','account']],
    'workshop-payments': ['workshop','kb_workshop_payments',['id','job_id','date','amount','account']],
    'job-parts': ['workshop','kb_job_parts',['id','job_id','part_name','date','quantity','unit_price','revenue']],
    'commission-payments': ['commission','kb_commission_payments',['id','mechanic_id','referral_id','date','amount','account']],
    'day-closings': ['daily','kb_day_closings',['date','opening_balance','total_income','expense','closing_balance','closed_at'],'date.desc'],
    'supplier-payments': ['parts','kb_supplier_payments',['id','bill_id','date','amount','account']],
    'cash-openings': ['admin','kb_cash_openings',['id','date','account','amount','note']],
    'workshop-cancellations': ['workshop','kb_workshop_cancellations',['id','job_id','date','reason','refund','refund_account']],
    'part-returns': ['workshop','kb_workshop_part_returns',['id','cancellation_id','line_id','quantity']],
    'activity-log': ['admin','kb_audit_log',['id','recorded_at','actor','action','resource','record_id','fields','reason']]
};

function recordRouter(db) {
    const router = express.Router();
    router.get('/:section',run(async (req,res) => {
        const entry = Object.hasOwn(records,req.params.section) && records[req.params.section];
        if (!entry) throw problem(404,'Record list not found.');
        const [ , table, columns, order ] = entry;
        const page = Number(req.query.page || 1);
        const size = 50;
        if (!Number.isInteger(page) || page<1 || page>100000) throw problem(400,'Enter a valid page number.');
        const offset = (page-1)*size;
        const rows = await db.page(table,{columns,order,limit:size+1,offset});
        res.json({ rows:rows.slice(0,size),next:rows.length>size });
    }));
    return router;
}

module.exports = { recordRouter, records };
