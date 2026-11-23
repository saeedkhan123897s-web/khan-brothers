'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { effectivePermissions, hasPermission } = require('../backend/src/utils/routePermissions');
const { requirePermission } = require('../backend/src/middleware/permissions');

test('route permission overrides take precedence for staff and preserve account boundaries', () => {
    const mechanic = { role: 'mechanic' };
    const overrides = { 'inventory.view': false, 'purchases.view': true };
    assert.equal(hasPermission(mechanic, 'inventory.view'), true);
    assert.equal(hasPermission(mechanic, 'purchases.view'), false);
    assert.equal(hasPermission(mechanic, 'inventory.view', overrides), false);
    assert.equal(hasPermission(mechanic, 'purchases.view', overrides), true);
    assert.equal(hasPermission({ role: 'owner' }, 'inventory.view', overrides), true);
    assert.equal(hasPermission({ role: 'customer' }, 'purchases.view', overrides), false);
    assert.equal(hasPermission({ role: 'owner' }, 'unknown', overrides), false);
    assert.ok(!effectivePermissions(mechanic, overrides).includes('inventory.view'));
});

test('protected routes return authorization errors and fail closed if override loading fails', async () => {
    const guard = requirePermission('purchases.view');
    const staff = { user: { role: 'salesman' }, permissionOverrides: { 'purchases.view': true } };
    const response = { status(value) { this.statusCode = value; return this; }, json() {} };
    let entered = 0;
    await guard(staff, response, () => { entered++; });
    assert.equal(entered, 1);
    await guard({ user: staff.user, permissionOverrides: {} }, response, () => { entered++; });
    assert.equal(response.statusCode, 403);
    await guard({}, response, () => { entered++; });
    assert.equal(response.statusCode, 401);
    const error = new Error('permission storage unavailable');
    await guard({ user: staff.user, permissionOverrides: Promise.reject(error) }, response, failure => {
        assert.equal(failure, error);
    });
    assert.equal(entered, 1);
});
