// ============================================
// SUPPLIER ROUTES
// Khan Brothers Motorcycle Workshop ERP
// ============================================

const express = require('express');
const router = express.Router();
const { body, param, query } = require('express-validator');

const supplierController = require('./supplier.controller');
const { authenticate } = require('../../middleware/auth');
const { requirePermission } = require('../../middleware/permissions');
const { validate } = require('../../middleware/validate');

// ============================================
// ALL SUPPLIER ROUTES ARE PROTECTED (MANAGEMENT ONLY)
// ============================================
router.use(authenticate);

// ============================================
// VALIDATION RULES
// ============================================

// Query validation for listing suppliers
const listSuppliersValidation = [
    query('page')
        .optional()
        .isInt({ min: 1 })
        .withMessage('Page must be a positive integer'),
    query('limit')
        .optional()
        .isInt({ min: 1, max: 100 })
        .withMessage('Limit must be between 1 and 100'),
    query('search')
        .optional()
        .trim(),
    query('city')
        .optional()
        .trim(),
    query('payment_terms')
        .optional()
        .trim(),
    query('is_active')
        .optional()
        .custom(val => ['0', '1', 'true', 'false', 'all'].includes(String(val).toLowerCase()))
        .withMessage('is_active must be true, false, 1, 0, or all'),
    query('sortBy')
        .optional()
        .isIn(['id', 'name', 'company_name', 'email', 'phone', 'city', 'payment_terms', 'outstanding_balance', 'total_supplies', 'is_active', 'created_at', 'updated_at'])
        .withMessage('Invalid sortBy field'),
    query('sortOrder')
        .optional()
        .isIn(['ASC', 'DESC', 'asc', 'desc'])
        .withMessage('sortOrder must be ASC or DESC')
];

// Parameter validation for ID
const idParamValidation = [
    param('id')
        .isInt({ min: 1 })
        .withMessage('Supplier ID must be a positive integer')
];

// Body validation for creating a supplier
const createSupplierValidation = [
    body('name')
        .trim()
        .notEmpty()
        .withMessage('Supplier name is required')
        .isLength({ min: 2, max: 100 })
        .withMessage('Supplier name must be between 2 and 100 characters'),
    body('company_name')
        .optional({ checkFalsy: true })
        .trim()
        .isLength({ max: 100 })
        .withMessage('Company name cannot exceed 100 characters'),
    body('email')
        .optional({ checkFalsy: true })
        .trim()
        .isEmail()
        .withMessage('Please provide a valid email address')
        .normalizeEmail()
        .isLength({ max: 100 })
        .withMessage('Email cannot exceed 100 characters'),
    body('phone')
        .trim()
        .notEmpty()
        .withMessage('Phone number is required')
        .isLength({ min: 7, max: 20 })
        .withMessage('Phone number must be between 7 and 20 characters')
        .matches(/^[0-9+\-\s()]+$/)
        .withMessage('Phone number contains invalid characters'),
    body('address')
        .optional({ checkFalsy: true })
        .trim(),
    body('city')
        .optional({ checkFalsy: true })
        .trim()
        .isLength({ max: 50 })
        .withMessage('City cannot exceed 50 characters'),
    body('payment_terms')
        .optional({ checkFalsy: true })
        .trim()
        .isLength({ max: 50 })
        .withMessage('Payment terms cannot exceed 50 characters'),
    body('notes')
        .optional({ checkFalsy: true })
        .trim(),
    body('is_active')
        .optional()
        .custom(val => [0, 1, '0', '1', true, false, 'true', 'false'].includes(val))
        .withMessage('is_active must be a boolean or 1/0')
];

// Body validation for updating a supplier
const updateSupplierValidation = [
    param('id')
        .isInt({ min: 1 })
        .withMessage('Supplier ID must be a positive integer'),
    body('name')
        .optional()
        .trim()
        .notEmpty()
        .withMessage('Supplier name cannot be empty')
        .isLength({ min: 2, max: 100 })
        .withMessage('Supplier name must be between 2 and 100 characters'),
    body('company_name')
        .optional({ nullable: true })
        .trim()
        .isLength({ max: 100 })
        .withMessage('Company name cannot exceed 100 characters'),
    body('email')
        .optional({ nullable: true, checkFalsy: true })
        .trim()
        .isEmail()
        .withMessage('Please provide a valid email address')
        .normalizeEmail()
        .isLength({ max: 100 })
        .withMessage('Email cannot exceed 100 characters'),
    body('phone')
        .optional()
        .trim()
        .notEmpty()
        .withMessage('Phone number cannot be empty')
        .isLength({ min: 7, max: 20 })
        .withMessage('Phone number must be between 7 and 20 characters')
        .matches(/^[0-9+\-\s()]+$/)
        .withMessage('Phone number contains invalid characters'),
    body('address')
        .optional({ nullable: true })
        .trim(),
    body('city')
        .optional({ nullable: true })
        .trim()
        .isLength({ max: 50 })
        .withMessage('City cannot exceed 50 characters'),
    body('payment_terms')
        .optional({ nullable: true })
        .trim()
        .isLength({ max: 50 })
        .withMessage('Payment terms cannot exceed 50 characters'),
    body('notes')
        .optional({ nullable: true })
        .trim(),
    body('is_active')
        .optional()
        .custom(val => [0, 1, '0', '1', true, false, 'true', 'false'].includes(val))
        .withMessage('is_active must be a boolean or 1/0')
];

// Query validation for supplier purchases
const supplierPurchasesValidation = [
    param('id')
        .isInt({ min: 1 })
        .withMessage('Supplier ID must be a positive integer'),
    query('page')
        .optional()
        .isInt({ min: 1 })
        .withMessage('Page must be a positive integer'),
    query('limit')
        .optional()
        .isInt({ min: 1, max: 100 })
        .withMessage('Limit must be between 1 and 100'),
    query('status')
        .optional()
        .isIn(['pending', 'received', 'partial', 'cancelled', ''])
        .withMessage('Status must be pending, received, partial, or cancelled'),
    query('payment_status')
        .optional()
        .isIn(['pending', 'partial', 'paid', 'overdue', ''])
        .withMessage('Payment status must be pending, partial, paid, or overdue'),
    query('start_date')
        .optional()
        .isISO8601()
        .withMessage('start_date must be a valid date format (YYYY-MM-DD)'),
    query('end_date')
        .optional()
        .isISO8601()
        .withMessage('end_date must be a valid date format (YYYY-MM-DD)'),
    query('sortBy')
        .optional()
        .isIn(['id', 'purchase_number', 'purchase_date', 'total_amount', 'amount_paid', 'amount_due', 'payment_status', 'status', 'created_at'])
        .withMessage('Invalid sortBy field'),
    query('sortOrder')
        .optional()
        .isIn(['ASC', 'DESC', 'asc', 'desc'])
        .withMessage('sortOrder must be ASC or DESC')
];

// ============================================
// ROUTE DEFINITIONS
// ============================================

// 1. GET / - List all suppliers (paginated, search by name/phone)
router.get('/', requirePermission('suppliers.view'), listSuppliersValidation, validate, supplierController.getSuppliers);

// 2. POST / - Create new supplier
router.post('/', requirePermission('suppliers.edit'), createSupplierValidation, validate, supplierController.createSupplier);

// 3. GET /:id/purchases - Get supplier's purchase history
router.get('/:id/purchases', requirePermission('suppliers.view'), supplierPurchasesValidation, validate, supplierController.getSupplierPurchases);

// 4. GET /:id/balance - Get supplier outstanding balance
router.get('/:id/balance', requirePermission('suppliers.view'), idParamValidation, validate, supplierController.getSupplierBalance);

// 5. GET /:id - Get supplier by ID with purchase history summary
router.get('/:id', requirePermission('suppliers.view'), idParamValidation, validate, supplierController.getSupplierById);

// 6. PUT /:id - Update supplier
router.put('/:id', requirePermission('suppliers.edit'), updateSupplierValidation, validate, supplierController.updateSupplier);

// 7. DELETE /:id - Soft delete (set is_active=0)
router.delete('/:id', requirePermission('suppliers.edit'), idParamValidation, validate, supplierController.deleteSupplier);

module.exports = router;
