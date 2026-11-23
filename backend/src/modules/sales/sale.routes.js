const express = require('express');
const { body, param, query: queryValidator } = require('express-validator');
const { authenticate } = require('../../middleware/auth');
const { requirePermission } = require('../../middleware/permissions');
const { hasPermission, getOverrides } = require('../../utils/routePermissions');
const { validate } = require('../../middleware/validate');
const { transaction, queryOne, query } = require('../../config/database');
const { asyncHandler, paginationFrom, paginated, makeDocumentNumber, recordAudit, uniqueProducts, documentNumber } = require('../../utils/apiHelpers');

const router = express.Router();
router.use(authenticate);

router.get('/', requirePermission('sales.view'), [
    queryValidator('page').optional().isInt({ min: 1 }),
    queryValidator('limit').optional().isInt({ min: 1, max: 100 }),
    queryValidator('start_date').optional().isISO8601(),
    queryValidator('end_date').optional().isISO8601(),
    queryValidator('payment_status').optional().isIn(['pending', 'partial', 'paid', 'refunded', 'overdue']),
    queryValidator('status').optional().isIn(['completed', 'cancelled', 'returned']),
    queryValidator('search').optional().trim()
], validate, asyncHandler(async (req, res) => {
    const { page, limit, offset } = paginationFrom(req.query);
    const where = [];
    const params = [];
    if (req.query.start_date) { where.push('s.sale_date >= ?'); params.push(req.query.start_date); }
    if (req.query.end_date) { where.push('s.sale_date <= ?'); params.push(req.query.end_date); }
    if (req.query.payment_status) { where.push('s.payment_status = ?'); params.push(req.query.payment_status); }
    if (req.query.status) { where.push('s.status = ?'); params.push(req.query.status); }
    if (req.query.search) { where.push('(s.invoice_number LIKE ? OR s.customer_name LIKE ? OR s.customer_phone LIKE ?)'); params.push(...Array(3).fill(`%${req.query.search}%`)); }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const count = await queryOne(`SELECT COUNT(*) total FROM sales s ${whereSql}`, params);
    const rows = await query(`SELECT s.*, u.name AS cashier_name FROM sales s LEFT JOIN users u ON u.id = s.created_by ${whereSql} ORDER BY s.sale_date DESC, s.id DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
    res.json({ success: true, ...paginated(rows, count.total, page, limit) });
}));

router.get('/returns', requirePermission('sales.view'), asyncHandler(async (req, res) => {
    const { page, limit, offset } = paginationFrom(req.query);
    const count = await queryOne('SELECT COUNT(*) total FROM sale_returns');
    const rows = await query('SELECT * FROM sale_returns ORDER BY return_date DESC, id DESC LIMIT ? OFFSET ?', [limit, offset]);
    res.json({ success: true, ...paginated(rows, count.total, page, limit) });
}));

router.post('/returns', requirePermission('sales.return'), [
    body('sale_id').isInt({ min: 1 }),
    body('items').isArray({ min: 1 }),
    body('items.*.product_id').isInt({ min: 1 }),
    body('items.*.quantity').isInt({ min: 1 }),
    body('items.*.condition_status').optional().isIn(['good', 'damaged', 'defective']),
    body('refund_method').optional().isIn(['cash', 'bank_transfer', 'credit_note'])
], validate, asyncHandler(async (req, res) => {
    const result = await transaction(async connection => {
        const [[sale]] = await connection.execute('SELECT * FROM sales WHERE id = ? FOR UPDATE', [req.body.sale_id]);
        if (!sale || sale.status !== 'completed') {
            const error = new Error('Completed sale not found'); error.statusCode = 404; throw error;
        }
        const [soldItems] = await connection.execute(`SELECT product_id,SUM(quantity) AS quantity,SUM(unit_price*quantity)/SUM(quantity) AS unit_price,SUM(discount_amount) AS discount_amount
            FROM sale_items WHERE sale_id=? GROUP BY product_id`, [sale.id]);
        const [previousReturns] = await connection.execute(
            `SELECT sri.product_id, SUM(sri.quantity) quantity FROM sale_return_items sri
             JOIN sale_returns sr ON sr.id = sri.return_id WHERE sr.sale_id = ? AND sr.status = 'completed' GROUP BY sri.product_id`,
            [sale.id]
        );
        const returnedByProduct = new Map(previousReturns.map(row => [Number(row.product_id), Number(row.quantity)]));
        const requestedProductIds = req.body.items.map(item => Number(item.product_id));
        if (new Set(requestedProductIds).size !== requestedProductIds.length) { const error = new Error('Each product can appear only once in a return'); error.statusCode = 400; throw error; }
        let refundTotal = 0;
        const details = [];
        for (const item of req.body.items) {
            const sold = soldItems.find(row => Number(row.product_id) === Number(item.product_id));
            const prior = returnedByProduct.get(Number(item.product_id)) || 0;
            if (!sold || Number(item.quantity) + prior > Number(sold.quantity)) {
                const error = new Error(`Return quantity exceeds sold quantity for product ${item.product_id}`); error.statusCode = 400; throw error;
            }
            const quantity = Number(item.quantity);
            const unitPrice = Number(sold.unit_price);
            const allocatedDiscount = Number(sold.discount_amount || 0) / Number(sold.quantity) * quantity;
            const subtotal = Math.max(0, unitPrice * quantity - allocatedDiscount);
            refundTotal += subtotal;
            details.push({ ...item, quantity, unitPrice, subtotal, condition: item.condition_status || 'good' });
        }
        const returnNumber = makeDocumentNumber('SR');
        const [returnResult] = await connection.execute(
            `INSERT INTO sale_returns (return_number,sale_id,invoice_number,customer_id,return_date,total_amount,refund_method,reason,notes,status,processed_by)
             VALUES (?,?,?,?,CURRENT_DATE(),?,?,?,?, 'completed',?)`,
            [returnNumber, sale.id, sale.invoice_number, sale.customer_id, refundTotal, req.body.refund_method || 'cash', req.body.reason || null, req.body.notes || null, req.user.id]
        );
        for (const item of details) {
            await connection.execute(
                'INSERT INTO sale_return_items (return_id,product_id,quantity,unit_price,subtotal,condition_status) VALUES (?,?,?,?,?,?)',
                [returnResult.insertId, item.product_id, item.quantity, item.unitPrice, item.subtotal, item.condition]
            );
            const [[product]] = await connection.execute(
                'SELECT stock_quantity,cost_price,motorcycle_condition FROM products WHERE id = ? FOR UPDATE', [item.product_id]);
            const usedBike = product.motorcycle_condition === 'used';
            if (item.condition === 'good' || usedBike) {
                const previous = Number(product.stock_quantity);
                const next = previous + item.quantity;
                if (usedBike && next !== 1) {
                    throw Object.assign(new Error('This used motorcycle is already in stock.'), { statusCode: 409 });
                }
                await connection.execute('UPDATE products SET stock_quantity=?,is_active=IF(?,0,is_active) WHERE id=?',
                    [next, usedBike, item.product_id]);
                await connection.execute(
                    `INSERT INTO stock_movements (product_id,movement_type,quantity,previous_stock,new_stock,cost_price,reference_type,reference_id,notes,created_by)
                     VALUES (?,'return_in',?,?,?,?, 'sale_return',?,?,?)`,
                    [item.product_id, item.quantity, previous, next, product.cost_price, returnResult.insertId, returnNumber, req.user.id]
                );
            }
        }
        const newTotal = Math.max(0, Number(sale.total_amount) - refundTotal);
        const newPaid = Math.max(0, Number(sale.amount_paid) - Math.min(Number(sale.amount_paid), refundTotal));
        const newDue = Math.max(0, newTotal - newPaid);
        const paymentStatus = newTotal === 0 ? 'refunded' : (newDue === 0 ? 'paid' : (newPaid > 0 ? 'partial' : 'pending'));
        await connection.execute('UPDATE sales SET total_amount=?, amount_paid=?, amount_due=?, payment_status=?, status=? WHERE id=?', [newTotal, newPaid, newDue, paymentStatus, newTotal === 0 ? 'returned' : 'completed', sale.id]);
        if (refundTotal > 0 && sale.customer_id) {
            await connection.execute('UPDATE customers SET outstanding_balance=GREATEST(0,outstanding_balance-?), total_purchases=GREATEST(0,total_purchases-?) WHERE id=?', [Math.min(Number(sale.amount_due), refundTotal), refundTotal, sale.customer_id]);
        }
        if (refundTotal > 0 && Number(sale.amount_paid) > 0) {
            await connection.execute(
                `INSERT INTO payments (payment_number,payment_type,reference_type,reference_id,customer_id,amount,payment_method,payment_date,notes,created_by)
                 VALUES (?,'made','sale',?,?,?,?,CURRENT_DATE(),?,?)`,
                [makeDocumentNumber('PAY'), sale.id, sale.customer_id, Math.min(Number(sale.amount_paid), refundTotal), req.body.refund_method === 'bank_transfer' ? 'bank_transfer' : 'cash', `Refund for ${returnNumber}`, req.user.id]
            );
        }
        await recordAudit(connection, req, { action: 'refund', module: 'sales', recordId: sale.id, newValues: { returnNumber, refundTotal }, description: `Sale return ${returnNumber} completed` });
        return { id: returnResult.insertId, return_number: returnNumber, total_amount: refundTotal };
    });
    res.status(201).json({ success: true, data: result });
}));

router.post('/', requirePermission('sales.create'), [
    body('items').isArray({ min: 1 }).withMessage('At least one sale item is required').bail().custom(uniqueProducts).withMessage('Each product can appear only once'),
    body('items.*.product_id').isInt({ min: 1 }),
    body('items.*.quantity').isInt({ min: 1 }),
    body('customer_id').optional({ nullable: true, checkFalsy: true }).isInt({ min: 1 }),
    body('discount_type').optional().isIn(['none', 'percentage', 'fixed']),
    body('customer_type').optional().isIn(['retail', 'wholesale']),
    body('discount_value').optional().isFloat({ min: 0 }),
    body('amount_paid').optional().isFloat({ min: 0 }),
    body('payment_method').optional().isIn(['cash', 'bank_transfer', 'card', 'digital_wallet', 'credit', 'split']),
    body('payment_breakdown').optional().isArray(),
    body('payment_breakdown.*.amount').optional().isFloat({ min: 0.01 }),
    body('payment_breakdown.*.method').optional().isIn(['cash', 'bank_transfer', 'card', 'digital_wallet', 'cheque'])
], validate, asyncHandler(async (req, res) => {
    const result = await transaction(async connection => {
        let customer = null;
        if (req.body.customer_id) {
            const [customers] = await connection.execute('SELECT id,name,phone,customer_type FROM customers WHERE id=? AND is_active=1 FOR UPDATE', [req.body.customer_id]);
            customer = customers[0];
            if (!customer) { const error = new Error('Customer not found'); error.statusCode = 404; throw error; }
        }
        const saleItems = [];
        let subtotal = 0;
        for (const requested of req.body.items) {
            const [products] = await connection.execute('SELECT id,sku,name,cost_price,selling_price,wholesale_price,stock_quantity,is_active FROM products WHERE id=? FOR UPDATE', [requested.product_id]);
            const product = products[0];
            if (!product || !product.is_active) { const error = new Error(`Product ${requested.product_id} not found`); error.statusCode = 404; throw error; }
            const quantity = Number(requested.quantity);
            if (Number(product.stock_quantity) < quantity) { const error = new Error(`Insufficient stock for ${product.name}`); error.statusCode = 409; throw error; }
            const type = customer?.customer_type || req.body.customer_type || 'retail';
            const unitPrice = Number(type === 'wholesale' && Number(product.wholesale_price) > 0 ? product.wholesale_price : product.selling_price);
            const lineSubtotal = unitPrice * quantity;
            subtotal += lineSubtotal;
            saleItems.push({ product, quantity, unitPrice, lineSubtotal });
        }
        const discountType = req.body.discount_type || 'none';
        const discountValue = Number(req.body.discount_value || 0);
        if (discountType !== 'none' && !hasPermission(req.user, 'sales.discount', await getOverrides(req))) {
            const error = new Error('Only management can apply a discount'); error.statusCode = 403; throw error;
        }
        const discountAmount = discountType === 'percentage' ? subtotal * discountValue / 100 : discountType === 'fixed' ? discountValue : 0;
        if (discountAmount > subtotal) { const error = new Error('Discount cannot exceed subtotal'); error.statusCode = 400; throw error; }
        const [[taxEnabled], [taxRate]] = await Promise.all([
            connection.execute("SELECT setting_value FROM settings WHERE setting_key='tax_enabled' LIMIT 1"),
            connection.execute("SELECT setting_value FROM settings WHERE setting_key='tax_rate' LIMIT 1")
        ]);
        const taxAmount = String(taxEnabled[0]?.setting_value).toLowerCase() === 'true' ? (subtotal - discountAmount) * (Number(taxRate[0]?.setting_value) || 0) / 100 : 0;
        const total = Math.max(0, subtotal - discountAmount + taxAmount);
        const requestedPaid = Number(req.body.amount_paid || 0);
        if (!Number.isFinite(requestedPaid) || requestedPaid < 0) { const error = new Error('amount_paid must be a non-negative number'); error.statusCode = 400; throw error; }
        const paid = Math.min(requestedPaid, total);
        const change = Math.max(0, requestedPaid - total);
        const due = Math.max(0, total - paid);
        const paymentMethod = req.body.payment_method || (due > 0 ? 'credit' : 'cash');
        if (paymentMethod === 'credit' && paid > 0) { const error = new Error('Choose the actual tender method for a sale with an upfront payment'); error.statusCode = 400; throw error; }
        if (paymentMethod === 'split' && paid > 0) {
            const breakdownTotal = (req.body.payment_breakdown || []).reduce((sum, item) => sum + Number(item.amount || 0), 0);
            if (Math.abs(breakdownTotal - paid) > 0.005) { const error = new Error('Split payment breakdown must equal amount_paid'); error.statusCode = 400; throw error; }
        }
        const invoiceNumber = await documentNumber(connection, 'invoice_prefix', 'INV');
        const paymentStatus = due === 0 ? 'paid' : (paid > 0 ? 'partial' : 'pending');
        const [saleResult] = await connection.execute(
            `INSERT INTO sales (invoice_number,customer_id,customer_name,customer_phone,customer_type,sale_date,subtotal,discount_type,discount_value,discount_amount,tax_amount,total_amount,amount_paid,amount_due,change_return,payment_method,payment_status,notes,created_by,status)
             VALUES (?,?,?,?,?,CURRENT_DATE(),?,?,?,?,?,?,?,?,?,?,?,?,?,'completed')`,
            [invoiceNumber, customer?.id || null, req.body.customer_name || customer?.name || null, req.body.customer_phone || customer?.phone || null, customer?.customer_type || req.body.customer_type || 'retail', subtotal, discountType, discountValue, discountAmount, taxAmount, total, paid, due, change, paymentMethod, paymentStatus, req.body.notes || null, req.user.id]
        );
        for (const item of saleItems) {
            const lineDiscount = subtotal > 0 ? discountAmount * item.lineSubtotal / subtotal : 0;
            const lineProfit = (item.unitPrice - Number(item.product.cost_price)) * item.quantity - lineDiscount;
            await connection.execute(
                'INSERT INTO sale_items (sale_id,product_id,product_name,product_sku,quantity,unit_price,cost_price,discount_amount,subtotal,profit) VALUES (?,?,?,?,?,?,?,?,?,?)',
                [saleResult.insertId, item.product.id, item.product.name, item.product.sku, item.quantity, item.unitPrice, item.product.cost_price, lineDiscount, item.lineSubtotal - lineDiscount, lineProfit]
            );
            const nextStock = Number(item.product.stock_quantity) - item.quantity;
            await connection.execute('UPDATE products SET stock_quantity=? WHERE id=?', [nextStock, item.product.id]);
            await connection.execute(
                `INSERT INTO stock_movements (product_id,movement_type,quantity,previous_stock,new_stock,cost_price,reference_type,reference_id,notes,created_by)
                 VALUES (?,'sale',?,?,?,?, 'sale',?,?,?)`,
                [item.product.id, item.quantity, item.product.stock_quantity, nextStock, item.product.cost_price, saleResult.insertId, invoiceNumber, req.user.id]
            );
        }
        if (customer) {
            await connection.execute('UPDATE customers SET outstanding_balance=outstanding_balance+?, total_purchases=total_purchases+? WHERE id=?', [due, total, customer.id]);
        }
        const payments = paymentMethod === 'split' ? req.body.payment_breakdown || [] : (paid > 0 ? [{ amount: paid, method: paymentMethod }] : []);
        for (const payment of payments) {
            if (!['cash', 'bank_transfer', 'card', 'digital_wallet', 'cheque'].includes(payment.method || payment.payment_method)) { const error = new Error('Unsupported payment method in payment breakdown'); error.statusCode = 400; throw error; }
            await connection.execute(
                `INSERT INTO payments (payment_number,payment_type,reference_type,reference_id,customer_id,amount,payment_method,payment_date,notes,created_by)
                 VALUES (?,'received','sale',?,?,?,?,CURRENT_DATE(),?,?)`,
                [makeDocumentNumber('PAY'), saleResult.insertId, customer?.id || null, Number(payment.amount), payment.method || payment.payment_method, invoiceNumber, req.user.id]
            );
        }
        await recordAudit(connection, req, { action: 'sale', module: 'sales', recordId: saleResult.insertId, newValues: { invoiceNumber, total, paid, due }, description: `Sale ${invoiceNumber} created` });
        return { id: saleResult.insertId, invoice_number: invoiceNumber, subtotal, discount_amount: discountAmount, tax_amount: taxAmount, total_amount: total, amount_paid: paid, amount_due: due, change_return: change };
    });
    res.status(201).json({ success: true, data: result });
}));

async function loadSale(req, res, identifier, field = 'id') {
    const sale = await queryOne(`SELECT * FROM sales WHERE ${field}=?`, [identifier]);
    if (!sale) return res.status(404).json({ success: false, error: 'Sale not found' });
    const items = await query('SELECT * FROM sale_items WHERE sale_id=? ORDER BY id', [sale.id]);
    const payments = await query("SELECT * FROM payments WHERE reference_type='sale' AND reference_id=? ORDER BY payment_date,id", [sale.id]);
    const canSeeCost = hasPermission(req.user, 'inventory.finance', await getOverrides(req));
    const presentedItems = canSeeCost ? items : items.map(({ cost_price, profit, ...item }) => item);
    res.json({ success: true, data: { ...sale, items: presentedItems, payments } });
}

router.get('/invoice/:invoiceNumber', requirePermission('sales.view'), asyncHandler(async (req, res) => loadSale(req, res, req.params.invoiceNumber, 'invoice_number')));
router.get('/:id', requirePermission('sales.view'), [param('id').isInt({ min: 1 })], validate, asyncHandler(async (req, res) => loadSale(req, res, req.params.id)));

module.exports = router;
