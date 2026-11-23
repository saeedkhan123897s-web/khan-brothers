const express = require('express');
const { query: queryValidator } = require('express-validator');
const { authenticate } = require('../../middleware/auth');
const { requirePermission } = require('../../middleware/permissions');
const { validate } = require('../../middleware/validate');
const { query } = require('../../config/database');
const { asyncHandler } = require('../../utils/apiHelpers');

const router = express.Router();
router.use(authenticate);
const dateRules = [queryValidator('start_date').optional().isISO8601(), queryValidator('end_date').optional().isISO8601()];
function bounds(req) {
    return [req.query.start_date || '2000-01-01', req.query.end_date || '2099-12-31'];
}

router.get('/summary', requirePermission('profit.view'), dateRules, validate, asyncHandler(async (req, res) => {
    const [start, end] = bounds(req);
    const [sales] = await query(`SELECT COUNT(*) AS count,COALESCE(SUM(total_amount),0) AS revenue,COALESCE(SUM(amount_due),0) AS receivable,COALESCE(SUM(CASE WHEN payment_status='paid' THEN total_amount ELSE 0 END),0) AS collected,COALESCE((SELECT SUM(profit) FROM sale_items si JOIN sales sx ON sx.id=si.sale_id WHERE sx.status='completed' AND sx.sale_date BETWEEN ? AND ?),0) AS product_profit FROM sales WHERE status='completed' AND sale_date BETWEEN ? AND ?`, [start, end, start, end]);
    const [workshop] = await query(`SELECT COUNT(*) AS count,COALESCE(SUM(total_cost),0) AS revenue,COALESCE(SUM(actual_cost),0) AS cost,COALESCE(SUM(total_cost-actual_cost),0) AS profit FROM job_cards WHERE status NOT IN ('cancelled') AND received_date BETWEEN ? AND ?`, [start, end]);
    const [expenses] = await query('SELECT COALESCE(SUM(amount),0) AS total FROM expenses WHERE expense_date BETWEEN ? AND ?', [start, end]);
    const productProfit = Number(sales.product_profit);
    const workshopProfit = Number(workshop.profit);
    const expenseTotal = Number(expenses.total);
    res.json({ success: true, data: { period: { start_date: start, end_date: end }, sales: { ...sales, revenue: Number(sales.revenue), product_profit: productProfit }, workshop: { ...workshop, revenue: Number(workshop.revenue), cost: Number(workshop.cost), profit: workshopProfit }, expenses: expenseTotal, gross_profit: productProfit + workshopProfit, net_profit: productProfit + workshopProfit - expenseTotal } });
}));

router.get('/products', requirePermission('profit.view'), dateRules, validate, asyncHandler(async (req, res) => {
    const [start, end] = bounds(req);
    const rows = await query(`SELECT si.product_id,si.product_name,si.product_sku,SUM(si.quantity) AS units_sold,SUM(si.subtotal) AS revenue,SUM(si.profit) AS profit FROM sale_items si JOIN sales s ON s.id=si.sale_id WHERE s.status='completed' AND s.sale_date BETWEEN ? AND ? GROUP BY si.product_id,si.product_name,si.product_sku ORDER BY profit DESC LIMIT 100`, [start, end]);
    res.json({ success: true, data: rows });
}));

router.get('/workshop', requirePermission('profit.view'), dateRules, validate, asyncHandler(async (req, res) => {
    const [start, end] = bounds(req);
    const rows = await query(`SELECT status,COUNT(*) AS jobs,COALESCE(SUM(total_cost),0) AS revenue,COALESCE(SUM(actual_cost),0) AS cost,COALESCE(SUM(total_cost-actual_cost),0) AS profit FROM job_cards WHERE status<>'cancelled' AND received_date BETWEEN ? AND ? GROUP BY status ORDER BY status`, [start, end]);
    res.json({ success: true, data: rows });
}));

router.get('/monthly', requirePermission('profit.view'), dateRules, validate, asyncHandler(async (req, res) => {
    const [start, end] = bounds(req);
    const rows = await query(`SELECT DATE_FORMAT(sale_date,'%Y-%m') AS month,COUNT(*) AS sales_count,SUM(total_amount) AS revenue,SUM(amount_due) AS receivable FROM sales WHERE status='completed' AND sale_date BETWEEN ? AND ? GROUP BY DATE_FORMAT(sale_date,'%Y-%m') ORDER BY month`, [start, end]);
    res.json({ success: true, data: rows });
}));

module.exports = router;
