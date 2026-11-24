'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const { randomUUID } = require('node:crypto');
const { problem } = require('../supabase');
const { denied, has, isAdmin, permissions, root, userView } = require('../access');
const { id, requestKey, run, text } = require('./shared');

function username(value) {
    const normalized = text(value,'Username',40,true).toLowerCase();
    if (!/^[a-z0-9_.-]{3,40}$/.test(normalized) || normalized === 'admin') throw problem(400,'Choose a different username.');
    return normalized;
}

async function password(value,required) {
    if (!value && !required) return {};
    if (typeof value !== 'string' || value.length < 8 || Buffer.byteLength(value) > 72) {
        throw problem(400,'Use a password with at least 8 characters and at most 72 bytes.');
    }
    return { password_hash:await bcrypt.hash(value,12) };
}

function fields(input) {
    return {
        name:text(input.name,'Name',100,true),phone:text(input.phone,'Phone',24),
        username:username(input.username),role:text(input.role,'Role',40,true)
    };
}

module.exports = function users(db) {
    const router = express.Router();
    async function find(id) {
        const row = (await db.list('kb_users',{id:'eq.'+id}))[0];
        if (!row || row.deleted_at) throw problem(404,'User not found.');
        return row;
    }
    router.get('/',run(async (_req,res) => {
        if (res.locals.user.admin) return res.json([root,...(await db.list('kb_users',{deleted_at:'is.null'})).map(userView)]);
        if (!has(res.locals.user,'delete')) return res.json([]);
        const users = (await db.list('kb_users',{deleted_at:'is.null'})).filter(row=>!isAdmin(row.role));
        res.json(users.map(row=>({...userView(row),permissions:[]})));
    }));
    router.post('/',run(async (req,res) => {
        const input = fields(req.body);
        if (isAdmin(input.role) && !res.locals.user.admin) throw denied();
        const account = await db.insert('kb_users',{...input,...await password(req.body.password,true),request_key:requestKey(req.body.request_key)});
        res.status(201).json(userView(account));
    }));
    router.patch('/:id',run(async (req,res) => {
        const actor = res.locals.user;
        if (!actor.admin) throw denied();
        const account = await find(id(req.params.id));
        const input = fields(req.body);
        const active = req.body.active;
        if (typeof active !== 'boolean') throw problem(400,'Choose an account status.');
        if (String(actor.id) === String(account.id) && (!active || !isAdmin(input.role))) throw denied();
        res.json(userView(await db.update('kb_users',account.id,{...input,...await password(req.body.password,false),
            active,version:randomUUID()})));
    }));
    router.put('/:id/permissions',run(async (req,res) => {
        if (!res.locals.user.admin) throw denied();
        const account = await find(id(req.params.id));
        if (isAdmin(account.role)) throw denied();
        const keys = req.body.permissions;
        if (!Array.isArray(keys) || keys.some(key=>key==='capital' || !permissions.includes(key))) throw problem(400,'Choose valid permissions.');
        res.json(userView(await db.update('kb_users',account.id,{permissions:[...new Set(keys)]})));
    }));
    router.delete('/:id',run(async (req,res) => {
        const actor = res.locals.user;
        const account = await find(id(req.params.id));
        if (!has(actor,'delete') || (!actor.admin && isAdmin(account.role)) || String(actor.id) === String(account.id)) throw denied();
        await db.update('kb_users',account.id,{active:false,deleted_at:new Date().toISOString(),version:randomUUID()});
        res.status(204).end();
    }));
    return router;
};
