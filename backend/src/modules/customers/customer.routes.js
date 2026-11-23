const express = require('express');
const { body, param, query } = require('express-validator');
const CustomerModel = require('./customer.model');
const { hasPermission, getOverrides } = require('../../utils/routePermissions');
const { authenticate } = require('../../middleware/auth');
const { requirePermission } = require('../../middleware/permissions');
const { validate } = require('../../middleware/validate');
const { asyncHandler } = require('../../utils/apiHelpers');

const router = express.Router();
const idRule = param('id').isInt({ min: 1 }).withMessage('Customer ID must be a positive integer');
router.use(authenticate);

router.get('/', requirePermission('customers.view'), [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('customer_type').optional().isIn(['retail', 'wholesale', 'all']),
    query('is_active').optional().isIn(['0', '1', 'all', 'true', 'false'])
], validate, asyncHandler(async (req, res) => {
    const result = await CustomerModel.findAll(req.query);
    res.json({ success: true, data: result.customers, pagination: { total: result.total, page: result.page, limit: result.limit, totalPages: Math.ceil(result.total / result.limit) } });
}));

router.post('/', requirePermission('customers.edit'), [
    body('name').trim().isLength({ min: 2, max: 100 }),
    body('phone').trim().notEmpty().isLength({ max: 20 }),
    body('email').optional({ checkFalsy: true }).isEmail(),
    body('customer_type').optional().isIn(['retail', 'wholesale'])
], validate, asyncHandler(async (req, res) => {
    if (await CustomerModel.findByPhone(req.body.phone)) return res.status(409).json({ success: false, error: 'Phone number already belongs to a customer' });
    if (req.body.email && await CustomerModel.findByEmail(req.body.email)) return res.status(409).json({ success: false, error: 'Email already belongs to a customer' });
    const allowed = ['name', 'email', 'phone', 'cnic', 'address', 'city', 'customer_type', 'notes'];
    const data = Object.fromEntries(allowed.filter(key => req.body[key] !== undefined).map(key => [key, req.body[key]]));
    data.outstanding_balance = 0;
    data.total_purchases = 0;
    const customer = await CustomerModel.create(data);
    res.status(201).json({ success: true, data: customer });
}));

router.get('/:id/transactions', requirePermission('customers.view'), idRule, validate, asyncHandler(async (req, res) => {
    const customer = await CustomerModel.findById(req.params.id);
    if (!customer) return res.status(404).json({ success: false, error: 'Customer not found' });
    res.json({ success: true, data: await CustomerModel.getCustomerTransactions(req.params.id) });
}));

router.get('/:id/motorcycles', requirePermission('customers.view'), idRule, validate, asyncHandler(async (req, res) => {
    const motorcycles = await CustomerModel.getMotorcyclesByCustomerId(req.params.id);
    res.json({ success: true, data: motorcycles });
}));

router.post('/:id/motorcycles', requirePermission('customers.edit'), idRule, [
    body('make').trim().notEmpty().isLength({ max: 50 }),
    body('model').trim().notEmpty().isLength({ max: 50 }),
    body('year').optional({ checkFalsy: true }).isInt({ min: 1950, max: 2100 })
], validate, asyncHandler(async (req, res) => {
    const customer = await CustomerModel.findById(req.params.id);
    if (!customer) return res.status(404).json({ success: false, error: 'Customer not found' });
    const allowed = ['make', 'model', 'year', 'color', 'engine_number', 'chassis_number', 'registration_number', 'notes'];
    const motorcycle = await CustomerModel.addMotorcycle(req.params.id, Object.fromEntries(allowed.filter(key => req.body[key] !== undefined).map(key => [key, req.body[key]])));
    res.status(201).json({ success: true, data: motorcycle });
}));

router.get('/:id/motorcycles/:motorcycleId', requirePermission('customers.view'), idRule, param('motorcycleId').isInt({ min: 1 }), validate, asyncHandler(async (req, res) => {
    const motorcycle = await CustomerModel.getMotorcycleById(req.params.id, req.params.motorcycleId);
    if (!motorcycle) return res.status(404).json({ success: false, error: 'Motorcycle not found' });
    res.json({ success: true, data: motorcycle });
}));

router.put('/:id/motorcycles/:motorcycleId', requirePermission('customers.edit'), idRule, param('motorcycleId').isInt({ min: 1 }), [
    body('make').optional().trim().notEmpty().isLength({ max: 50 }),
    body('model').optional().trim().notEmpty().isLength({ max: 50 }),
    body('year').optional({ checkFalsy: true }).isInt({ min: 1950, max: 2100 })
], validate, asyncHandler(async (req, res) => {
    const allowed = ['make', 'model', 'year', 'color', 'engine_number', 'chassis_number', 'registration_number', 'notes'];
    const motorcycle = await CustomerModel.updateMotorcycle(req.params.id, req.params.motorcycleId, Object.fromEntries(allowed.filter(key => req.body[key] !== undefined).map(key => [key, req.body[key]])));
    if (!motorcycle) return res.status(404).json({ success: false, error: 'Motorcycle not found' });
    res.json({ success: true, data: motorcycle });
}));

router.delete('/:id/motorcycles/:motorcycleId', requirePermission('customers.edit'), idRule, param('motorcycleId').isInt({ min: 1 }), validate, asyncHandler(async (req, res) => {
    const deleted = await CustomerModel.deleteMotorcycle(req.params.id, req.params.motorcycleId);
    if (!deleted) return res.status(404).json({ success: false, error: 'Motorcycle not found' });
    res.json({ success: true, message: 'Motorcycle removed' });
}));

router.get('/:id', requirePermission('customers.view'), idRule, validate, asyncHandler(async (req, res) => {
    const customer = await CustomerModel.getCustomerWithDetails(req.params.id);
    if (!customer) return res.status(404).json({ success: false, error: 'Customer not found' });
    res.json({ success: true, data: customer });
}));

router.put('/:id', requirePermission('customers.edit'), idRule, [
    body('name').optional().trim().isLength({ min: 2, max: 100 }),
    body('email').optional({ nullable: true, checkFalsy: true }).isEmail(),
    body('phone').optional().trim().notEmpty().isLength({ max: 20 }),
    body('customer_type').optional().isIn(['retail', 'wholesale']),
    body('is_active').optional().isBoolean()
], validate, asyncHandler(async (req, res) => {
    if (req.body.phone && await CustomerModel.findByPhone(req.body.phone, req.params.id)) return res.status(409).json({ success: false, error: 'Phone number already belongs to another customer' });
    if (req.body.email && await CustomerModel.findByEmail(req.body.email, req.params.id)) return res.status(409).json({ success: false, error: 'Email already belongs to another customer' });
    const allowed = ['name', 'email', 'phone', 'cnic', 'address', 'city', 'customer_type', 'notes'];
    const data = Object.fromEntries(allowed.filter(key => req.body[key] !== undefined).map(key => [key, req.body[key]]));
    if (hasPermission(req.user, 'customers.remove', await getOverrides(req))) {
        if (req.body.is_active !== undefined) data.is_active = req.body.is_active;
    }
    const customer = await CustomerModel.update(req.params.id, data);
    if (!customer) return res.status(404).json({ success: false, error: 'Customer not found' });
    res.json({ success: true, data: customer });
}));

router.delete('/:id', requirePermission('customers.remove'), idRule, validate, asyncHandler(async (req, res) => {
    const changed = await CustomerModel.softDelete(req.params.id);
    if (!changed) return res.status(404).json({ success: false, error: 'Customer not found' });
    res.json({ success: true, message: 'Customer deactivated' });
}));

module.exports = router;
