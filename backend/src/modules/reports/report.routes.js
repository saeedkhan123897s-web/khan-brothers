const express = require('express');
const { param, query: queryValidator } = require('express-validator');
const { authenticate } = require('../../middleware/auth');
const { requirePermission } = require('../../middleware/permissions');
const { validate } = require('../../middleware/validate');
const { query } = require('../../config/database');
const { asyncHandler, paginationFrom, paginated } = require('../../utils/apiHelpers');

const router = express.Router();
router.use(authenticate);
const dateRules = [queryValidator('start_date').optional().isISO8601(), queryValidator('end_date').optional().isISO8601()];
function bounds(req) { return [req.query.start_date || '2000-01-01', req.query.end_date || '2099-12-31']; }

router.get('/sales', requirePermission('reports.view'), dateRules, validate, asyncHandler(async (req, res) => {
    const [start, end] = bounds(req);
    const rows = await query(`SELECT sale_date AS date,COUNT(*) AS transactions,COALESCE(SUM(subtotal),0) AS subtotal,COALESCE(SUM(discount_amount),0) AS discounts,COALESCE(SUM(tax_amount),0) AS tax,COALESCE(SUM(total_amount),0) AS total,COALESCE(SUM(amount_paid),0) AS paid,COALESCE(SUM(amount_due),0) AS due FROM sales WHERE status='completed' AND sale_date BETWEEN ? AND ? GROUP BY sale_date ORDER BY sale_date`, [start, end]);
    res.json({ success: true, data: rows });
}));

router.get('/purchases', requirePermission('reports.view'), dateRules, validate, asyncHandler(async (req, res) => {
    const [start, end] = bounds(req);
    const rows = await query(`SELECT purchase_date AS date,COUNT(*) AS transactions,COALESCE(SUM(subtotal),0) AS subtotal,COALESCE(SUM(discount_amount),0) AS discounts,COALESCE(SUM(shipping_cost),0) AS shipping,COALESCE(SUM(total_amount),0) AS total,COALESCE(SUM(amount_paid),0) AS paid,COALESCE(SUM(amount_due),0) AS due FROM purchases WHERE status<>'cancelled' AND purchase_date BETWEEN ? AND ? GROUP BY purchase_date ORDER BY purchase_date`, [start, end]);
    res.json({ success: true, data: rows });
}));

router.get('/inventory', requirePermission('reports.view'), asyncHandler(async (req, res) => {
    const [summary] = await query('SELECT COUNT(*) AS product_count,COALESCE(SUM(stock_quantity),0) AS units,COALESCE(SUM(stock_quantity*cost_price),0) AS cost_value,COALESCE(SUM(stock_quantity*selling_price),0) AS retail_value,SUM(CASE WHEN stock_quantity<=min_stock_level THEN 1 ELSE 0 END) AS low_stock FROM products WHERE is_active=1');
    const lowStock = await query(`SELECT id,sku,name,stock_quantity,min_stock_level,cost_price,selling_price FROM products WHERE is_active=1 AND stock_quantity<=min_stock_level ORDER BY stock_quantity ASC LIMIT 100`);
    res.json({ success: true, data: { summary, low_stock: lowStock } });
}));

router.get('/workshop', requirePermission('reports.view'), dateRules, validate, asyncHandler(async (req, res) => {
    const [start, end] = bounds(req);
    const rows = await query(`SELECT status,COUNT(*) AS jobs,COALESCE(SUM(total_cost),0) AS billed,COALESCE(SUM(amount_paid),0) AS paid,COALESCE(SUM(total_cost-amount_paid),0) AS due FROM job_cards WHERE received_date BETWEEN ? AND ? GROUP BY status ORDER BY status`, [start, end]);
    res.json({ success: true, data: rows });
}));

const financialSales = "FROM sales WHERE status='completed' AND sale_date BETWEEN ? AND ?";
const financialPurchases = "FROM purchases WHERE status<>'cancelled' AND purchase_date BETWEEN ? AND ?";
const financialExpenses = 'FROM expenses WHERE expense_date BETWEEN ? AND ?';
const ledgerPeriod = 'WHERE l.entry_date BETWEEN ? AND ?';

router.get('/financial', requirePermission('reports.view'), dateRules, validate, asyncHandler(async (req, res) => {
    const [start, end] = bounds(req);
    const [sales] = await query(`SELECT COALESCE(SUM(total_amount),0) revenue,COALESCE(SUM(amount_due),0) receivables ${financialSales}`, [start, end]);
    const [purchases] = await query(`SELECT COALESCE(SUM(total_amount),0) total,COALESCE(SUM(amount_due),0) payables ${financialPurchases}`, [start, end]);
    const [expenses] = await query(`SELECT COALESCE(SUM(amount),0) total ${financialExpenses}`, [start, end]);
    const [ledger] = await query(`SELECT COALESCE(SUM(debit),0) debit,COALESCE(SUM(credit),0) credit FROM ledger_entries l ${ledgerPeriod}`, [start, end]);
    res.json({ success: true, data: { period: { start_date: start, end_date: end }, sales, purchases, expenses: Number(expenses.total), ledger } });
}));

const salesDetail = {
    permission: 'sales.view', source: financialSales, order: 'sale_date DESC,id DESC',
    columns: "DATE_FORMAT(sale_date,'%Y-%m-%d') AS date,invoice_number AS reference,customer_name AS party,total_amount,amount_paid,amount_due"
};
const purchaseDetail = {
    permission: 'purchases.view', source: financialPurchases, order: 'purchase_date DESC,id DESC',
    columns: "DATE_FORMAT(purchase_date,'%Y-%m-%d') AS date,purchase_number AS reference,supplier_name AS party,total_amount,amount_paid,amount_due"
};
const ledgerDetail = {
    permission: 'accounts.view', source: `FROM ledger_entries l JOIN accounts a ON a.id=l.account_id ${ledgerPeriod}`,
    order: 'l.entry_date DESC,l.id DESC',
    columns: "DATE_FORMAT(l.entry_date,'%Y-%m-%d') AS date,a.account_code,a.name AS account_name,l.description,l.debit,l.credit"
};
const financialDetails = {
    sales: salesDetail,
    receivables: { ...salesDetail, source: financialSales + ' AND amount_due>0' },
    purchases: purchaseDetail,
    payables: { ...purchaseDetail, source: financialPurchases + ' AND amount_due>0' },
    expenses: {
        permission: 'accounts.view', source: financialExpenses, order: 'expense_date DESC,id DESC',
        columns: "DATE_FORMAT(expense_date,'%Y-%m-%d') AS date,expense_number AS reference,category,description,amount"
    },
    debits: { ...ledgerDetail, source: ledgerDetail.source + ' AND l.debit<>0' },
    credits: { ...ledgerDetail, source: ledgerDetail.source + ' AND l.credit<>0' }
};

router.get('/financial/:section', requirePermission('reports.view'), [
    param('section').isIn(Object.keys(financialDetails)), ...dateRules,
    queryValidator('page').optional().isInt({ min: 1 })
], validate, (req, res, next) => requirePermission(financialDetails[req.params.section].permission)(req, res, next),
asyncHandler(async (req, res) => {
    const { source, columns, order } = financialDetails[req.params.section];
    const period = bounds(req);
    const { page, limit, offset } = paginationFrom(req.query);
    const [[{ total }], rows] = await Promise.all([
        query(`SELECT COUNT(*) total ${source}`, period),
        query(`SELECT ${columns} ${source} ORDER BY ${order} LIMIT ? OFFSET ?`, [...period, limit, offset])
    ]);
    res.json({ success: true, ...paginated(rows, total, page, limit) });
}));

router.get('/dashboard', requirePermission('dashboard.view'), asyncHandler(async (req, res) => {
    const [sales] = await query("SELECT DATE_FORMAT(CURRENT_DATE(),'%Y-%m-%d') AS today,COUNT(*) count,COALESCE(SUM(total_amount),0) total FROM sales WHERE status='completed' AND sale_date=CURRENT_DATE()");
    const [orders] = await query("SELECT COUNT(*) count FROM orders WHERE status IN ('pending','confirmed','processing')");
    const [jobs] = await query("SELECT COUNT(*) count FROM job_cards WHERE status IN ('received','diagnosing','waiting_parts','in_progress')");
    const [customers] = await query('SELECT COUNT(*) count FROM customers WHERE is_active=1');
    const [products] = await query('SELECT COUNT(*) count,SUM(CASE WHEN stock_quantity<=min_stock_level THEN 1 ELSE 0 END) low_stock FROM products WHERE is_active=1');
    const recentTransactions = await query(`
        SELECT transaction_id,type,party,amount,status,transaction_date
        FROM (
            SELECT invoice_number AS transaction_id,'Sale' AS type,
                COALESCE(NULLIF(customer_name,''),'Walk-in customer') AS party,
                total_amount AS amount,status,
                DATE_FORMAT(sale_date,'%Y-%m-%d') AS transaction_date,created_at AS sort_date
            FROM sales
            UNION ALL
            SELECT purchase_number AS transaction_id,'Purchase' AS type,
                COALESCE(NULLIF(supplier_name,''),'Supplier') AS party,
                total_amount AS amount,status,
                DATE_FORMAT(purchase_date,'%Y-%m-%d') AS transaction_date,created_at AS sort_date
            FROM purchases
            UNION ALL
            SELECT job_number AS transaction_id,'Repair Job' AS type,
                COALESCE(NULLIF(customer_name,''),NULLIF(motorcycle_registration,''),'Workshop customer') AS party,
                total_cost AS amount,status,
                DATE_FORMAT(received_date,'%Y-%m-%d') AS transaction_date,created_at AS sort_date
            FROM job_cards
            UNION ALL
            SELECT order_number AS transaction_id,'Online Order' AS type,
                COALESCE(NULLIF(customer_name,''),'Online customer') AS party,
                total_amount AS amount,status,
                DATE_FORMAT(created_at,'%Y-%m-%d') AS transaction_date,created_at AS sort_date
            FROM orders
        ) AS activity
        ORDER BY sort_date DESC,transaction_date DESC
        LIMIT 8
    `);
    res.json({ success: true, data: { today: sales.today, today_sales: sales, open_orders: Number(orders.count), active_jobs: Number(jobs.count), customers: Number(customers.count), products, recent_transactions: recentTransactions } });
}));

module.exports = router;
