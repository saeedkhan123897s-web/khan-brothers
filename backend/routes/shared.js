'use strict';

const { randomUUID } = require('node:crypto');
const { problem } = require('../supabase');

const methods = ['cash','bank','jazzcash','easypaisa','card','qist'];
const expenseTypes = ['Kiraya','Chai','Petrol','Mechanic','Other'];
const photoName = /^[0-9a-f-]{36}\.(?:jpg|png|webp)$/;
const today = (zone = process.env.BUSINESS_TIME_ZONE || 'Asia/Muscat') =>
    new Intl.DateTimeFormat('sv-SE', { timeZone: zone, dateStyle: 'short' }).format(new Date());

function text(value, label, max, required = false) {
    if (value == null || value === '') {
        if (required) throw problem(400, label + ' is required.');
        return null;
    }
    if (typeof value !== 'string' || !value.trim() || value.trim().length > max) {
        throw problem(400, label + ' must have up to ' + max + ' characters.');
    }
    return value.trim();
}
function money(value, label, { min = 0, max = 9999999999.99 } = {}) {
    if (!['string', 'number'].includes(typeof value) || !/^\d+(?:\.\d{1,2})?$/.test(String(value)) ||
        Number(value) < min || Number(value) > max) throw problem(400, label + ' is invalid.');
    return Number(value);
}
function date(value, fallback) {
    if (!value) return fallback;
    const parsed = new Date(value);
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Number(parsed)) ||
        parsed.toISOString().slice(0, 10) !== value) throw problem(400, 'Enter a valid date.');
    return value;
}
function id(value) {
    if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < 1) throw problem(400, 'Invalid record ID.');
    return Number(value);
}
function requestKey(value) {
    if (!value) return randomUUID();
    if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value)) throw problem(400, 'Invalid request key.');
    return value;
}
const run = handler => (req, res, next) => Promise.resolve().then(() => handler(req, res)).catch(next);

module.exports = { methods, expenseTypes, photoName, today, text, money, date, id, requestKey, run };
