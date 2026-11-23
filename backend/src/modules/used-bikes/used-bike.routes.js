'use strict';

const express = require('express');
const { body, param } = require('express-validator');
const { authenticate } = require('../../middleware/auth');
const { requirePermission } = require('../../middleware/permissions');
const { validate } = require('../../middleware/validate');
const { queryOne, transaction } = require('../../config/database');
const { asyncHandler, makeDocumentNumber, recordAudit } = require('../../utils/apiHelpers');

const router = express.Router();
const manage = requirePermission('used_bikes.manage');
const paymentMethods = ['cash', 'bank_transfer', 'card', 'digital_wallet', 'cheque'];
const maxPrice = 99999999.99;
const imagePath = /^\/uploads\/[a-z0-9_-]+\.(?:jpg|jpeg|png|webp|gif)$/i;
const dateField = field => body(field).optional().isISO8601({ strict: true }).matches(/^\d{4}-\d{2}-\d{2}$/);
const keyRule = body('request_key').optional().isUUID(4).toLowerCase();
const idRule = param('id').isInt({ min: 1 });
const moneyRule = (field, min = 0) => body(field).isDecimal({ decimal_digits: '0,2' }).bail().isFloat({ min, max: maxPrice });
router.use(authenticate);

router.use(require('./used-bike-sales.routes'));
router.use(require('./used-bike-reports.routes'));

function failure(statusCode, message) {
    return Object.assign(new Error(message), { statusCode });
}

async function payForBike(connection, req, bikeId, amount, date, note) {
    if (Number(amount) <= 0) return;
    await connection.execute(
        `INSERT INTO payments (payment_number,payment_type,reference_type,reference_id,amount,payment_method,payment_date,notes,created_by)
         VALUES (?,'made','used_bike',?,?,?,COALESCE(?,CURRENT_DATE()),?,?)`,
        [makeDocumentNumber('PAY'), bikeId, amount, req.body.payment_method, date || null, note, req.user.id]
    );
}

async function lockBike(connection, id) {
    const [[bike]] = await connection.execute(`
        SELECT b.id,b.product_id,p.sku,p.stock_quantity,p.is_active,p.cost_price,p.selling_price
        FROM used_bikes b JOIN products p ON p.id=b.product_id WHERE b.id=? FOR UPDATE`, [id]);
    if (!bike) throw failure(404, 'Used motorcycle not found.');
    return bike;
}

function intakeReplay(req) {
    return req.body.request_key
        ? queryOne('SELECT id,product_id FROM used_bikes WHERE intake_key=? AND created_by=?', [req.body.request_key, req.user.id])
        : null;
}

router.post('/', manage, [
    keyRule,
    body('name').trim().isLength({ min: 2, max: 200 }),
    body('model').optional().trim().isLength({ max: 100 }),
    body('engine_condition').optional().trim().isLength({ max: 120 }),
    body('tyre_condition').optional().trim().isLength({ max: 120 }),
    body('body_condition').optional().trim().isLength({ max: 120 }),
    body('photos').optional().isArray({ min: 2, max: 3 }),
    body('photos.*').matches(imagePath),
    moneyRule('selling_price', 0.01).optional(),
    moneyRule('repair_cost').optional(), moneyRule('other_cost').optional(),
    body('seller_name').trim().isLength({ min: 2, max: 100 }),
    body('seller_phone').optional().trim().isLength({ max: 20 }),
    body('brand_id').optional({ values: 'null' }).isInt({ min: 1 }),
    body('model_year').optional({ values: 'null' }).isInt({ min: 1900, max: 2100 }),
    body('engine_cc').optional({ values: 'null' }).isInt({ min: 1, max: 10000 }),
    body('chassis_number').optional().trim().isLength({ max: 50 }),
    body('registration_number').optional().trim().isLength({ max: 30 }),
    body('intake_notes').optional().trim().isLength({ max: 2000 }),
    moneyRule('purchase_price'), dateField('acquired_on'),
    body('payment_method').isIn(paymentMethods)
], validate, asyncHandler(async (req, res) => {
    const replay = await intakeReplay(req);
    if (replay) return res.json({ success: true, data: replay, message: 'Used motorcycle already recorded.' });

    const data = req.body;
    const totalCostCents = [data.purchase_price, data.repair_cost, data.other_cost]
        .reduce((total, amount) => total + Math.round(Number(amount || 0) * 100), 0);
    if (totalCostCents > Math.round(maxPrice * 100)) throw failure(400, 'The total motorcycle cost exceeds the catalogue price limit.');
    try {
        const result = await transaction(async connection => {
            const sku = makeDocumentNumber('USED');
            const [product] = await connection.execute(`
                INSERT INTO products (sku,name,brand_id,product_type,motorcycle_condition,model_year,engine_cc,cost_price,
                    selling_price,stock_quantity,min_stock_level,max_stock_level,unit,is_active,image_url)
                VALUES (?,?,?,'motorcycle','used',?,?,?,?,1,0,1,'bike',0,?)`,
                [sku, data.name, data.brand_id ?? null, data.model_year ?? null, data.engine_cc ?? null, totalCostCents / 100, data.selling_price || 0, data.photos?.[0] || null]);
            const chassis = data.chassis_number?.toUpperCase().replace(/[\s-]+/g, '') || null;
            const [bike] = await connection.execute(`
                INSERT INTO used_bikes (product_id,seller_name,seller_phone,chassis_number,registration_number,acquired_on,
                    purchase_price,intake_notes,intake_key,created_by,model,engine_condition,tyre_condition,body_condition,purchase_method)
                VALUES (?,?,?,?,?,COALESCE(?,CURRENT_DATE()),?,?,?,?,?,?,?,?,?)`,
                [product.insertId, data.seller_name, data.seller_phone || null, chassis, data.registration_number || null,
                    data.acquired_on || null, data.purchase_price, data.intake_notes || null, data.request_key || null, req.user.id,
                    data.model || null, data.engine_condition || null, data.tyre_condition || null, data.body_condition || null, data.payment_method]);
            await connection.execute(`
                INSERT INTO stock_movements (product_id,movement_type,quantity,previous_stock,new_stock,cost_price,reference_type,reference_id,notes,created_by)
                VALUES (?,'purchase',1,0,1,?,'used_bike',?,'Private seller acquisition',?)`,
                [product.insertId, data.purchase_price, bike.insertId, req.user.id]);
            await payForBike(connection, req, bike.insertId, data.purchase_price, data.acquired_on, 'Used motorcycle acquisition ' + sku);
            for (const [position, image] of (data.photos || []).entries()) {
                await connection.execute('INSERT INTO used_bike_photos (used_bike_id,position,image_url) VALUES (?,?,?)', [bike.insertId, position + 1, image]);
            }
            for (const [type, amount, description] of [
                ['repair', data.repair_cost, 'Initial repair cost'],
                ['other', data.other_cost, 'Initial paperwork and transport cost']
            ]) {
                if (!Number(amount)) continue;
                await connection.execute(`
                    INSERT INTO used_bike_work (used_bike_id,worked_on,description,amount,cost_type,created_by)
                    VALUES (?,COALESCE(?,CURRENT_DATE()),?,?,?,?)`, [bike.insertId, data.acquired_on || null, description, amount, type, req.user.id]);
                await payForBike(connection, req, bike.insertId, amount, data.acquired_on, description + ' · ' + sku);
            }

            await recordAudit(connection, req, { action: 'create', module: 'used_bikes', recordId: bike.insertId,
                newValues: { sku, purchase_price: data.purchase_price }, description: 'Recorded used motorcycle acquisition' });
            return { id: bike.insertId, product_id: product.insertId, sku };
        });
        res.status(201).json({ success: true, data: result, message: 'Used motorcycle purchased and added to reconditioning.' });
    } catch (error) {
        if (error.code !== 'ER_DUP_ENTRY') throw error;
        const existing = await intakeReplay(req);
        if (existing) return res.json({ success: true, data: existing, message: 'Used motorcycle already recorded.' });
        throw failure(409, 'This chassis number is already recorded. Open its existing used-bike record.');
    }
}));

router.post('/:id/work', manage, idRule, [
    keyRule, dateField('worked_on'), moneyRule('amount'), body('cost_type').optional().isIn(['repair','other']),
    body('description').trim().isLength({ min: 2, max: 255 }),
    body('payment_method').isIn(paymentMethods)
], validate, asyncHandler(async (req, res) => {
    const work = req.body;
    const data = await transaction(async connection => {
        const bike = await lockBike(connection, req.params.id);
        if (work.request_key) {
            const [[existing]] = await connection.execute(
                'SELECT id FROM used_bike_work WHERE used_bike_id=? AND request_key=? AND created_by=?',
                [bike.id, work.request_key, req.user.id]
            );
            if (existing) return { id: existing.id, used_bike_id: bike.id, replay: true };
        }
        if (Number(bike.stock_quantity) !== 1 || Number(bike.is_active)) {
            throw failure(409, 'Move an in-stock bike to reconditioning before recording maintenance.');
        }
        if (Math.round(Number(bike.cost_price) * 100) + Math.round(Number(work.amount) * 100) > Math.round(maxPrice * 100)) {
            throw failure(400, 'The total motorcycle cost exceeds the catalogue price limit.');
        }
        const [insert] = await connection.execute(`
            INSERT INTO used_bike_work (used_bike_id,worked_on,description,amount,request_key,created_by,cost_type)
            VALUES (?,COALESCE(?,CURRENT_DATE()),?,?,?,?,?)`,
            [bike.id, work.worked_on || null, work.description, work.amount, work.request_key || null, req.user.id, work.cost_type || 'repair']);
        await connection.execute('UPDATE products SET cost_price=cost_price+? WHERE id=?', [work.amount, bike.product_id]);
        await payForBike(connection, req, bike.id, work.amount, work.worked_on, 'Used motorcycle maintenance ' + bike.sku);
        await recordAudit(connection, req, { action: 'create', module: 'used_bikes', recordId: bike.id,
            newValues: { work_id: insert.insertId, amount: work.amount }, description: 'Recorded used motorcycle maintenance' });
        return { id: insert.insertId, used_bike_id: bike.id };
    });
    res.status(data.replay ? 200 : 201).json({ success: true, data, message: 'Maintenance recorded.' });
}));

router.put('/:id/listing', manage, idRule, [
    body('listed').isIn([true, false]).custom(value => typeof value === 'boolean'),
    moneyRule('selling_price', 0.01).optional(),
    body('description').optional().trim().isLength({ max: 2000 }),
    body('image_url').optional({ values: 'null' }).matches(imagePath)
], validate, asyncHandler(async (req, res) => {
    const { listed, description, image_url: image } = req.body;
    if (listed && req.body.selling_price === undefined) throw failure(400, 'Set the public selling price.');
    await transaction(async connection => {
        const bike = await lockBike(connection, req.params.id);
        if (Number(bike.stock_quantity) !== 1) throw failure(409, 'Only an in-stock used motorcycle can be listed or paused.');
        if (listed) {
            await connection.execute(`
                UPDATE products SET is_active=1,selling_price=?,description=COALESCE(?,description),image_url=COALESCE(?,image_url)
                WHERE id=?`, [req.body.selling_price, description ?? null, image ?? null, bike.product_id]);
        } else {
            await connection.execute('UPDATE products SET is_active=0 WHERE id=?', [bike.product_id]);
        }
        await recordAudit(connection, req, { action: 'update', module: 'used_bikes', recordId: bike.id,
            newValues: { listed, selling_price: listed ? req.body.selling_price : undefined },
            description: listed ? 'Listed used motorcycle for resale' : 'Paused used motorcycle for reconditioning' });
    });
    res.json({ success: true, message: listed ? 'Motorcycle listed for resale.' : 'Motorcycle moved to reconditioning.' });
}));

module.exports = router;
