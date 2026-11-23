// ============================================
// AUTH ROUTES - Khan Brothers Workshop ERP
// Authentication & User Management Routes
// ============================================

const express = require('express');
const router = express.Router();
const { body, query, param } = require('express-validator');

// Controller
const authController = require('./auth.controller');

// Middleware
const { authenticate, optionalAuth } = require('../../middleware/auth');
const { adminOnly, managementOnly } = require('../../middleware/permissions');
const { validate } = require('../../middleware/validate');
const { ROLES } = require('../../utils/constants');

// ============================================
// VALIDATION RULES
// ============================================

const registerValidation = [
    body('name')
        .trim()
        .notEmpty().withMessage('Name is required')
        .isLength({ min: 2, max: 100 }).withMessage('Name must be between 2 and 100 characters'),
    body('email')
        .trim()
        .notEmpty().withMessage('Email is required')
        .isEmail().withMessage('Please provide a valid email address'),
    body('password')
        .notEmpty().withMessage('Password is required')
        .isLength({ min: 6 }).withMessage('Password must be at least 6 characters long'),
    body('phone')
        .optional({ checkFalsy: true })
        .trim()
        .isLength({ max: 20 }).withMessage('Phone number cannot exceed 20 characters'),
    body('role')
        .optional({ checkFalsy: true })
        .isIn(Object.values(ROLES)).withMessage(`Invalid role. Allowed values: ${Object.values(ROLES).join(', ')}`),
    body('address')
        .optional({ checkFalsy: true })
        .trim()
];

const loginValidation = [
    body('email')
        .trim()
        .notEmpty().withMessage('Email is required')
        .isEmail().withMessage('Please provide a valid email address'),
    body('password')
        .notEmpty().withMessage('Password is required')
];

const updateMeValidation = [
    body('name')
        .optional()
        .trim()
        .notEmpty().withMessage('Name cannot be empty')
        .isLength({ min: 2, max: 100 }).withMessage('Name must be between 2 and 100 characters'),
    body('email')
        .optional()
        .trim()
        .isEmail().withMessage('Please provide a valid email address'),
    body('phone')
        .optional({ checkFalsy: true })
        .trim()
        .isLength({ max: 20 }).withMessage('Phone number cannot exceed 20 characters'),
    body('address')
        .optional({ checkFalsy: true })
        .trim()
];

const changePasswordValidation = [
    body('currentPassword')
        .notEmpty().withMessage('Current password is required'),
    body('newPassword')
        .notEmpty().withMessage('New password is required')
        .isLength({ min: 6 }).withMessage('New password must be at least 6 characters long')
        .custom((value, { req }) => {
            if (value === req.body.currentPassword) {
                throw new Error('New password must be different from current password');
            }
            return true;
        })
];

const listUsersValidation = [
    query('page')
        .optional()
        .isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit')
        .optional()
        .isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
    query('role')
        .optional()
        .isIn(Object.values(ROLES)).withMessage(`Invalid role filter. Allowed values: ${Object.values(ROLES).join(', ')}`),
    query('search')
        .optional()
        .trim(),
    query('is_active')
        .optional()
        .isIn(['0', '1', 'true', 'false', 0, 1]).withMessage('is_active must be 0, 1, true, or false')
];

const userIdParamValidation = [
    param('id')
        .isInt({ min: 1 }).withMessage('User ID must be a positive integer')
];

const updateUserValidation = [
    param('id')
        .isInt({ min: 1 }).withMessage('User ID must be a positive integer'),
    body('name')
        .optional()
        .trim()
        .notEmpty().withMessage('Name cannot be empty')
        .isLength({ min: 2, max: 100 }).withMessage('Name must be between 2 and 100 characters'),
    body('email')
        .optional()
        .trim()
        .isEmail().withMessage('Please provide a valid email address'),
    body('phone')
        .optional({ checkFalsy: true })
        .trim()
        .isLength({ max: 20 }).withMessage('Phone number cannot exceed 20 characters'),
    body('role')
        .optional()
        .isIn(Object.values(ROLES)).withMessage(`Invalid role. Allowed values: ${Object.values(ROLES).join(', ')}`),
    body('is_active')
        .optional()
        .isIn([0, 1, '0', '1', true, false]).withMessage('is_active must be 0, 1, true, or false'),
    body('address')
        .optional({ checkFalsy: true })
        .trim()
];

// ============================================
// AUTHENTICATION ROUTES
// ============================================

/**
 * @route   POST /api/auth/register
 * @desc    Register a new user (admin registers staff, public registers customers)
 * @access  Public / Optional Authenticated (Admin)
 */
router.post(
    '/register',
    optionalAuth,
    registerValidation,
    validate,
    authController.register
);

/**
 * @route   POST /api/auth/login
 * @desc    Login user with email & password, return JWT token & set cookie
 * @access  Public
 */
router.post(
    '/login',
    loginValidation,
    validate,
    authController.login
);

/**
 * @route   POST /api/auth/logout
 * @desc    Logout user, clear token cookie, and record audit trail
 * @access  Public / Optional Authenticated
 */
router.post(
    '/logout',
    optionalAuth,
    authController.logout
);

/**
 * @route   GET /api/auth/me
 * @desc    Get current logged-in user profile
 * @access  Private
 */
router.get(
    '/me',
    authenticate,
    authController.getMe
);

/**
 * @route   PUT /api/auth/me
 * @desc    Update current logged-in user profile
 * @access  Private
 */
router.put(
    '/me',
    authenticate,
    updateMeValidation,
    validate,
    authController.updateMe
);

/**
 * @route   PUT /api/auth/change-password
 * @desc    Change current logged-in user password
 * @access  Private
 */
router.put(
    '/change-password',
    authenticate,
    changePasswordValidation,
    validate,
    authController.changePassword
);

// ============================================
// USER MANAGEMENT ROUTES (Admin & Management)
// ============================================

/**
 * @route   GET /api/auth/users
 * @desc    Get paginated list of users with search and filter
 * @access  Private (Management: Owner, Admin, Manager)
 */
router.get(
    '/users',
    authenticate,
    managementOnly,
    listUsersValidation,
    validate,
    authController.getUsers
);

/**
 * @route   GET /api/auth/users/:id
 * @desc    Get single user details by ID
 * @access  Private (Management: Owner, Admin, Manager)
 */
router.get(
    '/users/:id',
    authenticate,
    managementOnly,
    userIdParamValidation,
    validate,
    authController.getUserById
);

/**
 * @route   PUT /api/auth/users/:id
 * @desc    Update user details, role, or active status
 * @access  Private (Admin Only: Owner, Admin)
 */
router.put(
    '/users/:id',
    authenticate,
    adminOnly,
    updateUserValidation,
    validate,
    authController.updateUserById
);

router.use(require('./permission.routes'));

module.exports = router;
