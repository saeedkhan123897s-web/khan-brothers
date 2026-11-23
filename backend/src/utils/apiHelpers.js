const { generateId } = require('./helpers');

function asyncHandler(handler) {
    return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function paginationFrom(query = {}) {
    const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(query.limit, 10) || 20));
    return { page, limit, offset: (page - 1) * limit };
}

function paginated(data, total, page, limit) {
    return {
        data,
        pagination: {
            total: Number(total) || 0,
            page,
            limit,
            totalPages: Math.ceil((Number(total) || 0) / limit),
            hasNext: page * limit < Number(total),
            hasPrev: page > 1
        }
    };
}

function makeDocumentNumber(prefix) {
    return generateId(prefix).slice(0, 30);
}

async function documentNumber(connection, key, fallback) {
    const [[row]] = await connection.execute('SELECT setting_value FROM settings WHERE setting_key=?', [key]);
    const setting = row?.setting_value || '';
    return makeDocumentNumber(/^[a-z0-9]{1,8}$/i.test(setting) ? setting.toUpperCase() : fallback);
}

function uniqueProducts(items) {
    return new Set(items.map(item => Number(item.product_id))).size === items.length;
}

async function recordAudit(connection, req, { action, module, recordId = null, oldValues = null, newValues = null, description = null }) {
    await connection.execute(
        `INSERT INTO audit_trail
            (user_id, user_name, action, module, record_id, old_values, new_values, ip_address, description)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            req.user?.id || null,
            req.user?.name || null,
            action,
            module,
            recordId,
            oldValues ? JSON.stringify(oldValues) : null,
            newValues ? JSON.stringify(newValues) : null,
            req.ip || null,
            description
        ]
    );
}

function parseId(value) {
    const id = Number.parseInt(value, 10);
    return Number.isSafeInteger(id) && id > 0 ? id : null;
}

module.exports = { asyncHandler, paginationFrom, paginated, makeDocumentNumber, recordAudit, parseId, documentNumber, uniqueProducts };
