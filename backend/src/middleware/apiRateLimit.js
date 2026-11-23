const rateLimit = require('express-rate-limit');
const { verifyRequestToken } = require('./auth');
const { ROLES } = require('../utils/constants');

const windowMs = 15 * 60 * 1000;
const staffRoles = new Set(Object.values(ROLES).filter(role => role !== ROLES.CUSTOMER));

const limitLogin = rateLimit({
    windowMs,
    limit: 20,
    message: { success: false, error: 'Too many login attempts. Try again later.' }
});

const apiLimiter = rateLimit({
    windowMs,
    limit: (_req, res) => res.locals.staffRequest?.readOnly ? 1200 : 100,
    keyGenerator: (req, res) => {
        const staff = res.locals.staffRequest;
        return staff ? `staff:${staff.id}:${staff.readOnly ? 'read' : 'write'}` : req.ip;
    },
    message: { success: false, error: 'Too many requests. Try again later.' }
});

function limitApi(req, res, next) {
    // The POST login route has its own stricter limit.
    if (req.method === 'POST' && /^\/auth\/login\/?$/i.test(req.path)) return next();

    try {
        const claims = verifyRequestToken(req);
        const id = Number(claims?.id);
        if (Number.isSafeInteger(id) && id > 0 && staffRoles.has(claims.role)) {
            res.locals.staffRequest = { id, readOnly: req.method === 'GET' || req.method === 'HEAD' };
        }
    } catch {
        // Invalid or expired credentials use the anonymous request budget.
    }

    return apiLimiter(req, res, next);
}

module.exports = { limitApi, limitLogin };
