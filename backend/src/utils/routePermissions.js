'use strict';

const { ROLES } = require('./constants');
const { query } = require('../config/database');

const management = [ROLES.OWNER, ROLES.ADMIN, ROLES.MANAGER];
const finance = [...management, ROLES.ACCOUNTANT];
const sales = [...finance, ROLES.SALESMAN];
const staff = [...sales, ROLES.MECHANIC];
const jobEditors = [...management, ROLES.MECHANIC];

const definitions = Object.fromEntries([
    ['dashboard.view', 'Reports', 'View the dashboard', finance],
    ['inventory.view', 'Inventory', 'View stock, movements and reconciliation', staff],
    ['inventory.finance', 'Inventory', 'View inventory cost and valuation', finance],
    ['inventory.adjust', 'Inventory', 'Adjust stock quantities', management],
    ['catalogue.edit', 'Inventory', 'Create, edit and deactivate products, categories and brands', management],
    ['customers.view', 'Customers', 'View customers, motorcycles and transactions', staff],
    ['customers.edit', 'Customers', 'Create and edit customers and their motorcycles', staff],
    ['customers.remove', 'Customers', 'Deactivate and reactivate customers', management],
    ['suppliers.view', 'Suppliers', 'View suppliers and their balances', management],
    ['suppliers.edit', 'Suppliers', 'Create, edit and deactivate suppliers', management],
    ['purchases.view', 'Purchases', 'View purchase orders and returns', finance],
    ['purchases.create', 'Purchases', 'Create parts and motorcycle purchase orders', finance],
    ['purchases.manage', 'Purchases', 'Receive, cancel and return purchase stock', management],
    ['used_bikes.view', 'Used motorcycles', 'View used bikes, private seller records and margins', finance],
    ['used_bikes.manage', 'Used motorcycles', 'Acquire used bikes, record maintenance and publish listings', management],
    ['used_bikes.sell', 'Used motorcycles', 'Sell used bikes, issue receipts and record Qist payments', [...management, ROLES.SALESMAN]],
    ['sales.view', 'Sales', 'View sales, invoices and returns', sales],
    ['sales.create', 'Sales', 'Create point-of-sale transactions', sales],
    ['sales.discount', 'Sales', 'Apply point-of-sale discounts', management],
    ['sales.return', 'Sales', 'Record sales returns', management],
    ['orders.view', 'Online orders', 'View online orders', staff],
    ['orders.manage', 'Online orders', 'Confirm and fulfil online orders', management],
    ['workshop.view', 'Workshop', 'View services, mechanics and job cards', staff],
    ['workshop.manage', 'Workshop', 'Create jobs and maintain services and mechanics', management],
    ['workshop.jobs.edit', 'Workshop', 'Edit jobs and change their status', jobEditors],
    ['accounts.view', 'Accounts', 'View accounts, ledger, bank and expenses', finance],
    ['accounts.manage', 'Accounts', 'Manage accounts and banks, post journals and approve expenses', management],
    ['expenses.create', 'Accounts', 'Record expenses', finance],
    ['payments.view', 'Accounts', 'View payments and receipts', finance],
    ['payments.create', 'Accounts', 'Record payments and receipts', finance],
    ['reports.view', 'Reports', 'View sales, purchase, inventory and financial reports', finance],
    ['profit.view', 'Reports', 'View profit reports', finance],
    ['audit.view', 'Reports', 'View the audit trail', finance],
    ['settings.view', 'Settings', 'View business settings', management],
    ['settings.edit', 'Settings', 'Change business settings', management]
].map(([key, group, label, roles]) => [key, { group, label, roles }]));

function hasPermission(user, key, overrides = {}) {
    if (!staff.includes(user?.role) || !Object.hasOwn(definitions, key)) return false;
    if (user.role === ROLES.OWNER) return true;
    if (Object.hasOwn(overrides, key)) return overrides[key];
    return definitions[key].roles.includes(user.role);
}

async function loadOverrides(userId, connection) {
    const sql = 'SELECT permission_key, allowed FROM user_route_permissions WHERE user_id=?';
    const rows = connection ? (await connection.execute(sql, [userId]))[0] : await query(sql, [userId]);
    return Object.fromEntries(rows.map(row => [row.permission_key, Boolean(row.allowed)]));
}

function getOverrides(req) {
    if (!staff.includes(req.user?.role) || req.user.role === ROLES.OWNER) return Promise.resolve({});
    req.permissionOverrides ??= loadOverrides(req.user.id);
    return req.permissionOverrides;
}

function effectivePermissions(user, overrides) {
    return Object.keys(definitions).filter(key => hasPermission(user, key, overrides));
}

module.exports = { definitions, staff, hasPermission, loadOverrides, getOverrides, effectivePermissions };
