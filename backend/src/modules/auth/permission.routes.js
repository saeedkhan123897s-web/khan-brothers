'use strict';

const express = require('express');
const { param, body } = require('express-validator');
const { authenticate } = require('../../middleware/auth');
const { adminOnly } = require('../../middleware/permissions');
const { validate } = require('../../middleware/validate');
const { queryOne, transaction } = require('../../config/database');
const { asyncHandler, recordAudit } = require('../../utils/apiHelpers');
const { definitions, hasPermission, loadOverrides, getOverrides, staff } = require('../../utils/routePermissions');
const { ROLES } = require('../../utils/constants');

const router = express.Router();
const path = '/users/:id/permissions';
const idRule = param('id').isInt({ min: 1 });

function assertEditable(actor, target) {
    if (!target) throw Object.assign(new Error('User not found.'), { statusCode: 404 });
    if (!staff.includes(target.role) || target.role === ROLES.OWNER || actor.id === target.id ||
        (actor.role === ROLES.ADMIN && target.role === ROLES.ADMIN)) {
        throw Object.assign(new Error('You cannot customize permissions for this account.'), { statusCode: 403 });
    }
}

function permissionRows(target, overrides, editable) {
    return Object.entries(definitions).map(([key, definition]) => ({
        key, group: definition.group, label: definition.label,
        default_allowed: hasPermission(target, key),
        allowed: hasPermission(target, key, overrides),
        override: overrides[key] ?? null,
        editable: editable.has(key)
    }));
}

async function editableKeys(req) {
    const overrides = await getOverrides(req);
    return new Set(Object.keys(definitions).filter(key => hasPermission(req.user, key, overrides)));
}

router.get(path, authenticate, adminOnly, idRule, validate, asyncHandler(async (req, res) => {
    const target = await queryOne('SELECT id,name,role FROM users WHERE id=?', [req.params.id]);
    assertEditable(req.user, target);
    const [overrides, editable] = await Promise.all([loadOverrides(target.id), editableKeys(req)]);
    res.json({ success: true, data: { user: target, permissions: permissionRows(target, overrides, editable) } });
}));

router.put(path, authenticate, adminOnly, idRule, [
    body('permissions').isArray({ min: 1, max: Object.keys(definitions).length }).bail().custom(rows =>
        new Set(rows.map(row => row?.key)).size === rows.length).withMessage('Permission keys must be unique.'),
    body('permissions.*.key').isIn(Object.keys(definitions)),
    body('permissions.*.override').custom(value => value === null || typeof value === 'boolean')
], validate, asyncHandler(async (req, res) => {
    const allowed = await editableKeys(req);
    await transaction(async connection => {
        const [[target]] = await connection.execute('SELECT id,name,role FROM users WHERE id=? FOR UPDATE', [req.params.id]);
        assertEditable(req.user, target);
        const previous = await loadOverrides(target.id, connection);
        const changes = req.body.permissions.filter(row => (previous[row.key] ?? null) !== row.override);
        if (changes.some(row => !allowed.has(row.key))) {
            throw Object.assign(new Error('You may only change permissions that you hold.'), { statusCode: 403 });
        }
        if (!changes.length) return;
        const updated = { ...previous };
        for (const { key, override } of changes) {
            if (override === null) {
                await connection.execute('DELETE FROM user_route_permissions WHERE user_id=? AND permission_key=?', [target.id, key]);
                delete updated[key];
            } else {
                await connection.execute(
                    'INSERT INTO user_route_permissions (user_id,permission_key,allowed) VALUES (?,?,?) ON DUPLICATE KEY UPDATE allowed=?',
                    [target.id, key, override, override]);
                updated[key] = override;
            }
        }
        await recordAudit(connection, req, { action: 'update', module: 'auth', recordId: target.id, oldValues: previous, newValues: updated,
            description: 'Updated custom route permissions' });
    });
    res.json({ success: true, message: 'Route permissions saved.' });
}));

module.exports = router;
