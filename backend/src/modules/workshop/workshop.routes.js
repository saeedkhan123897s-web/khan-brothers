const express = require('express');
const { body, param, query: queryValidator } = require('express-validator');
const { authenticate } = require('../../middleware/auth');
const { requirePermission } = require('../../middleware/permissions');
const { ROLES } = require('../../utils/constants');
const { validate } = require('../../middleware/validate');
const { transaction, queryOne, query } = require('../../config/database');
const { asyncHandler, paginationFrom, paginated, recordAudit, uniqueProducts, documentNumber } = require('../../utils/apiHelpers');

const router = express.Router();
router.use(authenticate);

const oilDateFields = ['oil_change_on', 'next_oil_change_on'];
const oilDateRules = oilDateFields.map(name => body(name).optional({ nullable: true })
    .isISO8601({ strict: true }).matches(/^\d{4}-\d{2}-\d{2}$/));
const jobOilDates = "DATE_FORMAT(j.oil_change_on,'%Y-%m-%d') AS oil_change_on,DATE_FORMAT(j.next_oil_change_on,'%Y-%m-%d') AS next_oil_change_on";

function validateOilDates(changed, next) {
    if (changed && next && next <= changed) {
        throw Object.assign(new Error('Next oil change must be after the last oil change.'), { statusCode: 400 });
    }
}

async function ensureAssignedMechanic(connection, req, job) {
    if (req.user.role !== ROLES.MECHANIC) return;
    const [mechanics] = await connection.execute(
        'SELECT id FROM mechanics WHERE user_id=? AND is_active=1 LIMIT 1',
        [req.user.id]
    );
    if (!mechanics[0] || Number(mechanics[0].id) !== Number(job.mechanic_id)) {
        const error = new Error('Mechanics may only update job cards assigned to them');
        error.statusCode = 403;
        throw error;
    }
}

router.get('/services', requirePermission('workshop.view'), asyncHandler(async (req, res) => {
    const rows = await query(`SELECT * FROM workshop_services ${req.query.include_inactive === 'true' ? '' : 'WHERE is_active=1'} ORDER BY name`);
    res.json({ success: true, data: rows });
}));

router.post('/services', requirePermission('workshop.manage'), [body('name').trim().isLength({ min: 2, max: 100 }), body('base_price').isFloat({ min: 0 }), body('estimated_hours').optional().isFloat({ min: 0 })], validate, asyncHandler(async (req, res) => {
    const result = await query('INSERT INTO workshop_services (name,description,base_price,estimated_hours,is_active) VALUES (?,?,?,?,1)', [req.body.name, req.body.description || null, req.body.base_price, req.body.estimated_hours || 1]);
    res.status(201).json({ success: true, data: await queryOne('SELECT * FROM workshop_services WHERE id=?', [result.insertId]) });
}));

router.put('/services/:id', requirePermission('workshop.manage'), [param('id').isInt({ min: 1 }), body('name').optional().trim().notEmpty(), body('base_price').optional().isFloat({ min: 0 })], validate, asyncHandler(async (req, res) => {
    const allowed = ['name', 'description', 'base_price', 'estimated_hours', 'is_active'];
    const fields = allowed.filter(key => req.body[key] !== undefined);
    if (fields.length) await query(`UPDATE workshop_services SET ${fields.map(key => `${key}=?`).join(',')} WHERE id=?`, [...fields.map(key => req.body[key]), req.params.id]);
    const service = await queryOne('SELECT * FROM workshop_services WHERE id=?', [req.params.id]);
    if (!service) return res.status(404).json({ success: false, error: 'Workshop service not found' });
    res.json({ success: true, data: service });
}));

router.delete('/services/:id', requirePermission('workshop.manage'), [param('id').isInt({ min: 1 })], validate, asyncHandler(async (req, res) => {
    const changed = await query('UPDATE workshop_services SET is_active=0 WHERE id=?', [req.params.id]);
    if (!changed.affectedRows) return res.status(404).json({ success: false, error: 'Workshop service not found' });
    res.json({ success: true, message: 'Workshop service deactivated' });
}));

router.get('/mechanics', requirePermission('workshop.view'), asyncHandler(async (req, res) => {
    const rows = await query(`SELECT * FROM mechanics ${req.query.include_inactive === 'true' ? '' : 'WHERE is_active=1'} ORDER BY name`);
    res.json({ success: true, data: rows });
}));

router.post('/mechanics', requirePermission('workshop.manage'), [body('name').trim().isLength({ min: 2, max: 100 }), body('daily_rate').optional().isFloat({ min: 0 })], validate, asyncHandler(async (req, res) => {
    const result = await query('INSERT INTO mechanics (user_id,name,phone,specialization,daily_rate,is_active) VALUES (?,?,?,?,?,1)', [req.body.user_id || null, req.body.name, req.body.phone || null, req.body.specialization || null, Number(req.body.daily_rate || 0)]);
    res.status(201).json({ success: true, data: await queryOne('SELECT * FROM mechanics WHERE id=?', [result.insertId]) });
}));

router.put('/mechanics/:id', requirePermission('workshop.manage'), [param('id').isInt({ min: 1 }), body('name').optional().trim().notEmpty(), body('daily_rate').optional().isFloat({ min: 0 })], validate, asyncHandler(async (req, res) => {
    const allowed = ['user_id', 'name', 'phone', 'specialization', 'daily_rate', 'is_active'];
    const fields = allowed.filter(key => req.body[key] !== undefined);
    if (fields.length) await query(`UPDATE mechanics SET ${fields.map(key => `${key}=?`).join(',')} WHERE id=?`, [...fields.map(key => req.body[key]), req.params.id]);
    const mechanic = await queryOne('SELECT * FROM mechanics WHERE id=?', [req.params.id]);
    if (!mechanic) return res.status(404).json({ success: false, error: 'Mechanic not found' });
    res.json({ success: true, data: mechanic });
}));

router.delete('/mechanics/:id', requirePermission('workshop.manage'), [param('id').isInt({ min: 1 })], validate, asyncHandler(async (req, res) => {
    const changed = await query('UPDATE mechanics SET is_active=0 WHERE id=?', [req.params.id]);
    if (!changed.affectedRows) return res.status(404).json({ success: false, error: 'Mechanic not found' });
    res.json({ success: true, message: 'Mechanic deactivated' });
}));

router.get('/', requirePermission('workshop.view'), [queryValidator('page').optional().isInt({ min: 1 }), queryValidator('limit').optional().isInt({ min: 1, max: 100 })], validate, asyncHandler(async (req, res) => {
    const { page, limit, offset } = paginationFrom(req.query);
    const clauses = [];
    const params = [];
    if (req.user.role === ROLES.MECHANIC) {
        const mechanic = await queryOne('SELECT id FROM mechanics WHERE user_id=? AND is_active=1 LIMIT 1', [req.user.id]);
        if (!mechanic) return res.status(403).json({ success: false, error: 'No active mechanic profile is linked to this account' });
        clauses.push('j.mechanic_id=?');
        params.push(mechanic.id);
    }
    if (req.query.status === 'active') clauses.push("j.status IN ('received','diagnosing','waiting_parts','in_progress')");
    else if (req.query.status) { clauses.push('j.status=?'); params.push(req.query.status); }
    if (req.query.mechanic_id && req.user.role !== ROLES.MECHANIC) { clauses.push('j.mechanic_id=?'); params.push(req.query.mechanic_id); }
    if (req.query.customer_id) { clauses.push('j.customer_id=?'); params.push(req.query.customer_id); }
    if (req.query.search) { clauses.push('(j.job_number LIKE ? OR j.customer_name LIKE ? OR j.customer_phone LIKE ?)'); params.push(...Array(3).fill(`%${req.query.search}%`)); }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const count = await queryOne(`SELECT COUNT(*) total FROM job_cards j ${where}`, params);
    const rows = await query(`SELECT j.*,${jobOilDates},m.name AS mechanic_name FROM job_cards j LEFT JOIN mechanics m ON m.id=j.mechanic_id ${where} ORDER BY j.received_date DESC,j.id DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
    res.json({ success: true, ...paginated(rows, count.total, page, limit) });
}));

router.post('/', requirePermission('workshop.manage'), [
    body('customer_id').optional({ nullable: true, checkFalsy: true }).isInt({ min: 1 }),
    body('motorcycle_id').optional({ nullable: true, checkFalsy: true }).isInt({ min: 1 }),
    body('services').optional().isArray(),
    body('services.*.service_id').optional().isInt({ min: 1 }),
    body('parts').optional().isArray().bail().custom(uniqueProducts).withMessage('Each product can appear only once'),
    body('parts.*.product_id').optional().isInt({ min: 1 }),
    body('parts.*.quantity').optional().isInt({ min: 1 }),
    body('labor_cost').optional().isFloat({ min: 0 }),
    body('amount_paid').optional().isFloat({ min: 0 }),
    body('estimated_cost').optional().isFloat({ min: 0 }),
    body('estimated_completion').optional().isISO8601(), ...oilDateRules,
    body('mechanic_id').optional({ nullable: true, checkFalsy: true }).isInt({ min: 1 }),
    body('mileage').optional({ nullable: true, checkFalsy: true }).isInt({ min: 0 })
], validate, asyncHandler(async (req, res) => {
    const result = await transaction(async connection => {
        let customer = null;
        let motorcycle = null;
        if (req.body.customer_id) {
            const [rows] = await connection.execute('SELECT id,name,phone FROM customers WHERE id=? AND is_active=1 FOR UPDATE', [req.body.customer_id]);
            customer = rows[0];
            if (!customer) { const error = new Error('Customer not found'); error.statusCode = 404; throw error; }
        }
        if (req.body.motorcycle_id) {
            if (!customer) { const error = new Error('customer_id is required with motorcycle_id'); error.statusCode = 400; throw error; }
            const [rows] = await connection.execute('SELECT * FROM customer_motorcycles WHERE id=? AND customer_id=?', [req.body.motorcycle_id, req.body.customer_id]);
            motorcycle = rows[0];
            if (!motorcycle) { const error = new Error('Motorcycle not found for this customer'); error.statusCode = 404; throw error; }
        }
        let previousOilDates;
        if (motorcycle && req.body.oil_change_on === undefined) {
            [[previousOilDates]] = await connection.execute(`SELECT ${jobOilDates} FROM job_cards j
                WHERE j.motorcycle_id=? AND j.status<>'cancelled' AND (j.oil_change_on IS NOT NULL OR j.next_oil_change_on IS NOT NULL)
                ORDER BY j.id DESC LIMIT 1`, [motorcycle.id]);
        }
        const oilChangeOn = req.body.oil_change_on === undefined ? previousOilDates?.oil_change_on : req.body.oil_change_on;
        const nextOilChangeOn = req.body.next_oil_change_on === undefined ? previousOilDates?.next_oil_change_on : req.body.next_oil_change_on;
        validateOilDates(oilChangeOn, nextOilChangeOn);
        if (req.body.mechanic_id) {
            const [mechanics] = await connection.execute('SELECT id FROM mechanics WHERE id=? AND is_active=1', [req.body.mechanic_id]);
            if (!mechanics[0]) { const error = new Error('Mechanic not found'); error.statusCode = 404; throw error; }
        }
        const serviceRows = [];
        for (const requested of req.body.services || []) {
            const [rows] = await connection.execute('SELECT * FROM workshop_services WHERE id=? AND is_active=1', [requested.service_id]);
            if (!rows[0]) { const error = new Error(`Workshop service ${requested.service_id} not found`); error.statusCode = 404; throw error; }
            serviceRows.push({ service: rows[0], price: Number(rows[0].base_price) });
        }
        const parts = [];
        let partsCost = 0;
        let partsActualCost = 0;
        for (const requested of req.body.parts || []) {
            const [rows] = await connection.execute("SELECT * FROM products WHERE id=? AND is_active=1 AND product_type='part' FOR UPDATE", [requested.product_id]);
            const product = rows[0];
            const quantity = Number(requested.quantity);
            if (!product || Number(product.stock_quantity) < quantity) { const error = new Error(`Insufficient stock for product ${requested.product_id}`); error.statusCode = 409; throw error; }
            const subtotal = Number(product.selling_price) * quantity;
            partsCost += subtotal;
            partsActualCost += Number(product.cost_price) * quantity;
            parts.push({ product, quantity, subtotal, price: Number(product.selling_price) });
        }
        const laborCost = Number(req.body.labor_cost || serviceRows.reduce((sum, row) => sum + row.price, 0));
        const total = partsCost + laborCost;
        const requestedPaid = Number(req.body.amount_paid || 0);
        if (requestedPaid > total) { const error = new Error('amount_paid cannot exceed job total'); error.statusCode = 400; throw error; }
        const amountPaid = requestedPaid;
        if (amountPaid > 0 && !['cash', 'bank_transfer', 'card', 'digital_wallet', 'cheque'].includes(req.body.payment_method || 'cash')) { const error = new Error('Unsupported job card payment method'); error.statusCode = 400; throw error; }
        const status = amountPaid >= total ? 'paid' : (amountPaid > 0 ? 'partial' : 'pending');
        const jobNumber = await documentNumber(connection, 'job_card_prefix', 'JOB');
        const [insert] = await connection.execute(
            `INSERT INTO job_cards (job_number,customer_id,motorcycle_id,customer_name,customer_phone,motorcycle_make,motorcycle_model,motorcycle_registration,mileage,complaints,diagnosis,mechanic_id,estimated_cost,actual_cost,parts_cost,labor_cost,total_cost,payment_status,amount_paid,status,received_date,estimated_completion,notes,created_by)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'received',CURRENT_DATE(),?,?,?)`,
            [jobNumber, customer?.id || null, motorcycle?.id || null, req.body.customer_name || customer?.name || null, req.body.customer_phone || customer?.phone || null, motorcycle?.make || req.body.motorcycle_make || null, motorcycle?.model || req.body.motorcycle_model || null, motorcycle?.registration_number || req.body.motorcycle_registration || null, req.body.mileage || null, req.body.complaints || null, req.body.diagnosis || null, req.body.mechanic_id || null, Number(req.body.estimated_cost || total), partsActualCost + laborCost, partsActualCost, laborCost, total, status, amountPaid, req.body.estimated_completion || null, req.body.notes || null, req.user.id]
        );
        if (oilChangeOn || nextOilChangeOn) {
            await connection.execute('UPDATE job_cards SET oil_change_on=?,next_oil_change_on=? WHERE id=?',
                [oilChangeOn ?? null, nextOilChangeOn ?? null, insert.insertId]);
        }
        for (const row of serviceRows) await connection.execute('INSERT INTO job_card_services (job_card_id,service_id,service_name,price,notes) VALUES (?,?,?,?,?)', [insert.insertId, row.service.id, row.service.name, row.price, null]);
        for (const part of parts) {
            await connection.execute('INSERT INTO job_card_parts (job_card_id,product_id,product_name,quantity,unit_price,subtotal) VALUES (?,?,?,?,?,?)', [insert.insertId, part.product.id, part.product.name, part.quantity, part.price, part.subtotal]);
            const previous = Number(part.product.stock_quantity);
            const next = previous - part.quantity;
            await connection.execute('UPDATE products SET stock_quantity=? WHERE id=?', [next, part.product.id]);
            await connection.execute(`INSERT INTO stock_movements (product_id,movement_type,quantity,previous_stock,new_stock,cost_price,reference_type,reference_id,notes,created_by) VALUES (?,'workshop_use',?,?,?,?, 'job_card',?,?,?)`, [part.product.id, part.quantity, previous, next, part.product.cost_price, insert.insertId, jobNumber, req.user.id]);
        }
        if (customer) {
            await connection.execute('UPDATE customers SET outstanding_balance=outstanding_balance+?,total_purchases=total_purchases+? WHERE id=?', [Math.max(0, total - amountPaid), total, customer.id]);
        }
        if (amountPaid > 0) {
            await connection.execute(`INSERT INTO payments (payment_number,payment_type,reference_type,reference_id,customer_id,amount,payment_method,payment_date,notes,created_by) VALUES (?,'received','job_card',?,?,?,?,CURRENT_DATE(),?,?)`, [makeDocumentNumber('PAY'), insert.insertId, customer?.id || null, amountPaid, req.body.payment_method || 'cash', jobNumber, req.user.id]);
        }
        await recordAudit(connection, req, { action: 'create', module: 'workshop', recordId: insert.insertId, newValues: { jobNumber, total }, description: `Job card ${jobNumber} created` });
        return { id: insert.insertId, job_number: jobNumber, total_cost: total, parts_cost: partsCost, labor_cost: laborCost, amount_paid: amountPaid, payment_status: status };
    });
    res.status(201).json({ success: true, data: result });
}));

router.patch('/:id/status', requirePermission('workshop.jobs.edit'), [param('id').isInt({ min: 1 }), body('status').isIn(['received', 'diagnosing', 'waiting_parts', 'in_progress', 'completed', 'delivered', 'cancelled'])], validate, asyncHandler(async (req, res) => {
    const result = await transaction(async connection => {
        const [rows] = await connection.execute('SELECT * FROM job_cards WHERE id=? FOR UPDATE', [req.params.id]);
        const current = rows[0];
        if (!current) { const error = new Error('Job card not found'); error.statusCode = 404; throw error; }
        await ensureAssignedMechanic(connection, req, current);
        if (req.user.role === ROLES.MECHANIC && ['cancelled', 'delivered'].includes(req.body.status)) {
            const error = new Error('Only management can cancel or deliver a job card'); error.statusCode = 403; throw error;
        }
        const transitions = { received: ['diagnosing', 'cancelled'], diagnosing: ['waiting_parts', 'in_progress', 'cancelled'], waiting_parts: ['in_progress', 'cancelled'], in_progress: ['waiting_parts', 'completed', 'cancelled'], completed: ['delivered'], delivered: [], cancelled: [] };
        if (!transitions[current.status]?.includes(req.body.status)) { const error = new Error(`Job cannot move from ${current.status} to ${req.body.status}`); error.statusCode = 409; throw error; }
        if (req.body.status === 'cancelled') {
            if (Number(current.amount_paid) > 0) { const error = new Error('Refund or reconcile the recorded payment before cancelling this job'); error.statusCode = 409; throw error; }
            const [parts] = await connection.execute('SELECT * FROM job_card_parts WHERE job_card_id=?', [current.id]);
            for (const part of parts) {
                const [products] = await connection.execute('SELECT stock_quantity,cost_price FROM products WHERE id=? FOR UPDATE', [part.product_id]);
                if (!products[0]) continue;
                const previous = Number(products[0].stock_quantity);
                const next = previous + Number(part.quantity);
                await connection.execute('UPDATE products SET stock_quantity=? WHERE id=?', [next, part.product_id]);
                await connection.execute(`INSERT INTO stock_movements (product_id,movement_type,quantity,previous_stock,new_stock,cost_price,reference_type,reference_id,notes,created_by) VALUES (?,'return_in',?,?,?,?, 'job_card',?,?,?)`, [part.product_id, part.quantity, previous, next, products[0].cost_price, current.id, `Cancelled ${current.job_number}`, req.user.id]);
            }
            if (current.customer_id) await connection.execute('UPDATE customers SET outstanding_balance=GREATEST(0,outstanding_balance-?),total_purchases=GREATEST(0,total_purchases-?) WHERE id=?', [Math.max(0, Number(current.total_cost) - Number(current.amount_paid)), current.total_cost, current.customer_id]);
        }
        const dateField = req.body.status === 'completed' ? ',completed_date=CURRENT_DATE()' : req.body.status === 'delivered' ? ',delivered_date=CURRENT_DATE()' : '';
        await connection.execute(`UPDATE job_cards SET status=?${dateField} WHERE id=?`, [req.body.status, current.id]);
        await recordAudit(connection, req, { action: 'update', module: 'workshop', recordId: current.id, oldValues: { status: current.status }, newValues: { status: req.body.status }, description: `Job card ${current.job_number} status changed` });
        return current.id;
    });
    res.json({ success: true, data: await queryOne('SELECT * FROM job_cards WHERE id=?', [result]) });
}));

router.put('/:id', requirePermission('workshop.jobs.edit'), [
    param('id').isInt({ min: 1 }),
    body('complaints').optional().isString(), body('diagnosis').optional().isString(),
    body('mechanic_id').optional({ nullable: true, checkFalsy: true }).isInt({ min: 1 }),
    body('estimated_completion').optional({ nullable: true }).isISO8601(), ...oilDateRules,
    body('estimated_cost').optional().isFloat({ min: 0 }), body('notes').optional().isString()
], validate, asyncHandler(async (req, res) => {
    const result = await transaction(async connection => {
        const [rows] = await connection.execute(`SELECT j.*,${jobOilDates} FROM job_cards j WHERE j.id=? FOR UPDATE`, [req.params.id]);
        const job = rows[0];
        if (!job) { const error = new Error('Job card not found'); error.statusCode = 404; throw error; }
        await ensureAssignedMechanic(connection, req, job);
        const allowed = req.user.role === ROLES.MECHANIC
            ? ['diagnosis', 'estimated_completion', 'notes']
            : ['complaints', 'diagnosis', 'mechanic_id', 'estimated_completion', 'estimated_cost', 'notes'];
        const fields = [...allowed, ...oilDateFields].filter(key => req.body[key] !== undefined);
        const oilDates = oilDateFields.map(key => req.body[key] === undefined ? job[key] : req.body[key]);
        validateOilDates(...oilDates);
        if (fields.length) {
            await connection.execute(`UPDATE job_cards SET ${fields.map(key => `${key}=?`).join(',')} WHERE id=?`, [...fields.map(key => req.body[key] ?? null), req.params.id]);
        }
        const [updatedRows] = await connection.execute(`SELECT j.*,${jobOilDates} FROM job_cards j WHERE j.id=?`, [req.params.id]);
        return updatedRows[0];
    });
    res.json({ success: true, data: result });
}));

router.get('/:id', requirePermission('workshop.view'), [param('id').isInt({ min: 1 })], validate, asyncHandler(async (req, res) => {
    const job = await queryOne(`SELECT j.*,${jobOilDates},m.name mechanic_name FROM job_cards j LEFT JOIN mechanics m ON m.id=j.mechanic_id WHERE j.id=?`, [req.params.id]);
    if (!job) return res.status(404).json({ success: false, error: 'Job card not found' });
    if (req.user.role === ROLES.MECHANIC) {
        const mechanic = await queryOne('SELECT id FROM mechanics WHERE user_id=? AND is_active=1 LIMIT 1', [req.user.id]);
        if (!mechanic || Number(mechanic.id) !== Number(job.mechanic_id)) return res.status(404).json({ success: false, error: 'Job card not found' });
    }
    const services = await query('SELECT * FROM job_card_services WHERE job_card_id=?', [job.id]);
    const parts = await query('SELECT * FROM job_card_parts WHERE job_card_id=?', [job.id]);
    const payments = await query("SELECT * FROM payments WHERE reference_type='job_card' AND reference_id=? ORDER BY payment_date,id", [job.id]);
    res.json({ success: true, data: { ...job, services, parts, payments } });
}));

module.exports = router;
