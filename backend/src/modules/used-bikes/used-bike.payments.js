'use strict';

const { queryOne } = require('../../config/database');
const { makeDocumentNumber } = require('../../utils/apiHelpers');

const methods = {
    cash: 'Cash',
    bank_transfer: 'Bank transfer',
    jazzcash: 'JazzCash',
    easypaisa: 'EasyPaisa',
    card: 'Card',
    qist: 'Qist / Udhar'
};
const settingKey = 'used_bike_payment_methods';
const moneyMethods = Object.keys(methods).filter(key => key !== 'qist');

async function enabledMethods(connection) {
    const sql = 'SELECT setting_value FROM settings WHERE setting_key=?';
    const setting = connection ? (await connection.execute(sql, [settingKey]))[0][0] : await queryOne(sql, [settingKey]);
    if (!setting) return Object.keys(methods);
    try {
        const saved = JSON.parse(setting.setting_value);
        return Object.keys(methods).filter(key => Array.isArray(saved) && saved.includes(key));
    } catch {
        return [];
    }
}

const ledgerMethod = method => ['jazzcash', 'easypaisa'].includes(method) ? 'digital_wallet' : method;

async function recordSalePayment(connection, req, { saleId, customerId, amount, method, date, notes }) {
    const [payment] = await connection.execute(`
        INSERT INTO payments (payment_number,payment_type,reference_type,reference_id,customer_id,amount,payment_method,payment_date,notes,created_by)
        VALUES (?,'received','sale',?,?,?,?,?,?,?)`,
        [makeDocumentNumber('PAY'), saleId, customerId, amount, ledgerMethod(method), date, notes, req.user.id]);
    return payment.insertId;
}

function businessDay() {
    return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Muscat', dateStyle: 'short' }).format(new Date());
}

module.exports = { methods, settingKey, enabledMethods, moneyMethods, ledgerMethod, recordSalePayment, businessDay };
