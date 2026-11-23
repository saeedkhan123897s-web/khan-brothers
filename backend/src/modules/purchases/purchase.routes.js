const express = require('express');
const { body, param, query: queryValidator } = require('express-validator');
const { authenticate } = require('../../middleware/auth');
const { requirePermission } = require('../../middleware/permissions');
const { validate } = require('../../middleware/validate');
const { transaction, queryOne, query } = require('../../config/database');
const { asyncHandler, paginationFrom, paginated, makeDocumentNumber, recordAudit } = require('../../utils/apiHelpers');

const router = express.Router();
router.use(authenticate);

router.get('/', requirePermission('purchases.view'), [
    queryValidator('page').optional().isInt({ min: 1 }),
    queryValidator('limit').optional().isInt({ min: 1, max: 100 }),
    queryValidator('status').optional().isIn(['pending', 'received', 'partial', 'cancelled']),
    queryValidator('payment_status').optional().isIn(['pending', 'partial', 'paid', 'overdue']),
    queryValidator('start_date').optional().isISO8601(), queryValidator('end_date').optional().isISO8601(), queryValidator('search').optional().trim()
], validate, asyncHandler(async (req, res) => {
    const { page, limit, offset } = paginationFrom(req.query);
    const clauses = [];
    const params = [];
    for (const key of ['status', 'payment_status', 'supplier_id']) {
        if (req.query[key]) { clauses.push(`p.${key} = ?`); params.push(req.query[key]); }
    }
    if (req.query.start_date) { clauses.push('p.purchase_date >= ?'); params.push(req.query.start_date); }
    if (req.query.end_date) { clauses.push('p.purchase_date <= ?'); params.push(req.query.end_date); }
    if (req.query.search) { clauses.push('(p.purchase_number LIKE ? OR p.supplier_name LIKE ?)'); params.push(`%${req.query.search}%`, `%${req.query.search}%`); }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const count = await queryOne(`SELECT COUNT(*) total FROM purchases p ${where}`, params);
    const rows = await query(`SELECT p.*, s.phone AS supplier_phone FROM purchases p LEFT JOIN suppliers s ON s.id=p.supplier_id ${where} ORDER BY p.purchase_date DESC,p.id DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
    res.json({ success: true, ...paginated(rows, count.total, page, limit) });
}));

router.post('/', requirePermission('purchases.create'), [
    body('items').isArray({ min: 1 }),
    body('items.*.product_id').isInt({ min: 1 }),
    body('items.*.quantity').isInt({ min: 1 }),
    body('items.*.cost_price').isFloat({ min: 0 }),
    body('supplier_id').optional({ nullable: true, checkFalsy: true }).isInt({ min: 1 }),
    body('discount_amount').optional().isFloat({ min: 0 }),
    body('shipping_cost').optional().isFloat({ min: 0 }),
    body('amount_paid').optional().isFloat({ min: 0 }),
    body('payment_method').optional().isIn(['cash', 'bank_transfer', 'card', 'credit'])
], validate, asyncHandler(async (req, res) => {
    const result = await transaction(async connection => {
        let supplier = null;
        if (req.body.supplier_id) {
            const [rows] = await connection.execute('SELECT id,name,phone FROM suppliers WHERE id=? AND is_active=1 FOR UPDATE', [req.body.supplier_id]);
            supplier = rows[0];
            if (!supplier) { const error = new Error('Supplier not found'); error.statusCode = 404; throw error; }
        }
        const items = [];
        let subtotal = 0;
        for (const requested of req.body.items) {
            const [rows] = await connection.execute('SELECT id,name,stock_quantity,is_active,motorcycle_condition FROM products WHERE id=? FOR UPDATE', [requested.product_id]);
            const product = rows[0];
            if (!product || !product.is_active) { const error = new Error(`Product ${requested.product_id} not found`); error.statusCode = 404; throw error; }
            if (product.motorcycle_condition === 'used') {
                throw Object.assign(new Error('Record used-bike acquisitions from Used motorcycles.'), { statusCode: 409 });
            }
            const quantity = Number(requested.quantity);
            const cost = Number(requested.cost_price);
            const lineTotal = quantity * cost;
            subtotal += lineTotal;
            items.push({ product, quantity, cost, lineTotal });
        }
        const discount = Number(req.body.discount_amount || 0);
        const shipping = Number(req.body.shipping_cost || 0);
        const total = Math.max(0, subtotal - discount + shipping);
        if (discount > subtotal) { const error = new Error('Discount cannot exceed subtotal'); error.statusCode = 400; throw error; }
        const requestedPaid = Number(req.body.amount_paid || 0);
        if (requestedPaid > total) { const error = new Error('amount_paid cannot exceed purchase total'); error.statusCode = 400; throw error; }
        const paid = requestedPaid;
        if (paid > 0 && req.body.payment_method === 'credit') { const error = new Error('Choose the actual payment method when recording an upfront payment'); error.statusCode = 400; throw error; }
        const due = total - paid;
        const status = due === 0 ? 'paid' : (paid > 0 ? 'partial' : 'pending');
        const number = makeDocumentNumber('PO');
        const [purchaseResult] = await connection.execute(
            `INSERT INTO purchases (purchase_number,supplier_id,supplier_name,purchase_date,subtotal,discount_amount,shipping_cost,total_amount,amount_paid,amount_due,payment_method,payment_status,notes,created_by,status)
             VALUES (?,?,?,CURRENT_DATE(),?,?,?,?,?,?,?,?,?,?,'pending')`,
            [number, supplier?.id || null, req.body.supplier_name || supplier?.name || null, subtotal, discount, shipping, total, paid, due, req.body.payment_method || 'cash', status, req.body.notes || null, req.user.id]
        );
        for (const item of items) {
            await connection.execute('INSERT INTO purchase_items (purchase_id,product_id,product_name,quantity,received_quantity,cost_price,subtotal) VALUES (?,?,?,?,0,?,?)', [purchaseResult.insertId, item.product.id, item.product.name, item.quantity, item.cost, item.lineTotal]);
        }
        if (supplier) await connection.execute('UPDATE suppliers SET outstanding_balance=outstanding_balance+? WHERE id=?', [due, supplier.id]);
        if (paid > 0) {
            await connection.execute(
                `INSERT INTO payments (payment_number,payment_type,reference_type,reference_id,supplier_id,amount,payment_method,payment_date,notes,created_by)
                 VALUES (?,'made','purchase',?,?,?,?,CURRENT_DATE(),?,?)`,
                [makeDocumentNumber('PAY'), purchaseResult.insertId, supplier?.id || null, paid, req.body.payment_method || 'cash', number, req.user.id]
            );
        }
        await recordAudit(connection, req, { action: 'purchase', module: 'purchases', recordId: purchaseResult.insertId, newValues: { number, total, due }, description: `Purchase ${number} created` });
        return { id: purchaseResult.insertId, purchase_number: number, subtotal, discount_amount: discount, shipping_cost: shipping, total_amount: total, amount_paid: paid, amount_due: due, payment_status: status, status: 'pending' };
    });
    res.status(201).json({ success: true, data: result });
}));

router.get('/returns', requirePermission('purchases.view'), [
    queryValidator('page').optional().isInt({ min: 1 }),
    queryValidator('limit').optional().isInt({ min: 1, max: 100 })
], validate, asyncHandler(async (req, res) => {
    const { page, limit, offset } = paginationFrom(req.query);
    const count = await queryOne('SELECT COUNT(*) AS total FROM purchase_returns');
    const rows = await query(`
        SELECT pr.*,p.purchase_number,s.name AS supplier_name,u.name AS processed_by_name
        FROM purchase_returns pr
        JOIN purchases p ON p.id=pr.purchase_id
        LEFT JOIN suppliers s ON s.id=pr.supplier_id
        LEFT JOIN users u ON u.id=pr.processed_by
        ORDER BY pr.return_date DESC,pr.id DESC
        LIMIT ? OFFSET ?`, [limit, offset]);
    res.json({ success: true, ...paginated(rows, count.total, page, limit) });
}));

router.post('/returns', requirePermission('purchases.manage'), [
    body('purchase_id').isInt({ min: 1 }),
    body('items').isArray({ min: 1 }),
    body('items.*.product_id').isInt({ min: 1 }),
    body('items.*.quantity').isInt({ min: 1 })
], validate, asyncHandler(async (req, res) => {
    const result = await transaction(async connection => {
        const [purchaseRows] = await connection.execute('SELECT * FROM purchases WHERE id=? FOR UPDATE', [req.body.purchase_id]);
        const purchase = purchaseRows[0];
        if (!purchase || purchase.status === 'cancelled') { const error = new Error('Received purchase not found'); error.statusCode = 404; throw error; }
        const [items] = await connection.execute('SELECT * FROM purchase_items WHERE purchase_id=? FOR UPDATE', [purchase.id]);
        const [priorRows] = await connection.execute(`SELECT pri.product_id,SUM(pri.quantity) AS quantity FROM purchase_return_items pri JOIN purchase_returns pr ON pr.id=pri.return_id WHERE pr.purchase_id=? AND pr.status='completed' GROUP BY pri.product_id`, [purchase.id]);
        const prior = new Map(priorRows.map(row => [Number(row.product_id), Number(row.quantity)]));
        const returnNumber = makeDocumentNumber('PR');
        const approved = [];
        let total = 0;
        for (const requested of req.body.items) {
            const item = items.find(row => Number(row.product_id) === Number(requested.product_id));
            const quantity = Number(requested.quantity);
            const alreadyReturned = prior.get(Number(requested.product_id)) || 0;
            if (!item || quantity < 1 || alreadyReturned + quantity > Number(item.received_quantity)) { const error = new Error(`Return quantity exceeds received quantity for product ${requested.product_id}`); error.statusCode = 400; throw error; }
            const amount = quantity * Number(item.cost_price);
            total += amount;
            approved.push({ item, quantity, amount });
        }
        const [returnResult] = await connection.execute(
            `INSERT INTO purchase_returns (return_number,purchase_id,supplier_id,return_date,total_amount,reason,status,processed_by) VALUES (?,?,?,CURRENT_DATE(),?,?, 'completed',?)`,
            [returnNumber, purchase.id, purchase.supplier_id, total, req.body.reason || null, req.user.id]
        );
        for (const row of approved) {
            const [products] = await connection.execute('SELECT stock_quantity,cost_price FROM products WHERE id=? FOR UPDATE', [row.item.product_id]);
            const product = products[0];
            if (Number(product.stock_quantity) < row.quantity) { const error = new Error(`Not enough current stock to return product ${row.item.product_id}`); error.statusCode = 409; throw error; }
            const previous = Number(product.stock_quantity);
            const next = previous - row.quantity;
            await connection.execute('UPDATE products SET stock_quantity=? WHERE id=?', [next, row.item.product_id]);
            await connection.execute('INSERT INTO purchase_return_items (return_id,product_id,quantity,cost_price,subtotal) VALUES (?,?,?,?,?)', [returnResult.insertId, row.item.product_id, row.quantity, row.item.cost_price, row.amount]);
            await connection.execute(`INSERT INTO stock_movements (product_id,movement_type,quantity,previous_stock,new_stock,cost_price,reference_type,reference_id,notes,created_by) VALUES (?,'return_out',?,?,?,?, 'purchase_return',?,?,?)`, [row.item.product_id, row.quantity, previous, next, product.cost_price, returnResult.insertId, returnNumber, req.user.id]);
        }
        if (purchase.supplier_id) {
            await connection.execute('UPDATE suppliers SET total_supplies=GREATEST(0,total_supplies-?),outstanding_balance=GREATEST(0,outstanding_balance-?) WHERE id=?', [total, Math.min(Number(purchase.amount_due), total), purchase.supplier_id]);
            await connection.execute(`INSERT INTO payments (payment_number,payment_type,reference_type,reference_id,supplier_id,amount,payment_method,payment_date,notes,created_by) VALUES (?,'received','purchase',?,?,?,'cash',CURRENT_DATE(),?,?)`, [makeDocumentNumber('PAY'), purchase.id, purchase.supplier_id, total, `Credit for return ${returnNumber}`, req.user.id]);
        }
        const remainingDue = Math.max(0, Number(purchase.amount_due) - Math.min(Number(purchase.amount_due), total));
        const refundedPaid = Math.max(0, total - Number(purchase.amount_due));
        const remainingPaid = Math.max(0, Number(purchase.amount_paid) - refundedPaid);
        const remainingTotal = Math.max(0, Number(purchase.total_amount) - total);
        const paymentStatus = remainingDue === 0 ? 'paid' : (remainingPaid > 0 ? 'partial' : 'pending');
        await connection.execute('UPDATE purchases SET total_amount=?,amount_paid=?,amount_due=?,payment_status=? WHERE id=?', [remainingTotal, remainingPaid, remainingDue, paymentStatus, purchase.id]);
        await recordAudit(connection, req, { action: 'refund', module: 'purchases', recordId: purchase.id, newValues: { returnNumber, total }, description: `Purchase return ${returnNumber} completed` });
        return { id: returnResult.insertId, return_number: returnNumber, total_amount: total };
    });
    res.status(201).json({ success: true, data: result });
}));

router.post('/:id/receive', requirePermission('purchases.manage'), [
    param('id').isInt({ min: 1 }), body('items').optional().isArray(),
    body('items.*.product_id').optional().isInt({ min: 1 }), body('items.*.quantity').optional().isInt({ min: 1 })
], validate, asyncHandler(async (req, res) => {
    const result = await transaction(async connection => {
        const [rows] = await connection.execute('SELECT * FROM purchases WHERE id=? FOR UPDATE', [req.params.id]);
        const purchase = rows[0];
        if (!purchase) { const error = new Error('Purchase not found'); error.statusCode = 404; throw error; }
        if (purchase.status === 'cancelled') { const error = new Error('Cancelled purchase cannot be received'); error.statusCode = 409; throw error; }
        const [purchaseItems] = await connection.execute('SELECT * FROM purchase_items WHERE purchase_id=? FOR UPDATE', [purchase.id]);
        const updates = (req.body.items || purchaseItems.map(item => ({ product_id: item.product_id, quantity: Number(item.quantity) - Number(item.received_quantity) }))).filter(item => Number(item.quantity) > 0);
        const requestedProductIds = updates.map(item => Number(item.product_id));
        if (new Set(requestedProductIds).size !== requestedProductIds.length) { const error = new Error('Each product can appear only once in a receipt'); error.statusCode = 400; throw error; }
        if (updates.length === 0) return { purchase_id: purchase.id, status: purchase.status, received_value: 0 };
        let receivedTotal = 0;
        for (const update of updates) {
            const item = purchaseItems.find(row => Number(row.product_id) === Number(update.product_id));
            const quantity = Number(update.quantity);
            if (!item || !Number.isInteger(quantity) || quantity < 1 || Number(item.received_quantity) + quantity > Number(item.quantity)) {
                const error = new Error(`Invalid received quantity for product ${update.product_id}`); error.statusCode = 400; throw error;
            }
            const [products] = await connection.execute('SELECT stock_quantity,cost_price FROM products WHERE id=? FOR UPDATE', [item.product_id]);
            const product = products[0];
            const oldStock = Number(product.stock_quantity);
            const newStock = oldStock + quantity;
            const newCost = newStock > 0 ? ((oldStock * Number(product.cost_price) + quantity * Number(item.cost_price)) / newStock) : Number(item.cost_price);
            await connection.execute('UPDATE products SET stock_quantity=?,cost_price=? WHERE id=?', [newStock, newCost, item.product_id]);
            await connection.execute('UPDATE purchase_items SET received_quantity=received_quantity+? WHERE purchase_id=? AND product_id=?', [quantity, purchase.id, item.product_id]);
            await connection.execute(
                `INSERT INTO stock_movements (product_id,movement_type,quantity,previous_stock,new_stock,cost_price,reference_type,reference_id,notes,created_by)
                 VALUES (?,'purchase',?,?,?,?, 'purchase',?,?,?)`,
                [item.product_id, quantity, oldStock, newStock, item.cost_price, purchase.id, purchase.purchase_number, req.user.id]
            );
            receivedTotal += quantity * Number(item.cost_price);
        }
        const [remaining] = await connection.execute('SELECT COUNT(*) AS count FROM purchase_items WHERE purchase_id=? AND received_quantity < quantity', [purchase.id]);
        const nextStatus = Number(remaining[0].count) === 0 ? 'received' : 'partial';
        await connection.execute('UPDATE purchases SET status=? WHERE id=?', [nextStatus, purchase.id]);
        if (purchase.supplier_id) await connection.execute('UPDATE suppliers SET total_supplies=total_supplies+? WHERE id=?', [receivedTotal, purchase.supplier_id]);
        await recordAudit(connection, req, { action: 'update', module: 'purchases', recordId: purchase.id, oldValues: { status: purchase.status }, newValues: { status: nextStatus, received: receivedTotal }, description: `Purchase ${purchase.purchase_number} received` });
        return { purchase_id: purchase.id, status: nextStatus, received_value: receivedTotal };
    });
    res.json({ success: true, data: result });
}));

router.get('/:id', requirePermission('purchases.view'), [param('id').isInt({ min: 1 })], validate, asyncHandler(async (req, res) => {
    const purchase = await queryOne('SELECT * FROM purchases WHERE id=?', [req.params.id]);
    if (!purchase) return res.status(404).json({ success: false, error: 'Purchase not found' });
    const items = await query('SELECT * FROM purchase_items WHERE purchase_id=? ORDER BY id', [purchase.id]);
    const payments = await query("SELECT * FROM payments WHERE reference_type='purchase' AND reference_id=? ORDER BY payment_date,id", [purchase.id]);
    const returnedItems = await query(`SELECT pri.product_id,SUM(pri.quantity) AS returned_quantity
        FROM purchase_return_items pri JOIN purchase_returns pr ON pr.id=pri.return_id
        WHERE pr.purchase_id=? AND pr.status='completed' GROUP BY pri.product_id`, [purchase.id]);
    res.json({ success: true, data: { ...purchase, items, payments, returned_items: returnedItems } });
}));

router.patch('/:id/status', requirePermission('purchases.manage'), [param('id').isInt({ min: 1 }), body('status').isIn(['cancelled'])], validate, asyncHandler(async (req, res) => {
    const result = await transaction(async connection => {
        const [rows] = await connection.execute('SELECT * FROM purchases WHERE id=? FOR UPDATE', [req.params.id]);
        const purchase = rows[0];
        if (!purchase) { const error = new Error('Purchase not found'); error.statusCode = 404; throw error; }
        const [[received]] = await connection.execute('SELECT COALESCE(SUM(received_quantity),0) AS total FROM purchase_items WHERE purchase_id=?', [purchase.id]);
        if (Number(received.total) > 0 || Number(purchase.amount_paid) > 0) { const error = new Error('A purchase with received goods or payments cannot be cancelled'); error.statusCode = 409; throw error; }
        await connection.execute("UPDATE purchases SET status='cancelled' WHERE id=?", [purchase.id]);
        if (purchase.supplier_id) await connection.execute('UPDATE suppliers SET outstanding_balance=GREATEST(0,outstanding_balance-?) WHERE id=?', [purchase.amount_due, purchase.supplier_id]);
        await recordAudit(connection, req, { action: 'update', module: 'purchases', recordId: purchase.id, oldValues: { status: purchase.status }, newValues: { status: 'cancelled' } });
        return { id: purchase.id, status: 'cancelled' };
    });
    res.json({ success: true, data: result });
}));

module.exports = router;
