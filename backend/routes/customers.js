'use strict';

const express = require('express');
const { run } = require('./shared');

module.exports = function customers(db) {
    const router = express.Router();
    router.get('/', run(async (_req, res) => res.json(await db.list('customers'))));
    return router;
};
