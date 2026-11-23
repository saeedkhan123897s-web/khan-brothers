'use strict';

const assert = require('node:assert/strict');
const { once } = require('node:events');
const test = require('node:test');
const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const { limitApi, limitLogin } = require('../backend/src/middleware/apiRateLimit');

test('staff browsing, staff writes, and login have separate request limits', async t => {
    const secret = 'private-test-key-for-local-rate-limit-test';
    const previousSecret = process.env.JWT_SECRET;
    process.env.JWT_SECRET = secret;
    t.after(() => {
        if (previousSecret === undefined) delete process.env.JWT_SECRET;
        else process.env.JWT_SECRET = previousSecret;
    });

    const app = express();
    app.use(cookieParser());
    app.post('/api/auth/login', limitLogin);
    app.use('/api', limitApi);
    app.all('/api/*', (_req, res) => res.sendStatus(204));
    const server = app.listen(0, '127.0.0.1');
    t.after(() => new Promise(resolve => server.close(resolve)));
    await once(server, 'listening');
    const base = 'http://127.0.0.1:' + server.address().port;
    const token = (id, role) => jwt.sign({ id, role }, secret, { expiresIn: '5m' });
    const staffCookie = { Cookie: 'token=' + token(1, 'owner') };

    async function call(route, status, options) {
        const response = await fetch(base + route, options);
        await response.arrayBuffer();
        assert.equal(response.status, status, route);
        return response.headers;
    }

    for (let i = 0; i < 100; i++) await call('/api/products', 204);
    assert.ok((await call('/api/products', 429)).get('Retry-After'));
    await call('/api/products', 429, { headers: { Authorization: 'Bearer expired-or-invalid' } });
    await call('/api/products', 429, { headers: { Authorization: 'Bearer ' + token(3, 'customer') } });

    for (let i = 0; i < 105; i++) await call('/api/inventory/stock', 204, { headers: staffCookie });
    const profile = await call('/api/auth/me', 204, { headers: staffCookie });
    assert.equal(profile.get('X-RateLimit-Remaining'), '1094');

    const anotherStaffMember = await call('/api/auth/me', 204, { headers: { Authorization: 'Bearer ' + token(2, 'manager') } });
    assert.equal(anotherStaffMember.get('X-RateLimit-Remaining'), '1199');

    const write = await call('/api/inventory/adjust', 204, { method: 'POST', headers: staffCookie });
    assert.equal(write.get('X-RateLimit-Limit'), '100');
    assert.equal(write.get('X-RateLimit-Remaining'), '99');

    for (let i = 0; i < 20; i++) await call('/api/auth/login', 204, { method: 'POST' });
    await call('/api/auth/login', 429, { method: 'POST' });
    await call('/api/auth/me', 204, { headers: staffCookie });
});
