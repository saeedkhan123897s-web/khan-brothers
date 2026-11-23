'use strict';

const express = require('express');
const { body, param } = require('express-validator');
const { requirePermission } = require('../../middleware/permissions');
const { validate } = require('../../middleware/validate');
const { queryOne, transaction } = require('../../config/database');
const { asyncHandler, documentNumber, recordAudit } = require('../../utils/apiHelpers');
const { methods, moneyMethods, enabledMethods, ledgerMethod, recordSalePayment, businessDay } = require('./used-bike.payments');

const router = express.Router();
const sell = requirePermission('used_bikes.sell');
const viewSales = requirePermission('used_bikes.view', 'used_bikes.sell');
const idRule = param('id').isInt({ min: 1 });
const keyRule = body('request_key').optional().isUUID(4).toLowerCase();
const money = (name, min = 0) => body(name).isDecimal({ decimal_digits: '0,2' }).bail().isFloat({ min, max: 99999999.99 });
const nextDate = body('next_due_date').optional().isISO8601({ strict: true }).matches(/^\d{4}-\d{2}-\d{2}$/);
const cents = amount => Math.round(Number(amount) * 100);
const failure = (statusCode, message) => Object.assign(new Error(message), { statusCode });

router.get('/payment-methods', requirePermission('used_bikes.sell', 'used_bikes.view', 'settings.view'),
    asyncHandler(async (_req, res) => {
        const keys = await enabledMethods();
        res.json({ success: true, data: keys.map(key => ({ key, label: methods[key] })) });
    }));

router.post('/:id/sell', sell, idRule, [
    keyRule, money('selling_price', 0.01), money('advance').optional(), money('monthly_installment', 0.01).optional(), nextDate,
    body('interest_rate').optional().isDecimal({ decimal_digits: '0,2' }).bail().isFloat({ min: 0, max: 999.99 }),
    body('payment_method').isIn(Object.keys(methods)),
    body('advance_method').optional().isIn(moneyMethods),
    body('customer_name').trim().isLength({ min: 2, max: 100 }),
    body('customer_phone').trim().isLength({ min: 7, max: 20 }).matches(/^[0-9+()\s-]+$/),
    body('customer_cnic').optional().trim().matches(/^\d{5}-?\d{7}-?\d$/)
], validate, asyncHandler(async (req, res) => {
    const data = req.body;
    const qist = data.payment_method === 'qist';
    const today = businessDay();
    const bikePrice = cents(data.selling_price);
    const rateInBasisPoints = qist ? cents(data.interest_rate || 0) : 0;
    const interest = Math.round(bikePrice * rateInBasisPoints / 10000);
    const total = bikePrice + interest;
    if (total > cents(99999999.99)) throw failure(400, 'Total payable exceeds the invoice price limit.');
    const advance = qist ? cents(data.advance || 0) : total;
    const due = total - advance;
    const monthly = data.monthly_installment === undefined ? null : cents(data.monthly_installment);
    if (qist && (due <= 0 || !monthly || monthly > due || !data.next_due_date || data.next_due_date < today)) {
        throw failure(400, 'Qist requires an outstanding balance, an instalment within that balance and a current or future due date.');
    }
    const tender = qist ? data.advance_method : data.payment_method;
    const result = await transaction(async connection => {
        const [[bike]] = await connection.execute(`
            SELECT b.id,b.product_id,p.sku,p.name,p.cost_price,p.stock_quantity
            FROM used_bikes b JOIN products p ON p.id=b.product_id WHERE b.id=? FOR UPDATE`, [req.params.id]);
        if (!bike) throw failure(404, 'Used motorcycle not found.');
        if (data.request_key) {
            const [[existing]] = await connection.execute('SELECT id,sale_id FROM used_bike_sales WHERE used_bike_id=? AND request_key=?', [bike.id, data.request_key]);
            if (existing) return existing;
        }
        if (Number(bike.stock_quantity) !== 1) throw failure(409, 'This motorcycle is sold or reserved.');
        const enabled = await enabledMethods(connection);
        if (!enabled.includes(data.payment_method) || (advance > 0 && !enabled.includes(tender))) {
            throw failure(400, 'Select an enabled payment method.');
        }
        const [[knownCustomer]] = await connection.execute('SELECT id,cnic FROM customers WHERE phone=? AND is_active=1 ORDER BY id LIMIT 1 FOR UPDATE', [data.customer_phone]);
        let customerId = knownCustomer?.id;
        if (!customerId) {
            const [customer] = await connection.execute('INSERT INTO customers (name,phone,cnic) VALUES (?,?,?)',
                [data.customer_name, data.customer_phone, data.customer_cnic || null]);
            customerId = customer.insertId;
        } else if (!knownCustomer.cnic && data.customer_cnic) {
            await connection.execute('UPDATE customers SET cnic=? WHERE id=?', [data.customer_cnic, customerId]);
        }
        const invoice = await documentNumber(connection, 'invoice_prefix', 'INV');
        const gross = total - cents(bike.cost_price);
        const [sale] = await connection.execute(`
            INSERT INTO sales (invoice_number,customer_id,customer_name,customer_phone,sale_date,subtotal,total_amount,
                amount_paid,amount_due,payment_method,payment_status,created_by)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
            [invoice, customerId, data.customer_name, data.customer_phone, today, total / 100, total / 100,
                advance / 100, due / 100, qist ? 'credit' : ledgerMethod(tender), due ? (advance ? 'partial' : 'pending') : 'paid', req.user.id]);
        await connection.execute(`
            INSERT INTO sale_items (sale_id,product_id,product_name,product_sku,quantity,unit_price,cost_price,subtotal,profit)
            VALUES (?,?,?,?,1,?,?,?,?)`, [sale.insertId, bike.product_id, bike.name, bike.sku, total / 100, bike.cost_price, total / 100, gross / 100]);
        const [record] = await connection.execute(`
            INSERT INTO used_bike_sales (used_bike_id,sale_id,buyer_cnic,payment_method,initial_payment,
                monthly_installment,next_due_date,request_key,interest_rate,interest_amount)
            VALUES (?,?,?,?,?,?,?,?,?,?)`,
            [bike.id, sale.insertId, data.customer_cnic || knownCustomer?.cnic || null, data.payment_method, advance / 100,
                qist ? monthly / 100 : null, qist ? data.next_due_date : null, data.request_key || null, rateInBasisPoints / 100, interest / 100]);
        await connection.execute('UPDATE products SET stock_quantity=0 WHERE id=?', [bike.product_id]);
        await connection.execute(`
            INSERT INTO stock_movements (product_id,movement_type,quantity,previous_stock,new_stock,cost_price,reference_type,reference_id,notes,created_by)
            VALUES (?,'sale',1,1,0,?,'sale',?,?,?)`, [bike.product_id, bike.cost_price, sale.insertId, invoice, req.user.id]);
        await connection.execute('UPDATE customers SET outstanding_balance=outstanding_balance+?,total_purchases=total_purchases+? WHERE id=?', [due / 100, total / 100, customerId]);
        if (advance) {
            await recordSalePayment(connection, req, { saleId: sale.insertId, customerId, amount: advance / 100,
                method: tender, date: today, notes: qist ? 'Qist advance · ' + invoice : invoice });
        }
        await recordAudit(connection, req, { action: 'sale', module: 'used_bikes', recordId: bike.id,
            newValues: { invoice, total: total / 100, interest: interest / 100, advance: advance / 100, due: due / 100 }, description: 'Used motorcycle sold' });
        return { id: record.insertId, sale_id: sale.insertId, invoice_number: invoice };
    });
    res.status(201).json({ success: true, data: result, message: 'Motorcycle sold.' });
}));

router.get('/receipts/:id', viewSales, idRule, validate, asyncHandler(async (req, res) => {
    const receipt = await queryOne(`
        SELECT us.id,s.invoice_number,s.customer_name,s.customer_phone,us.buyer_cnic,
            DATE_FORMAT(s.sale_date,'%Y-%m-%d') AS sale_date,s.status,s.payment_status,
            si.subtotal AS selling_price,si.subtotal-us.interest_amount AS bike_price,us.interest_rate,us.interest_amount,
            s.amount_paid,s.amount_due,us.payment_method,us.initial_payment,us.monthly_installment,
            DATE_FORMAT(us.next_due_date,'%Y-%m-%d') AS next_due_date,si.product_name,si.product_sku,b.model,b.chassis_number,b.registration_number
        FROM used_bike_sales us JOIN sales s ON s.id=us.sale_id
        JOIN used_bikes b ON b.id=us.used_bike_id JOIN sale_items si ON si.sale_id=s.id AND si.product_id=b.product_id
        WHERE us.id=?`, [req.params.id]);
    if (!receipt) throw failure(404, 'Receipt not found.');
    res.json({ success: true, data: receipt });
}));

router.post('/qist/:id/pay', sell, idRule, [
    keyRule, money('amount', 0.01), nextDate, body('payment_method').isIn(moneyMethods)
], validate, asyncHandler(async (req, res) => {
    const today = businessDay();
    const result = await transaction(async connection => {
        const [[plan]] = await connection.execute(`
            SELECT us.id,us.sale_id,us.monthly_installment,s.invoice_number,s.customer_id,s.status,s.amount_due
            FROM used_bike_sales us JOIN sales s ON s.id=us.sale_id WHERE us.id=? AND us.payment_method='qist' FOR UPDATE`, [req.params.id]);
        if (!plan) throw failure(404, 'Qist plan not found.');
        if (req.body.request_key) {
            const [[prior]] = await connection.execute('SELECT payment_id FROM used_bike_installments WHERE used_bike_sale_id=? AND request_key=?',
                [plan.id, req.body.request_key]);
            if (prior) return { id: prior.payment_id };
        }
        if (plan.status !== 'completed') throw failure(409, 'This sale no longer accepts Qist payments.');
        const amount = cents(req.body.amount);
        const remaining = cents(plan.amount_due) - amount;
        if (remaining < 0) throw failure(400, 'Payment is greater than the remaining balance.');
        if (remaining && req.body.next_due_date && req.body.next_due_date < today) {
            throw failure(400, 'Next due date must be today or later.');
        }
        await connection.execute('UPDATE sales SET amount_paid=amount_paid+?,amount_due=?,payment_status=? WHERE id=?',
            [amount / 100, remaining / 100, remaining ? 'partial' : 'paid', plan.sale_id]);
        const monthsCovered = Math.floor(amount / cents(plan.monthly_installment));
        await connection.execute(`UPDATE used_bike_sales
            SET next_due_date=IF(?,NULL,COALESCE(?,DATE_ADD(next_due_date,INTERVAL ? MONTH))) WHERE id=?`,
            [remaining === 0, req.body.next_due_date ?? null, monthsCovered, plan.id]);
        if (plan.customer_id) {
            await connection.execute('UPDATE customers SET outstanding_balance=GREATEST(0,outstanding_balance-?) WHERE id=?', [amount / 100, plan.customer_id]);
        }
        const paymentId = await recordSalePayment(connection, req, { saleId: plan.sale_id, customerId: plan.customer_id,
            amount: amount / 100, method: req.body.payment_method, date: today, notes: 'Qist payment · ' + plan.invoice_number });
        if (req.body.request_key) {
            await connection.execute('INSERT INTO used_bike_installments (used_bike_sale_id,payment_id,request_key) VALUES (?,?,?)',
                [plan.id, paymentId, req.body.request_key]);
        }
        await recordAudit(connection, req, { action: 'payment', module: 'used_bikes', recordId: plan.id,
            newValues: { amount: amount / 100, remaining: remaining / 100 }, description: 'Recorded Qist payment' });
        return { id: paymentId, remaining: remaining / 100 };
    });
    res.json({ success: true, data: result, message: 'Qist payment recorded.' });
}));

module.exports = router;
