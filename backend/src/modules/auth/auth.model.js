// ============================================
// AUTH MODEL - Khan Brothers Workshop ERP
// Database queries for users and authentication
// ============================================

const bcrypt = require('bcryptjs');
const { query, queryInsert, queryUpdate, queryOne, pool } = require('../../config/database');
const { paginate, paginationResponse, nowSQL } = require('../../utils/helpers');
const { ROLES, AUDIT_ACTIONS } = require('../../utils/constants');

/**
 * Create a new user with hashed password
 * @param {Object} userData
 * @param {string} userData.name
 * @param {string} userData.email
 * @param {string} [userData.phone]
 * @param {string} userData.password
 * @param {string} [userData.role='customer']
 * @param {string} [userData.address]
 * @param {number|boolean} [userData.is_active=1]
 * @returns {Promise<Object>} Created user object (excluding password)
 */
async function createUser(userData) {
    const {
        name,
        email,
        phone = null,
        password,
        role = ROLES.CUSTOMER,
        address = null,
        is_active = 1
    } = userData;

    // Hash password if not already hashed with bcrypt
    let hashedPassword = password;
    if (!password.startsWith('$2a$') && !password.startsWith('$2b$')) {
        hashedPassword = await bcrypt.hash(password, 10);
    }

    const sql = `
        INSERT INTO users (
            name, email, phone, password, role, address, is_active, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
    `;

    const insertId = await queryInsert(sql, [
        name.trim(),
        email.toLowerCase().trim(),
        phone ? phone.trim() : null,
        hashedPassword,
        role,
        address ? address.trim() : null,
        is_active ? 1 : 0
    ]);

    return await findById(insertId);
}

/**
 * Find user by email address (includes password for authentication verification)
 * @param {string} email
 * @returns {Promise<Object|null>} User object or null
 */
async function findByEmail(email) {
    if (!email) return null;

    const sql = `
        SELECT id, name, email, phone, password, role, address, is_active, last_login, created_at, updated_at
        FROM users
        WHERE LOWER(email) = LOWER(?)
    `;

    return await queryOne(sql, [email.trim()]);
}

/**
 * Find user by ID
 * @param {number|string} id
 * @param {boolean} [includePassword=false] Whether to include hashed password
 * @returns {Promise<Object|null>} User object or null
 */
async function findById(id, includePassword = false) {
    if (!id) return null;

    const passwordColumn = includePassword ? 'password, ' : '';
    const sql = `
        SELECT id, name, email, phone, ${passwordColumn}role, address, is_active, last_login, created_at, updated_at
        FROM users
        WHERE id = ?
    `;

    return await queryOne(sql, [id]);
}

/**
 * Update user details
 * @param {number|string} id
 * @param {Object} userData Fields to update
 * @returns {Promise<Object|null>} Updated user object
 */
async function updateUser(id, userData) {
    const fields = [];
    const values = [];

    if (userData.name !== undefined) {
        fields.push('name = ?');
        values.push(userData.name.trim());
    }
    if (userData.phone !== undefined) {
        fields.push('phone = ?');
        values.push(userData.phone ? userData.phone.trim() : null);
    }
    if (userData.address !== undefined) {
        fields.push('address = ?');
        values.push(userData.address ? userData.address.trim() : null);
    }
    if (userData.email !== undefined) {
        fields.push('email = ?');
        values.push(userData.email.toLowerCase().trim());
    }
    if (userData.role !== undefined) {
        fields.push('role = ?');
        values.push(userData.role);
    }
    if (userData.is_active !== undefined) {
        fields.push('is_active = ?');
        values.push(userData.is_active ? 1 : 0);
    }

    if (fields.length === 0) {
        return await findById(id);
    }

    values.push(id);
    const sql = `UPDATE users SET ${fields.join(', ')}, updated_at = NOW() WHERE id = ?`;
    await queryUpdate(sql, values);

    return await findById(id);
}

/**
 * Update user password
 * @param {number|string} id
 * @param {string} newPassword Plain text or bcrypt hash
 * @returns {Promise<number>} Number of affected rows
 */
async function updatePassword(id, newPassword) {
    let hashedPassword = newPassword;
    if (!newPassword.startsWith('$2a$') && !newPassword.startsWith('$2b$')) {
        hashedPassword = await bcrypt.hash(newPassword, 10);
    }

    const sql = 'UPDATE users SET password = ?, updated_at = NOW() WHERE id = ?';
    return await queryUpdate(sql, [hashedPassword, id]);
}

/**
 * Update user's last login timestamp
 * @param {number|string} id
 * @returns {Promise<number>} Number of affected rows
 */
async function updateLastLogin(id) {
    const sql = 'UPDATE users SET last_login = ? WHERE id = ?';
    return await queryUpdate(sql, [nowSQL(), id]);
}

/**
 * Record an entry into the audit_trail table
 * @param {Object} auditData
 * @param {number} [auditData.userId]
 * @param {string} [auditData.userName]
 * @param {string} auditData.action
 * @param {string} [auditData.module='auth']
 * @param {number} [auditData.recordId]
 * @param {Object} [auditData.oldValues]
 * @param {Object} [auditData.newValues]
 * @param {string} [auditData.ipAddress]
 * @param {string} [auditData.description]
 * @returns {Promise<number|null>} Insert ID or null if failed
 */
async function recordAuditTrail({
    userId = null,
    userName = null,
    action,
    module = 'auth',
    recordId = null,
    oldValues = null,
    newValues = null,
    ipAddress = null,
    description = null
}) {
    try {
        const sql = `
            INSERT INTO audit_trail (
                user_id, user_name, action, module, record_id,
                old_values, new_values, ip_address, description, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
        `;

        const oldJson = oldValues ? JSON.stringify(oldValues) : null;
        const newJson = newValues ? JSON.stringify(newValues) : null;

        return await queryInsert(sql, [
            userId,
            userName,
            action,
            module,
            recordId,
            oldJson,
            newJson,
            ipAddress,
            description
        ]);
    } catch (error) {
        console.error('Audit trail logging error:', error.message);
        return null;
    }
}

/**
 * Get paginated list of users with optional filtering
 * @param {Object} [options]
 * @param {number} [options.page=1]
 * @param {number} [options.limit=20]
 * @param {string} [options.role]
 * @param {string} [options.search]
 * @param {boolean|number|string} [options.isActive]
 * @returns {Promise<Object>} Paginated response { data, pagination }
 */
async function findAllUsers({ page = 1, limit = 20, role, search, isActive } = {}) {
    const pagination = paginate(page, limit);
    const conditions = [];
    const params = [];

    if (role) {
        conditions.push('role = ?');
        params.push(role);
    }

    if (isActive !== undefined && isActive !== null && isActive !== '') {
        conditions.push('is_active = ?');
        params.push(isActive === 'true' || isActive === true || isActive === 1 || isActive === '1' ? 1 : 0);
    }

    if (search) {
        conditions.push('(name LIKE ? OR email LIKE ? OR phone LIKE ?)');
        const searchPattern = `%${search.trim()}%`;
        params.push(searchPattern, searchPattern, searchPattern);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countSql = `SELECT COUNT(*) as total FROM users ${whereClause}`;
    const countResult = await queryOne(countSql, params);
    const total = countResult ? countResult.total : 0;

    const listSql = `
        SELECT id, name, email, phone, role, address, is_active, last_login, created_at, updated_at
        FROM users
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
    `;

    const users = await query(listSql, [...params, pagination.limit, pagination.offset]);

    return paginationResponse(users, total, pagination.page, pagination.limit);
}

/**
 * Compare plain password against bcrypt hashed password
 * @param {string} plainPassword
 * @param {string} hashedPassword
 * @returns {Promise<boolean>}
 */
async function comparePassword(plainPassword, hashedPassword) {
    return await bcrypt.compare(plainPassword, hashedPassword);
}

module.exports = {
    createUser,
    findByEmail,
    findById,
    updateUser,
    updatePassword,
    updateLastLogin,
    recordAuditTrail,
    findAllUsers,
    comparePassword
};
