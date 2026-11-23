// ============================================
// INVENTORY ROUTES - API Route Definitions
// Khan Brothers Motorcycle Workshop ERP
// ============================================

const express = require('express');
const router = express.Router();
const { body, param, query } = require('express-validator');

// Middlewares
const { authenticate } = require('../../middleware/auth');
const { requirePermission } = require('../../middleware/permissions');
const { validate } = require('../../middleware/validate');

// Controller
const inventoryController = require('./inventory.controller');

// ============================================
// INVENTORY ROUTE DEFINITIONS
// ============================================

/**
 * @route   GET /api/inventory/stock
 * @desc    Get current stock levels for all products (paginated with filters)
 * @access  Protected (Staff: Owner, Admin, Manager, Salesman, Mechanic, Accountant)
 */
router.get(
    '/stock',
    authenticate,
    requirePermission('inventory.view'),
    [
        query('page')
            .optional()
            .isInt({ min: 1 })
            .withMessage('Page must be a positive integer'),
        query('limit')
            .optional()
            .isInt({ min: 1, max: 100 })
            .withMessage('Limit must be between 1 and 100'),
        query('category_id')
            .optional()
            .isInt({ min: 1 })
            .withMessage('Category ID must be a positive integer'),
        query('brand_id')
            .optional()
            .isInt({ min: 1 })
            .withMessage('Brand ID must be a positive integer'),
        query('product_type').optional().isIn(['part', 'motorcycle']),
        query('stock_status')
            .optional()
            .isIn(['in_stock', 'low_stock', 'out_of_stock', 'overstocked', 'needs_attention', ''])
            .withMessage('Invalid stock status filter'),
        query('sort_by')
            .optional()
            .isIn(['name', 'sku', 'stock_quantity', 'cost_price', 'selling_price', 'category', 'brand', 'location', 'created_at'])
            .withMessage('Invalid sort_by field'),
        query('sort_order')
            .optional()
            .isIn(['asc', 'desc', 'ASC', 'DESC'])
            .withMessage('sort_order must be ASC or DESC')
    ],
    validate,
    inventoryController.getStockLevels
);

/**
 * @route   GET /api/inventory/low-stock
 * @desc    Get products below minimum stock level
 * @access  Protected (Staff)
 */
router.get(
    '/low-stock',
    authenticate,
    requirePermission('inventory.view'),
    [
        query('page')
            .optional()
            .isInt({ min: 1 })
            .withMessage('Page must be a positive integer'),
        query('limit')
            .optional()
            .isInt({ min: 1, max: 100 })
            .withMessage('Limit must be between 1 and 100'),
        query('category_id')
            .optional()
            .isInt({ min: 1 })
            .withMessage('Category ID must be a positive integer'),
        query('brand_id')
            .optional()
            .isInt({ min: 1 })
            .withMessage('Brand ID must be a positive integer')
    ],
    validate,
    inventoryController.getLowStockProducts
);

/**
 * @route   GET /api/inventory/valuation
 * @desc    Get total inventory valuation (cost price * quantity for all products)
 * @access  Protected (Staff)
 */
router.get(
    '/valuation',
    authenticate,
    requirePermission('inventory.finance'),
    [
        query('category_id')
            .optional()
            .isInt({ min: 1 })
            .withMessage('Category ID must be a positive integer'),
        query('brand_id')
            .optional()
            .isInt({ min: 1 })
            .withMessage('Brand ID must be a positive integer')
    ],
    validate,
    inventoryController.getValuation
);

/**
 * @route   GET /api/inventory/audit
 * @desc    Get stock audit report (expected vs actual)
 * @access  Protected (Staff)
 */
router.get(
    '/audit',
    authenticate,
    requirePermission('inventory.view'),
    [
        query('page')
            .optional()
            .isInt({ min: 1 })
            .withMessage('Page must be a positive integer'),
        query('limit')
            .optional()
            .isInt({ min: 1, max: 100 })
            .withMessage('Limit must be between 1 and 100'),
        query('category_id')
            .optional()
            .isInt({ min: 1 })
            .withMessage('Category ID must be a positive integer'),
        query('brand_id')
            .optional()
            .isInt({ min: 1 })
            .withMessage('Brand ID must be a positive integer')
    ],
    validate,
    inventoryController.getStockAudit
);

/**
 * @route   GET /api/inventory/movements
 * @desc    Get stock movement history (paginated, filter by product/type/date)
 * @access  Protected (Staff)
 */
router.get(
    '/movements',
    authenticate,
    requirePermission('inventory.view'),
    [
        query('page')
            .optional()
            .isInt({ min: 1 })
            .withMessage('Page must be a positive integer'),
        query('limit')
            .optional()
            .isInt({ min: 1, max: 100 })
            .withMessage('Limit must be between 1 and 100'),
        query('product_id')
            .optional()
            .isInt({ min: 1 })
            .withMessage('Product ID must be a positive integer'),
        query('movement_type')
            .optional()
            .isIn(['purchase', 'sale', 'return_in', 'return_out', 'adjustment', 'workshop_use', 'damage', ''])
            .withMessage('Invalid movement_type filter'),
        query('type')
            .optional()
            .isIn(['purchase', 'sale', 'return_in', 'return_out', 'adjustment', 'workshop_use', 'damage', ''])
            .withMessage('Invalid type filter'),
        query('start_date')
            .optional()
            .isDate()
            .withMessage('start_date must be a valid date in YYYY-MM-DD format'),
        query('end_date')
            .optional()
            .isDate()
            .withMessage('end_date must be a valid date in YYYY-MM-DD format')
    ],
    validate,
    inventoryController.getMovements
);

/**
 * @route   GET /api/inventory/movements/:productId
 * @desc    Get movements for a specific product
 * @access  Protected (Staff)
 */
router.get(
    '/movements/:productId',
    authenticate,
    requirePermission('inventory.view'),
    [
        param('productId')
            .isInt({ min: 1 })
            .withMessage('Valid numeric product ID is required'),
        query('page')
            .optional()
            .isInt({ min: 1 })
            .withMessage('Page must be a positive integer'),
        query('limit')
            .optional()
            .isInt({ min: 1, max: 100 })
            .withMessage('Limit must be between 1 and 100'),
        query('start_date')
            .optional()
            .isDate()
            .withMessage('start_date must be a valid date in YYYY-MM-DD format'),
        query('end_date')
            .optional()
            .isDate()
            .withMessage('end_date must be a valid date in YYYY-MM-DD format')
    ],
    validate,
    inventoryController.getProductMovements
);

/**
 * @route   GET /api/inventory/stock/:productId
 * @desc    Get stock details for a single product
 * @access  Protected (Staff)
 */
router.get(
    '/stock/:productId',
    authenticate,
    requirePermission('inventory.view'),
    [
        param('productId')
            .isInt({ min: 1 })
            .withMessage('Valid numeric product ID is required')
    ],
    validate,
    inventoryController.getProductStock
);

/**
 * @route   POST /api/inventory/adjust
 * @desc    Stock adjustment (increase/decrease with reason)
 * @access  Protected (Management: Owner, Admin, Manager)
 */
router.post(
    '/adjust',
    authenticate,
    requirePermission('inventory.adjust'),
    [
        body('product_id')
            .optional()
            .isInt({ min: 1 })
            .withMessage('product_id must be a positive integer'),
        body('productId')
            .optional()
            .isInt({ min: 1 })
            .withMessage('productId must be a positive integer'),
        body()
            .custom((bodyObj) => {
                const pid = bodyObj.product_id || bodyObj.productId;
                if (!pid || isNaN(parseInt(pid, 10)) || parseInt(pid, 10) <= 0) {
                    throw new Error('A valid product_id is required');
                }
                return true;
            }),
        body('quantity')
            .notEmpty()
            .withMessage('Quantity is required')
            .isInt()
            .withMessage('Quantity must be an integer'),
        body('adjustment_type')
            .optional()
            .isIn(['increase', 'decrease', 'set', 'add', 'deduct', 'subtract', 'exact'])
            .withMessage('adjustment_type must be one of: increase, decrease, set, add, deduct, subtract, exact'),
        body('movement_type')
            .optional()
            .isIn(['purchase', 'sale', 'return_in', 'return_out', 'adjustment', 'workshop_use', 'damage'])
            .withMessage('movement_type must be one of: purchase, sale, return_in, return_out, adjustment, workshop_use, damage'),
        body()
            .custom((bodyObj) => {
                const reason = (bodyObj.notes || bodyObj.reason || '').trim();
                if (!reason) {
                    throw new Error('Reason or notes for adjustment is required');
                }
                return true;
            }),
        body('cost_price')
            .optional({ nullable: true })
            .isFloat({ min: 0 })
            .withMessage('cost_price must be a non-negative number')
    ],
    validate,
    inventoryController.adjustStock
);

module.exports = router;
