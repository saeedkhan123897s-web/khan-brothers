const express = require('express');
const { query: queryValidator, param } = require('express-validator');
const { authenticate } = require('../../middleware/auth');
const { requirePermission } = require('../../middleware/permissions');
const { validate } = require('../../middleware/validate');
const { queryOne, query } = require('../../config/database');
const { asyncHandler, paginationFrom, paginated } = require('../../utils/apiHelpers');

const router = express.Router();
router.use(authenticate);

router.get('/summary', requirePermission('audit.view'), asyncHandler(async (req, res) => {
    const rows = await query('SELECT module,action,COUNT(*) AS count,MAX(created_at) AS latest_at FROM audit_trail GROUP BY module,action ORDER BY module,action');
    const totals = await queryOne('SELECT COUNT(*) AS total,COUNT(DISTINCT user_id) AS users,MAX(created_at) AS latest_at FROM audit_trail');
    res.json({ success: true, data: { totals, by_module_action: rows } });
}));

router.get('/', requirePermission('audit.view'), [
    queryValidator('page').optional().isInt({ min: 1 }),
    queryValidator('limit').optional().isInt({ min: 1, max: 100 }),
    queryValidator('user_id').optional().isInt({ min: 1 }),
    queryValidator('start_date').optional().isISO8601(),
    queryValidator('end_date').optional().isISO8601()
], validate, asyncHandler(async (req, res) => {
    const { page, limit, offset } = paginationFrom(req.query);
    const clauses = [];
    const params = [];
    for (const key of ['user_id', 'module', 'action']) {
        if (req.query[key]) { clauses.push(`a.${key}=?`); params.push(req.query[key]); }
    }
    if (req.query.start_date) { clauses.push('a.created_at>=?'); params.push(`${req.query.start_date} 00:00:00`); }
    if (req.query.end_date) { clauses.push('a.created_at<?'); params.push(`${req.query.end_date} 23:59:59`); }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const count = await queryOne(`SELECT COUNT(*) total FROM audit_trail a ${where}`, params);
    const rows = await query(`SELECT a.*,COALESCE(a.user_name,u.name) AS actor_name FROM audit_trail a LEFT JOIN users u ON u.id=a.user_id ${where} ORDER BY a.created_at DESC,a.id DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
    res.json({ success: true, ...paginated(rows, count.total, page, limit) });
}));

router.get('/:id', requirePermission('audit.view'), [param('id').isInt({ min: 1 })], validate, asyncHandler(async (req, res) => {
    const row = await queryOne('SELECT a.*,COALESCE(a.user_name,u.name) AS actor_name FROM audit_trail a LEFT JOIN users u ON u.id=a.user_id WHERE a.id=?', [req.params.id]);
    if (!row) return res.status(404).json({ success: false, error: 'Audit record not found' });
    res.json({ success: true, data: row });
}));

module.exports = router;
