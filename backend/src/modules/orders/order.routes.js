const express = require('express');
const { businessDay } = require('../used-bikes/used-bike.payments');
const { body, param, query: queryValidator } = require('express-validator');
const { authenticate, optionalAuth } = require('../../middleware/auth');
const { requirePermission } = require('../../middleware/permissions');
const { validate } = require('../../middleware/validate');
const { transaction, queryOne, query } = require('../../config/database');
const { asyncHandler, paginationFrom, paginated, makeDocumentNumber, recordAudit, uniqueProducts } = require('../../utils/apiHelpers');

const router = express.Router();

router.get('/tracking/:orderNumber', asyncHandler(async (req, res) => {
    const order = await queryOne('SELECT order_number,status,tracking_number,created_at,updated_at FROM orders WHERE order_number=?', [req.params.orderNumber]);
    if (!order) return res.status(404).json({ success: false, error: 'Order not found' });
    res.json({ success: true, data: order });
}));

router.post('/', optionalAuth, [
    body('items').isArray({ min: 1 }).bail().custom(uniqueProducts).withMessage('Each product can appear only once'),
    body('items.*.product_id').isInt({ min: 1 }),
    body('items.*.quantity').isInt({ min: 1 }),
    body('customer_name').trim().isLength({ min: 2, max: 100 }),
    body('customer_email').optional({ checkFalsy: true }).isEmail().normalizeEmail().isLength({ max: 100 }),
    body('customer_phone').trim().notEmpty().isLength({ max: 20 }),
    body('shipping_address').trim().notEmpty(),
    body('shipping_cost').optional().isFloat({ min: 0 }),
    body('payment_method').optional().isIn(['cash', 'bank_transfer', 'card', 'digital_wallet', 'credit']),
    body('notes').optional({ nullable: true }).isString()
], validate, asyncHandler(async (req, res) => {
    const result = await transaction(async connection => {
        let subtotal = 0;
        const items = [];
        for (const requested of req.body.items) {
            const [rows] = await connection.execute('SELECT id,name,selling_price,stock_quantity,is_active FROM products WHERE id=? FOR UPDATE', [requested.product_id]);
            const product = rows[0];
            if (!product || !product.is_active) { const error = new Error(`Product ${requested.product_id} not found`); error.statusCode = 404; throw error; }
            const quantity = Number(requested.quantity);
            if (Number(product.stock_quantity) < quantity) { const error = new Error(`Insufficient stock for ${product.name}`); error.statusCode = 409; throw error; }
            const unitPrice = Number(product.selling_price);
            subtotal += unitPrice * quantity;
            items.push({ product, quantity, unitPrice, subtotal: unitPrice * quantity });
        }
        const shipping = Math.max(0, Number(req.body.shipping_cost || 0));
        const total = subtotal + shipping;
        const orderNumber = makeDocumentNumber('ORD');
        const [insert] = await connection.execute(
            `INSERT INTO orders (order_number,customer_id,customer_name,customer_email,customer_phone,shipping_address,subtotal,shipping_cost,total_amount,payment_method,payment_status,status,notes)
             VALUES (?,NULL,?,?,?,?,?,?,?,?,'pending','pending',?)`,
            [orderNumber, req.body.customer_name, req.body.customer_email || null, req.body.customer_phone, req.body.shipping_address, subtotal, shipping, total, req.body.payment_method || 'cash', req.body.notes || null]
        );
        for (const item of items) {
            await connection.execute('INSERT INTO order_items (order_id,product_id,product_name,quantity,unit_price,subtotal) VALUES (?,?,?,?,?,?)', [insert.insertId, item.product.id, item.product.name, item.quantity, item.unitPrice, item.subtotal]);
        }
        return { id: insert.insertId, order_number: orderNumber, subtotal, shipping_cost: shipping, total_amount: total, status: 'pending' };
    });
    res.status(201).json({ success: true, data: result });
}));

router.get('/', authenticate, requirePermission('orders.view'), [
    queryValidator('page').optional().isInt({ min: 1 }),
    queryValidator('limit').optional().isInt({ min: 1, max: 100 }),
    queryValidator('status').optional().isIn(['open', 'pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled']),
    queryValidator('search').optional().trim().isLength({ max: 100 })
], validate, asyncHandler(async (req, res) => {
    const { page, limit, offset } = paginationFrom(req.query);
    const clauses = [];
    const params = [];
    if (req.query.status === 'open') clauses.push("status IN ('pending','confirmed','processing')");
    else if (req.query.status) { clauses.push('status=?'); params.push(req.query.status); }
    if (req.query.search) { clauses.push('(order_number LIKE ? OR customer_name LIKE ? OR customer_phone LIKE ?)'); params.push(...Array(3).fill(`%${req.query.search}%`)); }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const count = await queryOne(`SELECT COUNT(*) total FROM orders ${where}`, params);
    const rows = await query(`SELECT * FROM orders ${where} ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
    res.json({ success: true, ...paginated(rows, count.total, page, limit) });
}));

router.patch('/:id/status', authenticate, requirePermission('orders.manage'), [
    param('id').isInt({ min: 1 }),
    body('status').isIn(['confirmed', 'processing', 'shipped', 'delivered', 'cancelled']),
    body('tracking_number').optional().isLength({ max: 50 })
], validate, asyncHandler(async (req, res) => {
    const order = await transaction(async connection => {
        const [rows] = await connection.execute('SELECT * FROM orders WHERE id=? FOR UPDATE', [req.params.id]);
        const current = rows[0];
        if (!current) { const error = new Error('Order not found'); error.statusCode = 404; throw error; }
        const nextStatus = req.body.status;
        const allowed = {
            pending: ['confirmed', 'cancelled'],
            confirmed: ['processing', 'cancelled'],
            processing: ['shipped', 'cancelled'],
            shipped: ['delivered'],
            delivered: [],
            cancelled: []
        };
        if (!allowed[current.status]?.includes(nextStatus)) { const error = new Error(`Order cannot move from ${current.status} to ${nextStatus}`); error.statusCode = 409; throw error; }
        const [items] = await connection.execute('SELECT * FROM order_items WHERE order_id=?', [current.id]);
        if (current.status === 'pending' && nextStatus === 'confirmed') {
            for (const item of items) {
                const [products] = await connection.execute('SELECT stock_quantity,cost_price,is_active FROM products WHERE id=? FOR UPDATE', [item.product_id]);
                const product = products[0];
                if (product && !product.is_active) {
                    throw Object.assign(new Error('A product in this order is no longer listed for sale.'), { statusCode: 409 });
                }
                if (!product || Number(product.stock_quantity) < Number(item.quantity)) { const error = new Error(`Insufficient stock for product ${item.product_id}`); error.statusCode = 409; throw error; }
                const before = Number(product.stock_quantity);
                const after = before - Number(item.quantity);
                await connection.execute('UPDATE products SET stock_quantity=? WHERE id=?', [after, item.product_id]);
                await connection.execute(`INSERT INTO stock_movements (product_id,movement_type,quantity,previous_stock,new_stock,cost_price,reference_type,reference_id,notes,created_by) VALUES (?,'sale',?,?,?,?, 'order',?,?,?)`, [item.product_id, item.quantity, before, after, product.cost_price, current.id, current.order_number, req.user.id]);
            }
        }
        if (nextStatus === 'cancelled' && current.status !== 'pending') {
            for (const item of items) {
                const [products] = await connection.execute('SELECT stock_quantity,cost_price FROM products WHERE id=? FOR UPDATE', [item.product_id]);
                if (!products[0]) continue;
                const before = Number(products[0].stock_quantity);
                const after = before + Number(item.quantity);
                await connection.execute('UPDATE products SET stock_quantity=? WHERE id=?', [after, item.product_id]);
                await connection.execute(`INSERT INTO stock_movements (product_id,movement_type,quantity,previous_stock,new_stock,cost_price,reference_type,reference_id,notes,created_by) VALUES (?,'return_in',?,?,?,?, 'order',?,?,?)`, [item.product_id, item.quantity, before, after, products[0].cost_price, current.id, `Cancellation ${current.order_number}`, req.user.id]);
            }
        }
        await connection.execute('UPDATE orders SET status=?,tracking_number=COALESCE(?,tracking_number),delivered_on=COALESCE(?,delivered_on) WHERE id=?', [nextStatus, req.body.tracking_number || null, nextStatus === 'delivered' ? businessDay() : null, current.id]);
        await recordAudit(connection, req, { action: 'update', module: 'orders', recordId: current.id, oldValues: { status: current.status }, newValues: { status: nextStatus }, description: `Order ${current.order_number} status changed` });
        return { ...current, status: nextStatus, tracking_number: req.body.tracking_number || current.tracking_number };
    });
    res.json({ success: true, data: order });
}));

router.get('/:id', authenticate, requirePermission('orders.view'), [param('id').isInt({ min: 1 })], validate, asyncHandler(async (req, res) => {
    const order = await queryOne('SELECT * FROM orders WHERE id=?', [req.params.id]);
    if (!order) return res.status(404).json({ success: false, error: 'Order not found' });
    const items = await query('SELECT * FROM order_items WHERE order_id=?', [order.id]);
    res.json({ success: true, data: { ...order, items } });
}));

router.get('/number/:orderNumber', asyncHandler(async (req, res) => {
    const order = await queryOne('SELECT * FROM orders WHERE order_number=?', [req.params.orderNumber]);
    if (!order) return res.status(404).json({ success: false, error: 'Order not found' });
    const items = await query('SELECT product_name,quantity,unit_price,subtotal FROM order_items WHERE order_id=?', [order.id]);
    res.json({ success: true, data: { order_number: order.order_number, status: order.status, tracking_number: order.tracking_number, created_at: order.created_at, items } });
}));

module.exports = router;
