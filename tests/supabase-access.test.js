'use strict';

const assert = require('node:assert/strict');
const { createHmac, randomUUID } = require('node:crypto');
const { once } = require('node:events');
const { test } = require('node:test');
const bcrypt = require('bcryptjs');
const { createApp } = require('../backend/server');

function codeFor(base32) {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    const bits = [...base32].map(char=>alphabet.indexOf(char).toString(2).padStart(5,'0')).join('');
    const secret = Buffer.from(bits.match(/.{8}/g).map(byte=>parseInt(byte,2)));
    const time = Buffer.alloc(8);
    time.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));
    const hash = createHmac('sha1',secret).update(time).digest();
    return String((hash.readUInt32BE(hash.at(-1) & 15) & 0x7fffffff)%1000000).padStart(6,'0');
}

test('admin credential rotation, TOTP enrollment, and one-use recovery protect the admin session',async t=>{
    const password = 'fixture-admin-1234';
    const newPassword = 'new-fixture-admin-5678';
    let protectedAdmin;
    const staff = {id:1,username:'cashier',name:'Cashier',active:true,role:'Operator',version:randomUUID(),
        permissions:['qist'],password_hash:bcrypt.hashSync(password,4)};
    const db = {
        async list(table,filters) {
            if (table==='kb_users') return Object.values(filters).some(value=>['eq.1','eq.cashier'].includes(value)) ? [staff] : [];
            return protectedAdmin ? [protectedAdmin] : [];
        },
        async insert(table,row) {
            assert.equal(table,'kb_admin_auth');
            assert.equal(protectedAdmin,undefined);
            return protectedAdmin = {...row,last_counter:-1,recovery_hashes:[]};
        },
        async update(table,id,delta,filters) {
            assert.equal(table,'kb_admin_auth');
            assert.equal(id,0);
            assert.equal(filters.revision,'eq.'+protectedAdmin.revision);
            return protectedAdmin = {...protectedAdmin,...delta};
        },
        async page(table,{columns}) {
            assert.equal(table,'qist_payments');
            assert.deepEqual(columns,['id','qist_id','date','amount','account']);
            return [];
        }
    };
    const app = createApp({APP_PASSWORD_HASH:bcrypt.hashSync(password,4),
        APP_SESSION_SECRET:'fixture-session-secret-that-is-long-enough'},db);
    const server = app.listen(0,'127.0.0.1');
    await once(server,'listening');
    t.after(()=>{server.closeAllConnections();server.close();});
    const origin = 'http://127.0.0.1:'+server.address().port;
    async function request(path,{status=200,cookie,body}={}) {
        const response = await fetch(origin+'/api'+path,{method:body ? 'POST':'GET',
            headers:{...(cookie ? {Cookie:cookie} : {}),'Content-Type':'application/json'},body:body ? JSON.stringify(body) : undefined});
        const value = await response.json();
        assert.equal(response.status,status,path+': '+JSON.stringify(value));
        return {value,cookie:response.headers.get('set-cookie')?.split(';')[0]};
    }
    let {cookie} = await request('/login',{body:{username:'admin',password}});
    await request('/security/password',{cookie,body:{password,new_password:newPassword}});
    await request('/session',{cookie,status:401});
    await request('/login',{body:{username:'admin',password},status:401});
    ({cookie}=await request('/login',{body:{username:'admin',password:newPassword}}));
    const {value:setup} = await request('/security/mfa/start',{cookie,body:{password:newPassword}});
    const code = codeFor(setup.key);
    const {value:enabled} = await request('/security/mfa/enable',{cookie,
        body:{password:newPassword,token:setup.token,code}});
    assert.equal(enabled.recoveryCodes.length,6);
    assert.equal(protectedAdmin.mfa_secret.includes(setup.key),false);
    assert.equal(protectedAdmin.recovery_hashes.includes(enabled.recoveryCodes[0]),false);
    await request('/session',{cookie,status:401});
    await request('/login',{body:{username:'admin',password:newPassword,code},status:401});
    const recovery = {username:'admin',password:newPassword,code:enabled.recoveryCodes[0]};
    ({cookie}=await request('/login',{body:recovery}));
    await request('/security',{cookie});
    await request('/login',{body:recovery,status:401});
    const {cookie:staffCookie} = await request('/login',{body:{username:'cashier',password}});
    await request('/records/qist-payments',{cookie:staffCookie});
    await request('/records/activity-log',{cookie:staffCookie,status:403});
    await request('/finance/cashbook',{cookie:staffCookie,status:403});
    await request('/security',{cookie:staffCookie,status:403});
});
