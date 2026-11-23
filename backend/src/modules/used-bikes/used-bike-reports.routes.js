'use strict';

const express = require('express');
const { param, query: queryParam } = require('express-validator');
const { requirePermission } = require('../../middleware/permissions');
const { validate } = require('../../middleware/validate');
const { query, queryOne } = require('../../config/database');
const { asyncHandler, paginationFrom, paginated } = require('../../utils/apiHelpers');
const { methods, businessDay } = require('./used-bike.payments');
const { spreadsheet } = require('../../utils/spreadsheet');
const { hasPermission, getOverrides } = require('../../utils/routePermissions');

const router = express.Router();
const view = requirePermission('used_bikes.view');
const saleAccess = requirePermission('used_bikes.view', 'used_bikes.sell');
const statusCodes = ['reconditioning', 'listed', 'reserved', 'sold', 'unavailable'];
const dateRule = name => queryParam(name).optional().isISO8601({ strict: true }).matches(/^\d{4}-\d{2}-\d{2}$/);
const filters = [
    queryParam('page').optional().isInt({ min: 1 }),
    queryParam('limit').optional().isInt({ min: 1, max: 100 }),
    queryParam('scope').optional().isIn(['stock', 'sold', 'all']),
    queryParam('status').optional().isIn(statusCodes),
    queryParam('customer_status').optional().isIn(['active','inactive','balance_due']),
    queryParam('payment_method').optional().isIn([...Object.keys(methods), 'digital_wallet', 'cheque', 'credit', 'split']),
    queryParam('search').optional().trim().isLength({ max: 100 }),
    queryParam('bike').optional().trim().isLength({ max: 100 }),
    queryParam('model').optional().trim().isLength({ max: 100 }),
    queryParam('min_price').optional().isFloat({ min: 0 }),
    queryParam('max_price').optional().isFloat({ min: 0 }),
    dateRule('start_date'), dateRule('end_date')
];

const saleAmount = "CASE WHEN s.status='completed' THEN si.subtotal WHEN o.status='delivered' THEN oi.subtotal END";
const costBasis = 'COALESCE(si.cost_price,last_sale.cost_price,p.cost_price)';
const stockStatus = `CASE
    WHEN p.stock_quantity=1 AND p.is_active=1 THEN 'listed'
    WHEN p.stock_quantity=1 THEN 'reconditioning'
    WHEN s.status='completed' OR o.status='delivered' THEN 'sold'
    WHEN o.status IN ('confirmed','processing','shipped') THEN 'reserved'
    ELSE 'unavailable' END`;

const dataSource = `WITH bikes AS (
    SELECT b.id,b.product_id,p.sku,p.name,b.model,p.description,p.image_url,p.brand_id,brand.name AS brand_name,p.model_year,p.engine_cc,
        b.seller_name,b.seller_phone,b.chassis_number,b.registration_number,
        DATE_FORMAT(b.acquired_on,'%Y-%m-%d') AS acquired_on,b.purchase_price,b.intake_notes,
        b.engine_condition,b.tyre_condition,b.body_condition,b.purchase_method,
        ${costBasis} AS total_cost, COALESCE(w.repair_cost,0) AS repair_cost, COALESCE(w.other_cost,0) AS other_cost,
        IF(p.selling_price>0,p.selling_price,NULL) AS asking_price,
        IF(p.stock_quantity=1 AND p.selling_price>0,p.selling_price-p.cost_price,NULL) AS expected_margin,
        ${saleAmount} AS sale_amount, (${saleAmount})-${costBasis} AS actual_margin,
        COALESCE(s.invoice_number,o.order_number) AS sale_reference,
        DATE_FORMAT(COALESCE(s.sale_date,o.delivered_on,DATE(o.updated_at)),'%Y-%m-%d') AS resale_date,
        COALESCE(s.customer_id,o.customer_id) AS customer_id, COALESCE(s.customer_name,o.customer_name) AS customer_name,
        COALESCE(us.payment_method,s.payment_method,o.payment_method) AS payment_method,
        us.id AS receipt_id, ${stockStatus} AS status
    FROM used_bikes b JOIN products p ON p.id=b.product_id
    LEFT JOIN brands brand ON brand.id=p.brand_id
    LEFT JOIN (
        SELECT used_bike_id,
            SUM(CASE WHEN cost_type='repair' THEN amount ELSE 0 END) AS repair_cost,
            SUM(CASE WHEN cost_type='other' THEN amount ELSE 0 END) AS other_cost
        FROM used_bike_work GROUP BY used_bike_id
    ) w ON w.used_bike_id=b.id
    LEFT JOIN stock_movements last_sale ON p.stock_quantity=0 AND last_sale.id=(
        SELECT m.id FROM stock_movements m WHERE m.product_id=p.id AND m.movement_type='sale' ORDER BY m.id DESC LIMIT 1
    )
    LEFT JOIN sales s ON last_sale.reference_type='sale' AND s.id=last_sale.reference_id
    LEFT JOIN sale_items si ON si.sale_id=s.id AND si.product_id=p.id
    LEFT JOIN used_bike_sales us ON us.sale_id=s.id
    LEFT JOIN orders o ON last_sale.reference_type='order' AND o.id=last_sale.reference_id
    LEFT JOIN order_items oi ON oi.order_id=o.id AND oi.product_id=p.id
)`;

function bikeFilter(values, scope, customers = false) {
    const clauses = [];
    const parameters = [];
    const add = (predicate, ...args) => { clauses.push(predicate); parameters.push(...args); };
    if (!customers && scope === 'stock') clauses.push("b.status IN ('listed','reconditioning')");
    if (!customers && scope === 'sold') clauses.push("b.status='sold'");
    if (values.status) add('b.status=?', values.status);
    if (customers && values.customer_status) {
        if (values.customer_status === 'balance_due') clauses.push('c.outstanding_balance>0');
        else add('c.is_active=?', values.customer_status === 'active' ? 1 : 0);
    }
    if (values.search) {
        const parts = ['b.name', 'b.sku', 'b.customer_name', 'b.registration_number',
            ...(customers ? ['c.name', 'c.phone'] : ['b.seller_name'])];
        const predicates = parts.map(field => field + ' LIKE ?');
        const matches = parts.map(() => `%${values.search}%`);
        const chassis = values.search.replace(/[\s-]+/g, '');
        if (chassis) {
            predicates.push('b.chassis_number LIKE ?');
            matches.push(`%${chassis}%`);
        }
        add('(' + predicates.join(' OR ') + ')', ...matches);
    }
    if (values.bike) add('(b.name LIKE ? OR b.sku LIKE ?)', `%${values.bike}%`, `%${values.bike}%`);
    if (values.model) add('COALESCE(b.model,b.name) LIKE ?', `%${values.model}%`);
    if (values.payment_method) add('COALESCE(b.payment_method,b.purchase_method)=?', values.payment_method);
    if (values.min_price) add('COALESCE(b.sale_amount,b.asking_price)>=?', values.min_price);
    if (values.max_price) add('COALESCE(b.sale_amount,b.asking_price)<=?', values.max_price);
    const date = scope === 'stock' ? 'b.acquired_on' : 'b.resale_date';
    if (values.start_date) add(`${date}>=?`, values.start_date);
    if (values.end_date) add(`${date}<=?`, values.end_date);
    return { where: clauses.length ? ' WHERE ' + clauses.join(' AND ') : '', parameters };
}

async function listBikes(values, scope, paginate, columns = 'b.*') {
    const { where, parameters } = bikeFilter(values, scope);
    const source = `${dataSource} SELECT ${columns} FROM bikes b${where} ORDER BY b.id DESC`;
    return query(source + (paginate ? ' LIMIT ? OFFSET ?' : ''), paginate ? [...parameters, paginate.limit, paginate.offset] : parameters);
}

async function bikePage(values, scope, paging, columns) {
    const { where, parameters } = bikeFilter(values, scope);
    const [rows, count] = await Promise.all([
        listBikes(values, scope, paging, columns),
        queryOne(`${dataSource} SELECT COUNT(*) total FROM bikes b${where}`, parameters)
    ]);
    return paginated(rows, count.total, paging.page, paging.limit);
}

function expenseFilter(values) {
    const where = ["business_area='used_bikes'"];
    const params = [];
    if (values.start_date) { where.push('expense_date>=?'); params.push(values.start_date); }
    if (values.end_date) { where.push('expense_date<=?'); params.push(values.end_date); }
    return { where: where.join(' AND '), params };
}

async function reportSummary(values) {
    const { where, parameters } = bikeFilter(values, 'sold');
    const expense = expenseFilter(values);
    return queryOne(`${dataSource}, totals AS (
        SELECT COUNT(*) AS bikes_sold,COALESCE(SUM(b.sale_amount),0) AS revenue,COALESCE(SUM(b.actual_margin),0) AS gross_profit
        FROM bikes b${where}
    ), operating AS (
        SELECT COALESCE(SUM(amount),0) AS expenses FROM expenses WHERE ${expense.where}
    ) SELECT totals.*,expenses,gross_profit-expenses AS net_profit FROM totals CROSS JOIN operating`, [...parameters, ...expense.params]);
}

router.get('/', view, filters, validate, asyncHandler(async (req, res) => {
    const scope = req.query.scope || 'all';
    const [data, summary] = await Promise.all([
        bikePage(req.query, scope, paginationFrom(req.query)),
        scope === 'stock' ? queryOne(`${dataSource} SELECT COUNT(*) AS stock_count,
            COALESCE(SUM(total_cost),0) AS stock_capital,COALESCE(SUM(expected_margin),0) AS expected_profit
            FROM bikes WHERE status IN ('listed','reconditioning')`) : null
    ]);
    res.json({ success: true, ...data, ...(summary ? { summary } : {}) });
}));

router.get('/sellable', requirePermission('used_bikes.sell'), filters, validate, asyncHandler(async (req, res) => {
    const data = await bikePage(req.query, 'stock', paginationFrom(req.query),
        'b.id,b.sku,b.name,b.model,b.image_url,b.chassis_number,b.asking_price,b.status');
    res.json({ success: true, ...data });
}));

router.get('/sold-list', saleAccess, filters, validate, asyncHandler(async (req, res) => {
    const canSeeCost = hasPermission(req.user, 'used_bikes.view', await getOverrides(req));
    const fields = 'b.id,b.name,b.model,b.chassis_number,b.customer_name,b.sale_reference,b.resale_date,b.payment_method,b.sale_amount,b.receipt_id,b.status';
    const data = await bikePage(req.query, 'sold', paginationFrom(req.query),
        canSeeCost ? fields + ',b.total_cost,b.actual_margin' : fields);
    res.json({ success: true, ...data });
}));

router.get('/summary', requirePermission('used_bikes.view', 'dashboard.view'), asyncHandler(async (_req, res) => {
    const today = businessDay();
    const [totals, expense, upcoming] = await Promise.all([
        queryOne(`${dataSource} SELECT
            SUM(status IN ('listed','reconditioning')) AS stock_count,
            COALESCE(SUM(IF(status IN ('listed','reconditioning'),total_cost,0)),0) AS stock_capital,
            COALESCE(SUM(IF(status IN ('listed','reconditioning'),expected_margin,0)),0) AS expected_profit,
            COALESCE(SUM(IF(status='sold',sale_amount,0)),0) AS total_sales,
            COALESCE(SUM(IF(status='sold',actual_margin,0)),0) AS total_gross,
            COALESCE(SUM(IF(status='sold' AND resale_date=?,sale_amount,0)),0) AS today_sales,
            COALESCE(SUM(IF(status='sold' AND resale_date=?,actual_margin,0)),0) AS today_gross
            FROM bikes`, [today, today]),
        queryOne(`SELECT COALESCE(SUM(amount),0) AS total_expenses,
            COALESCE(SUM(IF(expense_date=?,amount,0)),0) AS today_expenses FROM expenses WHERE business_area='used_bikes'`, [today]),
        query(`SELECT us.id,s.customer_name,si.product_name,DATE_FORMAT(us.next_due_date,'%Y-%m-%d') AS next_due_date,
            us.monthly_installment,s.amount_due FROM used_bike_sales us JOIN sales s ON s.id=us.sale_id
            JOIN sale_items si ON si.sale_id=s.id JOIN used_bikes b ON b.id=us.used_bike_id AND b.product_id=si.product_id
            WHERE us.payment_method='qist' AND s.status='completed' AND s.amount_due>0 AND us.next_due_date<=DATE_ADD(?,INTERVAL 7 DAY)
            ORDER BY us.next_due_date,us.id LIMIT 20`, [today])
    ]);
    res.json({ success: true, data: { ...totals, ...expense, today,
        stock_count: Number(totals.stock_count || 0),
        today_profit: Number(totals.today_gross) - Number(expense.today_expenses),
        total_profit: Number(totals.total_gross) - Number(expense.total_expenses), reminders: upcoming } });
}));

router.get('/report', view, filters, validate, asyncHandler(async (req, res) => {
    const expense = expenseFilter(req.query);
    const [sales, summary, expenses] = await Promise.all([
        bikePage(req.query, 'sold', paginationFrom(req.query)), reportSummary(req.query),
        query(`SELECT expense_number,DATE_FORMAT(expense_date,'%Y-%m-%d') AS expense_date,category,description,amount
            FROM expenses WHERE ${expense.where} ORDER BY expense_date DESC,id DESC LIMIT 100`, expense.params)
    ]);
    res.json({ success: true, data: { items: sales.data, summary, expenses }, pagination: sales.pagination });
}));

const customerSource = 'FROM customers c LEFT JOIN bikes b ON b.customer_id=c.id AND b.status=\'sold\'';
const customerColumns = `c.id,c.name,c.phone,c.cnic,c.is_active,c.outstanding_balance,c.total_purchases,
    GROUP_CONCAT(DISTINCT b.name ORDER BY b.name SEPARATOR ', ') AS motorcycles`;
router.get('/customers', requirePermission('customers.view'), filters, validate, asyncHandler(async (req, res) => {
    const { where, parameters } = bikeFilter(req.query, 'sold', true);
    const { page, limit, offset } = paginationFrom(req.query);
    const [rows, count] = await Promise.all([
        query(`${dataSource} SELECT ${customerColumns} ${customerSource}${where} GROUP BY c.id ORDER BY c.name,c.id LIMIT ? OFFSET ?`, [...parameters, limit, offset]),
        queryOne(`${dataSource} SELECT COUNT(DISTINCT c.id) total ${customerSource}${where}`, parameters)
    ]);
    res.json({ success: true, ...paginated(rows, count.total, page, limit) });
}));

router.get('/customers/:id/purchases', requirePermission('customers.view'), [
    param('id').isInt({ min: 1 })
], validate, asyncHandler(async (req, res) => {
    const customer = await queryOne('SELECT id FROM customers WHERE id=?', [req.params.id]);
    if (!customer) return res.status(404).json({ success: false, error: 'Customer not found.' });

    const purchases = await query(`${dataSource}
        SELECT b.name,b.model,b.resale_date,b.sale_reference,b.sale_amount,b.payment_method,
            CASE WHEN b.payment_method='qist' THEN s.amount_due END AS qist_due
        FROM bikes b LEFT JOIN used_bike_sales us ON us.id=b.receipt_id
        LEFT JOIN sales s ON s.id=us.sale_id
        WHERE b.customer_id=? AND b.status='sold'
        ORDER BY b.resale_date DESC,b.id DESC`, [customer.id]);
    const qistBalanceInCents = purchases.reduce((sum, row) => sum + Math.round(Number(row.qist_due || 0) * 100), 0);
    res.json({ success: true, data: { purchases, qist_balance: qistBalanceInCents / 100 } });
}));

router.get('/qist', saleAccess, [
    queryParam('status').optional().isIn(['paid', 'pending']),
    queryParam('page').optional().isInt({ min: 1 }),
    queryParam('limit').optional().isInt({ min: 1, max: 100 }),
    queryParam('search').optional().trim().isLength({ max: 100 })
], validate, asyncHandler(async (req, res) => {
    const { page, limit, offset } = paginationFrom(req.query);
    const clauses = ["us.payment_method='qist'", "s.status='completed'"];
    const params = [];
    if (req.query.status) clauses.push(req.query.status === 'paid' ? 's.amount_due=0' : 's.amount_due>0');
    if (req.query.search) {
        clauses.push('(s.customer_name LIKE ? OR s.customer_phone LIKE ? OR p.name LIKE ? OR b.chassis_number LIKE ?)');
        const chassis = req.query.search.replace(/[\s-]+/g, '') || req.query.search;
        params.push(...Array(3).fill(`%${req.query.search}%`), `%${chassis}%`);
    }
    const from = `FROM used_bike_sales us JOIN sales s ON s.id=us.sale_id JOIN used_bikes b ON b.id=us.used_bike_id
        JOIN products p ON p.id=b.product_id WHERE ${clauses.join(' AND ')}`;
    const [rows, count] = await Promise.all([
        query(`SELECT us.id,s.invoice_number,s.customer_name,s.customer_phone,p.name AS motorcycle,
            s.total_amount,s.total_amount-us.interest_amount AS bike_price,us.interest_rate,us.interest_amount,
            us.initial_payment,s.amount_paid,s.amount_due,us.monthly_installment,
            DATE_FORMAT(us.next_due_date,'%Y-%m-%d') AS next_due_date,IF(s.amount_due>0,'pending','paid') AS status
            ${from} ORDER BY (s.amount_due=0),us.next_due_date,us.id LIMIT ? OFFSET ?`, [...params, limit, offset]),
        queryOne(`SELECT COUNT(*) total ${from}`, params)
    ]);
    res.json({ success: true, ...paginated(rows, count.total, page, limit) });
}));

const stockExport = [['sku','SKU'],['name','Bike'],['model','Model'],['image_url','Photo path'],['chassis_number','Chassis'],
    ['registration_number','Plate'],['engine_condition','Engine'],['tyre_condition','Tyres'],['body_condition','Body'],
    ['status','Status'],['purchase_price','Purchase cost'],
    ['repair_cost','Repair cost'],['other_cost','Other cost'],['total_cost','Total cost'],['asking_price','Sell price'],['expected_margin','Expected profit']];
const soldExport = [['sku','SKU'],['name','Bike'],['model','Model'],['chassis_number','Chassis'],['customer_name','Customer'],['resale_date','Date'],
    ['payment_method','Payment method'],['sale_reference','Receipt'],['total_cost','Total cost'],['sale_amount','Sold price'],['actual_margin','Real profit']];
router.get('/export/:section', [
    param('section').isIn(['stock','sold','profit','customers']), queryParam('format').isIn(['csv','excel']), ...filters
], validate, (req, res, next) => {
    const permission = req.params.section === 'customers' ? 'customers.view' : 'used_bikes.view';
    return requirePermission(permission)(req, res, next);
}, asyncHandler(async (req, res) => {
    const { section } = req.params;
    let columns = section === 'stock' ? stockExport : soldExport;
    let rows;
    let sheets;
    if (section === 'customers') {
        const { where, parameters } = bikeFilter(req.query, 'sold', true);
        rows = await query(`${dataSource} SELECT ${customerColumns} ${customerSource}${where} GROUP BY c.id ORDER BY c.name,c.id`, parameters);
        columns = [['name','Customer'],['phone','Phone'],['cnic','CNIC'],['motorcycles','Motorcycles'],['outstanding_balance','Outstanding'],['total_purchases','Total purchases']];
    } else {
        rows = await listBikes(req.query, section === 'stock' ? 'stock' : 'sold');
    }
    sheets = [{ name: section === 'profit' ? 'Sales margin' : section, columns, rows }];
    if (section === 'profit') {
        const expense = expenseFilter(req.query);
        const [summary, expenses] = await Promise.all([
            reportSummary(req.query),
            query(`SELECT expense_number,DATE_FORMAT(expense_date,'%Y-%m-%d') AS expense_date,category,description,amount
                FROM expenses WHERE ${expense.where} ORDER BY expense_date,id`, expense.params)
        ]);
        sheets.unshift({ name: 'Profit summary', rows: [summary], columns: [['bikes_sold','Bikes sold'],['revenue','Sales'],['gross_profit','Gross profit'],['expenses','Expenses'],['net_profit','Net profit']] });
        sheets.push({ name: 'Expenses', rows: expenses, columns: [['expense_number','Expense'],['expense_date','Date'],['category','Category'],['description','Description'],['amount','Amount']] });
    }
    const file = spreadsheet(sheets, req.query.format);
    res.set('Cache-Control', 'no-store');
    res.attachment(`khan-brothers-${section}.${file.extension}`).type(file.mime).send(file.content);
}));

router.get('/:id', view, [param('id').isInt({ min: 1 })], validate, asyncHandler(async (req, res) => {
    const bike = await queryOne(`${dataSource} SELECT * FROM bikes WHERE id=?`, [req.params.id]);
    if (!bike) return res.status(404).json({ success: false, error: 'Used motorcycle not found.' });
    [bike.work, bike.photos] = await Promise.all([
        query("SELECT id,DATE_FORMAT(worked_on,'%Y-%m-%d') AS worked_on,description,amount,cost_type FROM used_bike_work WHERE used_bike_id=? ORDER BY worked_on DESC,id DESC", [bike.id]),
        query('SELECT image_url FROM used_bike_photos WHERE used_bike_id=? ORDER BY position', [bike.id])
    ]);
    res.json({ success: true, data: bike });
}));

module.exports = router;
