// ============================================
// AUTHENTICATION MIDDLEWARE - JWT
// ============================================

const jwt = require('jsonwebtoken');
const { queryOne } = require('../config/database');

function verifyRequestToken(req) {
    const authorization = req.headers.authorization;
    const token = authorization?.startsWith('Bearer ') ? authorization.split(' ')[1] : req.cookies?.token;
    return token ? jwt.verify(token, process.env.JWT_SECRET) : null;
}

// Verify JWT token
async function authenticate(req, res, next) {
    try {
        const decoded = verifyRequestToken(req);
        if (!decoded) {
            return res.status(401).json({
                success: false,
                error: 'Access denied. No token provided.'
            });
        }

        // Get user from database
        const user = await queryOne(
            'SELECT id, name, email, phone, role, is_active FROM users WHERE id = ? AND is_active = 1',
            [decoded.id]
        );

        if (!user) {
            return res.status(401).json({
                success: false,
                error: 'Invalid token. User not found or inactive.'
            });
        }

        // Attach user to request
        req.user = user;
        next();

    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                error: 'Token expired. Please login again.'
            });
        }
        return res.status(401).json({
            success: false,
            error: 'Invalid token.'
        });
    }
}

// Optional authentication (doesn't fail if no token)
async function optionalAuth(req, res, next) {
    try {
        const decoded = verifyRequestToken(req);
        if (decoded) {
            const user = await queryOne(
                'SELECT id, name, email, phone, role, is_active FROM users WHERE id = ? AND is_active = 1',
                [decoded.id]
            );
            if (user) req.user = user;
        }
    } catch (error) {
        // Silently continue without auth
    }
    next();
}

module.exports = { authenticate, optionalAuth, verifyRequestToken };
