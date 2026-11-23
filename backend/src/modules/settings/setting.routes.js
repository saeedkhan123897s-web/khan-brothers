const express = require('express');
const { body, param } = require('express-validator');
const { authenticate } = require('../../middleware/auth');
const { requirePermission } = require('../../middleware/permissions');
const { validate } = require('../../middleware/validate');
const { query, transaction } = require('../../config/database');
const { methods, settingKey } = require('../used-bikes/used-bike.payments');
const { asyncHandler, recordAudit } = require('../../utils/apiHelpers');

const router = express.Router();

router.get('/public', asyncHandler(async (req, res) => {
    const rows = await query("SELECT setting_key,setting_value FROM settings WHERE setting_group IN ('business','general')");
    const settings = Object.fromEntries(rows.map(row => [row.setting_key, row.setting_value]));
    const publicKeys = ['business_name', 'business_tagline', 'business_address', 'business_phone', 'business_email', 'currency', 'currency_symbol'];
    res.json({ success: true, data: Object.fromEntries(publicKeys.filter(key => settings[key] !== undefined).map(key => [key, settings[key]])) });
}));

router.use(authenticate);

router.get('/', requirePermission('settings.view'), asyncHandler(async (req, res) => {
    const rows = await query('SELECT * FROM settings ORDER BY setting_group,setting_key');
    res.json({ success: true, data: rows });
}));

router.get('/:key', requirePermission('settings.view'), [param('key').matches(/^[a-zA-Z0-9_.-]{1,50}$/)], validate, asyncHandler(async (req, res) => {
    const rows = await query('SELECT * FROM settings WHERE setting_key=?', [req.params.key]);
    if (!rows.length) return res.status(404).json({ success: false, error: 'Setting not found' });
    res.json({ success: true, data: rows[0] });
}));

function validateBikeMethods(key, value) {
    if (key !== settingKey) return;
    let selected;
    try { selected = JSON.parse(value); }
    catch { throw Object.assign(new Error('Select at least one valid motorcycle payment method.'), { statusCode: 400 }); }
    if (!Array.isArray(selected) || !selected.length || selected.some(method => !Object.hasOwn(methods, method)) || new Set(selected).size !== selected.length) {
        throw Object.assign(new Error('Select at least one valid motorcycle payment method.'), { statusCode: 400 });
    }
}

router.put('/', requirePermission('settings.edit'), [body('settings').isArray({ min: 1 }), body('settings.*.key').matches(/^[a-zA-Z0-9_.-]{1,50}$/), body('settings.*.value').isString().isLength({ max: 2000 })], validate, asyncHandler(async (req, res) => {
    for (const item of req.body.settings) validateBikeMethods(item.key, item.value);
    const updated = await transaction(async connection => {
        for (const item of req.body.settings) {
            await connection.execute('INSERT INTO settings (setting_key,setting_value,setting_group) VALUES (?,?,?) ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value),setting_group=VALUES(setting_group)', [item.key, item.value, item.group || 'general']);
        }
        await recordAudit(connection, req, { action: 'update', module: 'settings', newValues: req.body.settings.map(item => ({ key: item.key, group: item.group || 'general' })), description: 'Business settings updated' });
        return req.body.settings.length;
    });
    res.json({ success: true, updated });
}));

router.put('/:key', requirePermission('settings.edit'), [
    param('key').matches(/^[a-zA-Z0-9_.-]{1,50}$/),
    body('value').isString().isLength({ max: 2000 }),
    body('group').optional().isLength({ max: 30 })
], validate, asyncHandler(async (req, res) => {
    validateBikeMethods(req.params.key, req.body.value);
    await query('INSERT INTO settings (setting_key,setting_value,setting_group) VALUES (?,?,?) ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value),setting_group=VALUES(setting_group)', [req.params.key, req.body.value, req.body.group || 'general']);
    res.json({ success: true, data: { setting_key: req.params.key, setting_value: req.body.value, setting_group: req.body.group || 'general' } });
}));

module.exports = router;
