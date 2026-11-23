// ============================================
// PERMISSIONS MIDDLEWARE - Role-Based Access
// ============================================

const { ROLES } = require('../utils/constants');
const { definitions, hasPermission, getOverrides } = require('../utils/routePermissions');

// Check if user has one of the allowed roles
function authorize(...allowedRoles) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required'
            });
        }

        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                error: 'You do not have permission to perform this action'
            });
        }

        next();
    };
}

// Only owner and admin
function adminOnly(req, res, next) {
    return authorize(ROLES.OWNER, ROLES.ADMIN)(req, res, next);
}

// Management level (owner, admin, manager)
function managementOnly(req, res, next) {
    return authorize(ROLES.OWNER, ROLES.ADMIN, ROLES.MANAGER)(req, res, next);
}

// Staff level (everyone except customer)
function staffOnly(req, res, next) {
    return authorize(
        ROLES.OWNER, ROLES.ADMIN, ROLES.MANAGER,
        ROLES.SALESMAN, ROLES.MECHANIC, ROLES.ACCOUNTANT
    )(req, res, next);
}

function requirePermission(...keys) {
    for (const key of keys) {
        if (!Object.hasOwn(definitions, key)) throw new Error(`Unknown permission: ${key}`);
    }
    return async (req, res, next) => {
        try {
            if (!req.user) return res.status(401).json({ success: false, error: 'Authentication required' });
            const overrides = await getOverrides(req);
            if (!keys.some(key => hasPermission(req.user, key, overrides))) {
                return res.status(403).json({ success: false, error: 'Your account does not have permission for this action.' });
            }
            next();
        } catch (error) {
            next(error);
        }
    };
}

module.exports = { authorize, adminOnly, managementOnly, staffOnly, requirePermission };
