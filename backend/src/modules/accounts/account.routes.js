const express = require('express');
const { businessDay } = require('../used-bikes/used-bike.payments');
const { body, param, query: queryValidator } = require('express-validator');
const { authenticate } = require('../../middleware/auth');
const { requirePermission } = require('../../middleware/permissions');
const { validate } = require('../../middleware/validate');
const { transaction, queryOne, query } = require('../../config/database');
const { asyncHandler, paginationFrom, paginated, makeDocumentNumber, recordAudit } = require('../../utils/apiHelpers');

const router = express.Router();
router.use(authenticate);

const listAccounts = asyncHandler(async (req, res) => {
    const rows = await query(`SELECT a.*,p.name AS parent_name FROM accounts a LEFT JOIN accounts p ON p.id=a.parent_id ${req.query.include_inactive === 'true' ? '' : 'WHERE a.is_active=1'} ORDER BY a.account_code`);
    res.json({ success: true, data: rows });
});
router.get('/', requirePermission('accounts.view'), listAccounts);
router.get('/accounts', requirePermission('accounts.view'), listAccounts);

const createAccount = asyncHandler(async (req, res) => {
    const result = await query('INSERT INTO accounts (account_code,name,account_type,parent_id,description) VALUES (?,?,?,?,?)', [req.body.account_code, req.body.name, req.body.account_type, req.body.parent_id || null, req.body.description || null]);
    res.status(201).json({ success: true, data: await queryOne('SELECT * FROM accounts WHERE id=?', [result.insertId]) });
});
const createAccountValidation = [
    body('account_code').trim().notEmpty().isLength({ max: 20 }),
    body('name').trim().notEmpty().isLength({ max: 100 }),
    body('account_type').isIn(['asset', 'liability', 'equity', 'income', 'expense']),
    body('parent_id').optional({ nullable: true, checkFalsy: true }).isInt({ min: 1 }),
    body('description').optional({ nullable: true }).isString(),
    validate,
    createAccount
];
router.post('/', requirePermission('accounts.manage'), ...createAccountValidation);
router.post('/accounts', requirePermission('accounts.manage'), ...createAccountValidation);

router.put('/accounts/:id', requirePermission('accounts.manage'), [
    param('id').isInt({ min: 1 }),
    body('account_code').optional().trim().notEmpty().isLength({ max: 20 }),
    body('name').optional().trim().notEmpty().isLength({ max: 100 }),
    body('account_type').optional().isIn(['asset', 'liability', 'equity', 'income', 'expense']),
    body('parent_id').optional({ nullable: true, checkFalsy: true }).isInt({ min: 1 }),
    body('description').optional({ nullable: true }).isString(),
    body('is_active').optional().isBoolean()
], validate, asyncHandler(async (req, res) => {
    const allowed = ['account_code', 'name', 'account_type', 'parent_id', 'description', 'is_active'];
    const fields = allowed.filter(key => req.body[key] !== undefined);
    if (fields.length) await query(`UPDATE accounts SET ${fields.map(key => `${key}=?`).join(',')} WHERE id=?`, [...fields.map(key => req.body[key]), req.params.id]);
    const account = await queryOne('SELECT * FROM accounts WHERE id=?', [req.params.id]);
    if (!account) return res.status(404).json({ success: false, error: 'Account not found' });
    res.json({ success: true, data: account });
}));

router.get('/ledger', requirePermission('accounts.view'), [
    queryValidator('page').optional().isInt({ min: 1 }), queryValidator('limit').optional().isInt({ min: 1, max: 100 }),
    queryValidator('account_id').optional().isInt({ min: 1 }), queryValidator('start_date').optional().isISO8601(), queryValidator('end_date').optional().isISO8601()
], validate, asyncHandler(async (req, res) => {
    const { page, limit, offset } = paginationFrom(req.query);
    const clauses = [];
    const params = [];
    if (req.query.account_id) { clauses.push('l.account_id=?'); params.push(req.query.account_id); }
    if (req.query.start_date) { clauses.push('l.entry_date>=?'); params.push(req.query.start_date); }
    if (req.query.end_date) { clauses.push('l.entry_date<=?'); params.push(req.query.end_date); }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const count = await queryOne(`SELECT COUNT(*) total FROM ledger_entries l ${where}`, params);
    const rows = await query(`SELECT l.*,a.account_code,a.name AS account_name,a.account_type,u.name AS created_by_name FROM ledger_entries l JOIN accounts a ON a.id=l.account_id LEFT JOIN users u ON u.id=l.created_by ${where} ORDER BY l.entry_date DESC,l.id DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
    res.json({ success: true, ...paginated(rows, count.total, page, limit) });
}));

router.get('/trial-balance', requirePermission('accounts.view'), [queryValidator('as_of').optional().isISO8601()], validate, asyncHandler(async (req, res) => {
    const rows = await query(`SELECT a.id,a.account_code,a.name,a.account_type,COALESCE(SUM(l.debit),0) AS debit,COALESCE(SUM(l.credit),0) AS credit
        FROM accounts a LEFT JOIN ledger_entries l ON l.account_id=a.id ${req.query.as_of ? 'AND l.entry_date<=?' : ''}
        WHERE a.is_active=1 GROUP BY a.id ORDER BY a.account_code`, req.query.as_of ? [req.query.as_of] : []);
    const totals = rows.reduce((acc, row) => ({ debit: acc.debit + Number(row.debit), credit: acc.credit + Number(row.credit) }), { debit: 0, credit: 0 });
    res.json({ success: true, data: rows, totals, balanced: Math.abs(totals.debit - totals.credit) < 0.01 });
}));

router.post('/journal', requirePermission('accounts.manage'), [body('date').optional().isISO8601(), body('description').trim().notEmpty(), body('entries').isArray({ min: 2 }), body('entries.*.account_id').isInt({ min: 1 }), body('entries.*.debit').optional().isFloat({ min: 0 }), body('entries.*.credit').optional().isFloat({ min: 0 })], validate, asyncHandler(async (req, res) => {
    const result = await transaction(async connection => {
        const entries = req.body.entries.map(row => ({ account_id: Number(row.account_id), debit: Number(row.debit || 0), credit: Number(row.credit || 0) }));
        if (entries.some(row => row.debit < 0 || row.credit < 0 || (row.debit > 0 && row.credit > 0) || (row.debit === 0 && row.credit === 0))) { const error = new Error('Each journal line must contain either a positive debit or a positive credit'); error.statusCode = 400; throw error; }
        const debitTotal = entries.reduce((sum, row) => sum + row.debit, 0);
        const creditTotal = entries.reduce((sum, row) => sum + row.credit, 0);
        if (Math.abs(debitTotal - creditTotal) > 0.005) { const error = new Error('Journal debits and credits must balance'); error.statusCode = 400; throw error; }
        const date = req.body.date || new Date().toISOString().slice(0, 10);
        for (const entry of entries) {
            const [accounts] = await connection.execute('SELECT id,account_type,balance FROM accounts WHERE id=? AND is_active=1 FOR UPDATE', [entry.account_id]);
            const account = accounts[0];
            if (!account) { const error = new Error(`Account ${entry.account_id} not found`); error.statusCode = 404; throw error; }
            const normalDelta = ['asset', 'expense'].includes(account.account_type) ? entry.debit - entry.credit : entry.credit - entry.debit;
            const balance = Number(account.balance) + normalDelta;
            await connection.execute('UPDATE accounts SET balance=? WHERE id=?', [balance, account.id]);
            await connection.execute('INSERT INTO ledger_entries (account_id,entry_date,description,debit,credit,balance,reference_type,reference_id,created_by) VALUES (?,?,?,?,?,?,?,?,?)', [account.id, date, req.body.description, entry.debit, entry.credit, balance, 'journal', null, req.user.id]);
        }
        await recordAudit(connection, req, { action: 'create', module: 'accounts', newValues: { debitTotal, creditTotal }, description: 'Manual journal entry recorded' });
        return { debit_total: debitTotal, credit_total: creditTotal };
    });
    res.status(201).json({ success: true, data: result });
}));

router.get('/bank', requirePermission('accounts.view'), [queryValidator('include_inactive').optional().isBoolean()], validate, asyncHandler(async (req, res) => {
    const rows = await query(`SELECT * FROM bank_accounts ${req.query.include_inactive === 'true' ? '' : 'WHERE is_active=1'} ORDER BY bank_name,account_title`);
    res.json({ success: true, data: rows });
}));

router.post('/bank', requirePermission('accounts.manage'), [
    body('bank_name').trim().notEmpty().isLength({ max: 100 }),
    body('account_title').trim().notEmpty().isLength({ max: 100 }),
    body('account_number').optional({ nullable: true }).trim().isLength({ max: 30 }),
    body('branch').optional({ nullable: true }).trim().isLength({ max: 100 }),
    body('opening_balance').optional().isFloat({ min: 0 })
], validate, asyncHandler(async (req, res) => {
    const result = await query('INSERT INTO bank_accounts (bank_name,account_title,account_number,branch,balance) VALUES (?,?,?,?,?)', [req.body.bank_name, req.body.account_title, req.body.account_number || null, req.body.branch || null, Number(req.body.opening_balance || 0)]);
    res.status(201).json({ success: true, data: await queryOne('SELECT * FROM bank_accounts WHERE id=?', [result.insertId]) });
}));

router.put('/bank/:id', requirePermission('accounts.manage'), [
    param('id').isInt({ min: 1 }),
    body('bank_name').optional().trim().notEmpty().isLength({ max: 100 }),
    body('account_title').optional().trim().notEmpty().isLength({ max: 100 }),
    body('account_number').optional({ nullable: true }).trim().isLength({ max: 30 }),
    body('branch').optional({ nullable: true }).trim().isLength({ max: 100 }),
    body('is_active').optional().isBoolean()
], validate, asyncHandler(async (req, res) => {
    const allowed = ['bank_name', 'account_title', 'account_number', 'branch', 'is_active'];
    const fields = allowed.filter(key => req.body[key] !== undefined);
    if (fields.length) await query(`UPDATE bank_accounts SET ${fields.map(key => `${key}=?`).join(',')} WHERE id=?`, [...fields.map(key => req.body[key]), req.params.id]);
    const account = await queryOne('SELECT * FROM bank_accounts WHERE id=?', [req.params.id]);
    if (!account) return res.status(404).json({ success: false, error: 'Bank account not found' });
    res.json({ success: true, data: account });
}));

router.get('/bank/:id/transactions', requirePermission('accounts.view'), [param('id').isInt({ min: 1 })], validate, asyncHandler(async (req, res) => {
    const account = await queryOne('SELECT * FROM bank_accounts WHERE id=?', [req.params.id]);
    if (!account) return res.status(404).json({ success: false, error: 'Bank account not found' });
    const rows = await query('SELECT * FROM payments WHERE bank_name=? ORDER BY payment_date DESC,id DESC', [account.bank_name]);
    res.json({ success: true, data: rows });
}));

router.get('/expenses', requirePermission('accounts.view'), [
    queryValidator('page').optional().isInt({ min: 1 }), queryValidator('limit').optional().isInt({ min: 1, max: 100 }),
    queryValidator('business_area').optional().isIn(['general', 'used_bikes']),
    queryValidator('start_date').optional().isISO8601(), queryValidator('end_date').optional().isISO8601()
], validate, asyncHandler(async (req, res) => {
    const { page, limit, offset } = paginationFrom(req.query);
    const clauses = [];
    const args = [];
    if (req.query.business_area) { clauses.push('e.business_area=?'); args.push(req.query.business_area); }
    if (req.query.start_date) { clauses.push('e.expense_date>=?'); args.push(req.query.start_date); }
    if (req.query.end_date) { clauses.push('e.expense_date<=?'); args.push(req.query.end_date); }
    const where = clauses.length ? ' WHERE ' + clauses.join(' AND ') : '';
    const count = await queryOne('SELECT COUNT(*) total FROM expenses e' + where, args);
    const rows = await query(`SELECT e.*,u.name AS created_by_name,a.name AS approved_by_name,b.bank_name,b.account_title FROM expenses e
        LEFT JOIN users u ON u.id=e.created_by LEFT JOIN users a ON a.id=e.approved_by
        LEFT JOIN bank_accounts b ON b.id=e.bank_account_id${where} ORDER BY e.expense_date DESC,e.id DESC LIMIT ? OFFSET ?`,
        [...args, limit, offset]);
    res.json({ success: true, ...paginated(rows, count.total, page, limit) });
}));

router.post('/expenses', requirePermission('expenses.create'), [
    body('business_area').optional().isIn(['general','used_bikes']),
    body('category').trim().notEmpty().isLength({ max: 50 }), body('description').trim().notEmpty().isLength({ max: 255 }),
    body('amount').isFloat({ min: 0.01 }), body('expense_date').optional().isISO8601(),
    body('payment_method').optional().isIn(['cash', 'bank_transfer', 'card']), body('bank_account_id').optional({ nullable: true, checkFalsy: true }).isInt({ min: 1 })
], validate, asyncHandler(async (req, res) => {
    const result = await transaction(async connection => {
        const method = req.body.payment_method || 'cash';
        const bankId = req.body.bank_account_id || null;
        if (method === 'bank_transfer' && !bankId) { const error = new Error('Select a bank account for bank transfer expense'); error.statusCode = 400; throw error; }
        let bank = null;
        if (bankId) {
            const [rows] = await connection.execute('SELECT * FROM bank_accounts WHERE id=? AND is_active=1 FOR UPDATE', [bankId]);
            bank = rows[0];
            if (!bank) { const error = new Error('Bank account not found'); error.statusCode = 404; throw error; }
        }
        const amount = Number(req.body.amount);
        const area = req.body.business_area || 'general';
        const expenseDate = req.body.expense_date || (area === 'used_bikes' ? businessDay() : new Date().toISOString().slice(0, 10));
        const number = makeDocumentNumber('EXP');
        const [insert] = await connection.execute('INSERT INTO expenses (expense_number,category,description,amount,expense_date,payment_method,bank_account_id,receipt_url,notes,created_by,business_area) VALUES (?,?,?,?,?,?,?,?,?,?,?)', [number, req.body.category, req.body.description, amount, expenseDate, method, bankId, req.body.receipt_url || null, req.body.notes || null, req.user.id, area]);
        if (bank) await connection.execute('UPDATE bank_accounts SET balance=balance-? WHERE id=?', [amount, bank.id]);
        const expenseNames = { Kiraya: 'Rent', Chai: 'Miscellaneous Expenses', Petrol: 'Transportation', Mechanic: 'Workshop Expenses', Other: 'Miscellaneous Expenses' };
        const categoryAccount = area === 'used_bikes' ? (expenseNames[req.body.category] || req.body.category) : req.body.category;
        const [expenseAccounts] = await connection.execute("SELECT id,account_type,balance FROM accounts WHERE account_type='expense' AND LOWER(name)=LOWER(?) AND is_active=1 LIMIT 1 FOR UPDATE", [categoryAccount]);
        let expenseAccount = expenseAccounts[0];
        if (!expenseAccount) {
            const [fallbackAccounts] = await connection.execute("SELECT id,account_type,balance FROM accounts WHERE account_type='expense' AND is_active=1 ORDER BY account_code LIMIT 1 FOR UPDATE");
            expenseAccount = fallbackAccounts[0];
        }
        const [cashAccounts] = await connection.execute('SELECT id,account_type,balance FROM accounts WHERE account_code=? AND is_active=1 LIMIT 1 FOR UPDATE', [bank ? '1100' : '1000']);
        if (expenseAccount && cashAccounts[0]) {
            const expense = expenseAccount;
            const cash = cashAccounts[0];
            await connection.execute('UPDATE accounts SET balance=balance+? WHERE id=?', [amount, expense.id]);
            await connection.execute('UPDATE accounts SET balance=balance-? WHERE id=?', [amount, cash.id]);
            await connection.execute('INSERT INTO ledger_entries (account_id,entry_date,description,debit,credit,balance,reference_type,reference_id,created_by) VALUES (?,?,?, ?,0,?,?,?,?)', [expense.id, expenseDate, req.body.description, amount, Number(expense.balance) + amount, 'expense', insert.insertId, req.user.id]);
            await connection.execute('INSERT INTO ledger_entries (account_id,entry_date,description,debit,credit,balance,reference_type,reference_id,created_by) VALUES (?,?,?,0,?,?,?,?,?)', [cash.id, expenseDate, req.body.description, amount, Number(cash.balance) - amount, 'expense', insert.insertId, req.user.id]);
        }
        await connection.execute(`INSERT INTO payments (payment_number,payment_type,reference_type,reference_id,amount,payment_method,payment_date,bank_name,notes,created_by) VALUES (?,'made','expense',?,?,?,?,?,?,?)`, [makeDocumentNumber('PAY'), insert.insertId, amount, method === 'card' ? 'card' : (method === 'bank_transfer' ? 'bank_transfer' : 'cash'), expenseDate, bank?.bank_name || null, number, req.user.id]);
        await recordAudit(connection, req, { action: 'create', module: 'accounts', recordId: insert.insertId, newValues: { number, amount }, description: `Expense ${number} recorded` });
        return { id: insert.insertId, expense_number: number, amount };
    });
    res.status(201).json({ success: true, data: result });
}));

router.post('/expenses/:id/approve', requirePermission('accounts.manage'), [param('id').isInt({ min: 1 })], validate, asyncHandler(async (req, res) => {
    const changed = await query('UPDATE expenses SET approved_by=? WHERE id=?', [req.user.id, req.params.id]);
    if (!changed.affectedRows) return res.status(404).json({ success: false, error: 'Expense not found' });
    res.json({ success: true, data: await queryOne('SELECT * FROM expenses WHERE id=?', [req.params.id]) });
}));

router.get('/cashbook', requirePermission('accounts.view'), [
    queryValidator('start_date').optional().isISO8601(),
    queryValidator('end_date').optional().isISO8601()
], validate, asyncHandler(async (req, res) => {
    const rows = await query(`SELECT payment_date, payment_type, reference_type, payment_number, amount, payment_method, notes FROM payments ${req.query.start_date || req.query.end_date ? 'WHERE (? IS NULL OR payment_date>=?) AND (? IS NULL OR payment_date<=?)' : ''} ORDER BY payment_date DESC,id DESC`, req.query.start_date || req.query.end_date ? [req.query.start_date || null, req.query.start_date || null, req.query.end_date || null, req.query.end_date || null] : []);
    const summary = rows.reduce((acc, row) => { const key = row.payment_type === 'received' ? 'received' : 'paid'; acc[key] += Number(row.amount); return acc; }, { received: 0, paid: 0 });
    res.json({ success: true, data: rows, summary: { ...summary, balance: summary.received - summary.paid } });
}));

module.exports = router;
