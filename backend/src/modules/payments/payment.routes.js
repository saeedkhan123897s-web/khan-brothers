const express = require('express');
const { body, param, query: queryValidator } = require('express-validator');
const { authenticate } = require('../../middleware/auth');
const { requirePermission } = require('../../middleware/permissions');
const { validate } = require('../../middleware/validate');
const { transaction, queryOne, query } = require('../../config/database');
const { asyncHandler, paginationFrom, paginated, makeDocumentNumber, recordAudit } = require('../../utils/apiHelpers');

const router = express.Router();
router.use(authenticate);

router.get('/', requirePermission('payments.view'), [
    queryValidator('page').optional().isInt({ min: 1 }),
    queryValidator('limit').optional().isInt({ min: 1, max: 100 }),
    queryValidator('payment_type').optional().isIn(['received', 'made']),
    queryValidator('reference_type').optional().isIn(['sale', 'purchase', 'job_card', 'order', 'expense', 'other', 'used_bike']),
    queryValidator('customer_id').optional().isInt({ min: 1 }),
    queryValidator('supplier_id').optional().isInt({ min: 1 }),
    queryValidator('start_date').optional().isISO8601(),
    queryValidator('end_date').optional().isISO8601()
], validate, asyncHandler(async (req, res) => {
    const { page, limit, offset } = paginationFrom(req.query);
    const clauses = [];
    const values = [];
    for (const key of ['payment_type', 'reference_type', 'customer_id', 'supplier_id']) {
        if (req.query[key]) { clauses.push(`${key}=?`); values.push(req.query[key]); }
    }
    if (req.query.start_date) { clauses.push('payment_date>=?'); values.push(req.query.start_date); }
    if (req.query.end_date) { clauses.push('payment_date<=?'); values.push(req.query.end_date); }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const count = await queryOne(`SELECT COUNT(*) total FROM payments ${where}`, values);
    const rows = await query(`SELECT p.*, u.name AS created_by_name, c.name AS customer_name, s.name AS supplier_name FROM payments p LEFT JOIN users u ON u.id=p.created_by LEFT JOIN customers c ON c.id=p.customer_id LEFT JOIN suppliers s ON s.id=p.supplier_id ${where} ORDER BY p.payment_date DESC,p.id DESC LIMIT ? OFFSET ?`, [...values, limit, offset]);
    res.json({ success: true, ...paginated(rows, count.total, page, limit) });
}));

router.post('/', requirePermission('payments.create'), [
    body('payment_type').isIn(['received', 'made']),
    body('reference_type').isIn(['sale', 'purchase', 'job_card', 'order', 'expense', 'other']).custom((value, { req }) => {
        if (value !== 'other' && !req.body.reference_id) {
            throw new Error('reference_id is required for this payment reference type');
        }
        return true;
    }),
    body('reference_id').optional({ nullable: true, checkFalsy: true }).isInt({ min: 1 }),
    body('customer_id').optional({ nullable: true, checkFalsy: true }).isInt({ min: 1 }),
    body('supplier_id').optional({ nullable: true, checkFalsy: true }).isInt({ min: 1 }),
    body('amount').isFloat({ min: 0.01, max: 999999999.99 }),
    body('payment_method').optional().isIn(['cash', 'bank_transfer', 'card', 'digital_wallet', 'cheque']),
    body('payment_date').optional().isISO8601(),
    body('bank_name').optional({ nullable: true }).trim().isLength({ max: 50 }),
    body('reference_number').optional({ nullable: true }).trim().isLength({ max: 50 }),
    body('notes').optional({ nullable: true }).isString()
], validate, asyncHandler(async (req, res) => {
    const result = await transaction(async connection => {
        const { payment_type: type, reference_type: refType, reference_id: refId = null } = req.body;
        const amount = Number(req.body.amount);
        let customerId = req.body.customer_id || null;
        let supplierId = req.body.supplier_id || null;
        if (refType === 'expense') {
            const error = new Error('Expense payments are recorded when the expense is created'); error.statusCode = 409; throw error;
        }
        if (refId && refType === 'sale') {
            const [rows] = await connection.execute('SELECT id,status,customer_id,total_amount,amount_paid,amount_due FROM sales WHERE id=? FOR UPDATE', [refId]);
            const sale = rows[0];
            if (sale) {
                const [[qist]] = await connection.execute("SELECT id FROM used_bike_sales WHERE sale_id=? AND payment_method='qist'", [sale.id]);
                if (qist) {
                    throw Object.assign(new Error('Record this instalment from Qist / Udhar to keep the plan up to date.'), { statusCode: 409 });
                }
            }
            if (!sale) { const error = new Error('Sale not found'); error.statusCode = 404; throw error; }
            if (sale.status !== 'completed') { const error = new Error('Only completed sales can receive payments'); error.statusCode = 409; throw error; }
            if (type !== 'received' || amount > Number(sale.amount_due)) { const error = new Error('Received amount must be positive and cannot exceed sale balance'); error.statusCode = 400; throw error; }
            customerId = sale.customer_id;
            const paid = Number(sale.amount_paid) + amount;
            const due = Number(sale.total_amount) - paid;
            await connection.execute('UPDATE sales SET amount_paid=?,amount_due=?,payment_status=? WHERE id=?', [paid, due, due <= 0 ? 'paid' : 'partial', sale.id]);
            if (customerId) await connection.execute('UPDATE customers SET outstanding_balance=GREATEST(0,outstanding_balance-?) WHERE id=?', [amount, customerId]);
        } else if (refId && refType === 'purchase') {
            const [rows] = await connection.execute('SELECT id,status,supplier_id,total_amount,amount_paid,amount_due FROM purchases WHERE id=? FOR UPDATE', [refId]);
            const purchase = rows[0];
            if (!purchase) { const error = new Error('Purchase not found'); error.statusCode = 404; throw error; }
            if (purchase.status === 'cancelled') { const error = new Error('Cancelled purchases cannot receive payments'); error.statusCode = 409; throw error; }
            if (type !== 'made' || amount > Number(purchase.amount_due)) { const error = new Error('Payment must be made and cannot exceed purchase balance'); error.statusCode = 400; throw error; }
            supplierId = purchase.supplier_id;
            const paid = Number(purchase.amount_paid) + amount;
            const due = Number(purchase.total_amount) - paid;
            await connection.execute('UPDATE purchases SET amount_paid=?,amount_due=?,payment_status=? WHERE id=?', [paid, due, due <= 0 ? 'paid' : 'partial', purchase.id]);
            if (supplierId) await connection.execute('UPDATE suppliers SET outstanding_balance=GREATEST(0,outstanding_balance-?) WHERE id=?', [amount, supplierId]);
        } else if (refId && refType === 'job_card') {
            const [rows] = await connection.execute('SELECT id,customer_id,total_cost,amount_paid FROM job_cards WHERE id=? FOR UPDATE', [refId]);
            const job = rows[0];
            if (!job) { const error = new Error('Job card not found'); error.statusCode = 404; throw error; }
            if (job.status === 'cancelled') { const error = new Error('Cancelled job cards cannot receive payments'); error.statusCode = 409; throw error; }
            if (type !== 'received') { const error = new Error('Job card payment must be received'); error.statusCode = 400; throw error; }
            if (amount > Number(job.total_cost) - Number(job.amount_paid) + 0.005) { const error = new Error('Job card payment cannot exceed the remaining balance'); error.statusCode = 400; throw error; }
            customerId = job.customer_id;
            const paid = Number(job.amount_paid) + amount;
            if (paid > Number(job.total_cost) + 0.005) { const error = new Error('Job card payments cannot exceed the job total'); error.statusCode = 400; throw error; }
            await connection.execute('UPDATE job_cards SET amount_paid=?,payment_status=? WHERE id=?', [paid, paid >= Number(job.total_cost) ? 'paid' : 'partial', job.id]);
            if (customerId) await connection.execute('UPDATE customers SET outstanding_balance=GREATEST(0,outstanding_balance-?) WHERE id=?', [amount, customerId]);
        } else if (refId && refType === 'order') {
            const [rows] = await connection.execute('SELECT id,status,total_amount,payment_status FROM orders WHERE id=? FOR UPDATE', [refId]);
            const order = rows[0];
            if (!order) { const error = new Error('Order not found'); error.statusCode = 404; throw error; }
            if (order.status === 'cancelled') { const error = new Error('Cancelled orders cannot receive payments'); error.statusCode = 409; throw error; }
            if (order.payment_status === 'refunded') { const error = new Error('Refunded order cannot accept payments'); error.statusCode = 409; throw error; }
            if (type !== 'received') { const error = new Error('Order payment must be received'); error.statusCode = 400; throw error; }
            const [[received]] = await connection.execute("SELECT COALESCE(SUM(amount),0) AS total FROM payments WHERE reference_type='order' AND reference_id=? AND payment_type='received'", [order.id]);
            if (Number(received.total) + amount > Number(order.total_amount) + 0.005) { const error = new Error('Order payments cannot exceed the order total'); error.statusCode = 400; throw error; }
            if (Number(received.total) + amount >= Number(order.total_amount)) await connection.execute("UPDATE orders SET payment_status='paid' WHERE id=?", [order.id]);
        }
        const number = makeDocumentNumber('PAY');
        const [insert] = await connection.execute(
            `INSERT INTO payments (payment_number,payment_type,reference_type,reference_id,customer_id,supplier_id,amount,payment_method,payment_date,bank_name,reference_number,notes,created_by)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [number, type, refType, refId, customerId, supplierId, amount, req.body.payment_method || 'cash', req.body.payment_date || new Date().toISOString().slice(0, 10), req.body.bank_name || null, req.body.reference_number || null, req.body.notes || null, req.user.id]
        );
        await recordAudit(connection, req, { action: 'payment', module: 'payments', recordId: insert.insertId, newValues: { number, type, refType, refId, amount }, description: `Payment ${number} recorded` });
        return { id: insert.insertId, payment_number: number, amount };
    });
    res.status(201).json({ success: true, data: result });
}));

router.get('/:id', requirePermission('payments.view'), [param('id').isInt({ min: 1 })], validate, asyncHandler(async (req, res) => {
    const payment = await queryOne('SELECT * FROM payments WHERE id=?', [req.params.id]);
    if (!payment) return res.status(404).json({ success: false, error: 'Payment not found' });
    res.json({ success: true, data: payment });
}));

module.exports = router;
