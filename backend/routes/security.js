'use strict';

const express = require('express');
const { rateLimit } = require('express-rate-limit');
const { problem } = require('../supabase');
const { run } = require('./shared');

module.exports = function securityRouter(security) {
    const router = express.Router();
    router.get('/',run(async (_req,res) => {
        const row = await security.get(res.locals.user.id);
        res.json({ enabled:Boolean(row?.mfa_secret) });
    }));
    router.use(rateLimit({windowMs:15*60*1000,limit:10,skipSuccessfulRequests:true,
        handler:(_req,res)=>res.status(429).json({error:'Too many security attempts. Try again later.'})}));
    router.post('/password',run(async (req,res) => {
        const user = res.locals.user;
        const row = await security.get(user.id);
        if (!await security.passwordMatches(user,row,req.body.password)) throw problem(400,'The current password is incorrect.');
        if (row?.mfa_secret && !await security.verifyCode(row,req.body.code)) throw problem(400,'Enter a fresh authenticator code.');
        await security.rotate(user,await security.get(user.id),req.body.password,req.body.new_password);
        res.json({ changed:true });
    }));
    router.post('/mfa/start',run(async (req,res) => {
        const user = res.locals.user;
        const row = await security.get(user.id);
        if (row?.mfa_secret) throw problem(409,'Two-step verification is already enabled.');
        if (!await security.passwordMatches(user,row,req.body.password)) throw problem(400,'The current password is incorrect.');
        res.json(security.begin(user.id));
    }));
    router.post('/mfa/enable',run(async (req,res) => {
        const user = res.locals.user;
        const row = await security.get(user.id);
        if (!await security.passwordMatches(user,row,req.body.password)) throw problem(400,'The current password is incorrect.');
        res.json({ recoveryCodes:await security.enable(user.id,row,req.body.token,req.body.code) });
    }));
    router.post('/mfa/disable',run(async (req,res) => {
        const user = res.locals.user;
        const row = await security.get(user.id);
        if (!row?.mfa_secret) throw problem(400,'Two-step verification is already disabled.');
        if (!await security.passwordMatches(user,row,req.body.password)) throw problem(400,'The current password is incorrect.');
        if (!await security.verifyCode(row,req.body.code)) throw problem(400,'Enter a fresh authenticator code or recovery code.');
        await security.disable(await security.get(user.id));
        res.json({ enabled:false });
    }));
    return router;
};
