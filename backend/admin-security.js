'use strict';

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } = require('node:crypto');
const { problem } = require('./supabase');

const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const authenticatorKey = secret => {
    let bits = 0;
    let value = 0;
    let encoded = '';
    for (const byte of secret) {
        value = (value << 8) | byte;
        bits += 8;
        while (bits >= 5) {
            bits -= 5;
            encoded += alphabet[(value >>> bits) & 31];
        }
    }
    return encoded;
};
const suppliedCode = code => typeof code === 'string' && /^\d{6}$/.test(code);
const codeHash = code => createHash('sha256').update(code).digest('hex');

function counterFor(secret, code, last = -1) {
    if (!suppliedCode(code)) return null;
    const counter = Math.floor(Date.now()/30000);
    for (const step of [counter,counter-1,counter+1]) {
        if (step <= last) continue;
        const input = Buffer.alloc(8);
        input.writeBigUInt64BE(BigInt(step));
        const digest = createHmac('sha1',secret).update(input).digest();
        const offset = digest[digest.length-1] & 15;
        const expected = String((digest.readUInt32BE(offset) & 0x7fffffff)%1000000).padStart(6,'0');
        if (timingSafeEqual(Buffer.from(code),Buffer.from(expected))) return step;
    }
    return null;
}

function adminSecurity(db,settings) {
    function encryptionKey() {
        return createHmac('sha256',settings.APP_MFA_ENCRYPTION_KEY || settings.APP_SESSION_SECRET)
            .update('Khan Brothers admin TOTP').digest();
    }
    function encrypt(secret,id) {
        const iv = randomBytes(12);
        const cipher = createCipheriv('aes-256-gcm',encryptionKey(),iv);
        cipher.setAAD(Buffer.from(String(id)));
        return Buffer.concat([iv,cipher.update(secret),cipher.final(),cipher.getAuthTag()]).toString('base64url');
    }
    function decrypt(serialized,id) {
        const buffer = Buffer.from(serialized,'base64url');
        const cipher = createDecipheriv('aes-256-gcm',encryptionKey(),buffer.subarray(0,12));
        cipher.setAAD(Buffer.from(String(id)));
        cipher.setAuthTag(buffer.subarray(-16));
        return Buffer.concat([cipher.update(buffer.subarray(12,-16)),cipher.final()]);
    }
    async function get(id) {
        return (await db.list('kb_admin_auth',{id:'eq.'+id}))[0];
    }
    async function write(id,row,changes) {
        if (row) return db.update('kb_admin_auth',id,changes,{revision:'eq.'+row.revision});
        return db.insert('kb_admin_auth',{id,request_key:randomUUID(),...changes});
    }
    async function verifyCode(row,code) {
        const counter = suppliedCode(code) ? counterFor(decrypt(row.mfa_secret,row.id),code,Number(row.last_counter)) : null;
        const recovery = typeof code === 'string' && /^[a-f0-9]{24}$/i.test(code) ? codeHash(code.toLowerCase()) : null;
        const previous = row.recovery_hashes || [];
        if (counter === null && (!recovery || !previous.includes(recovery))) return false;
        const changes = counter !== null ? {last_counter:counter} : {recovery_hashes:previous.filter(hash=>hash!==recovery)};
        await write(row.id,row,{...changes,revision:randomUUID()});
        return true;
    }
    function begin(id) {
        const secret = randomBytes(20);
        return { key:authenticatorKey(secret), token:jwt.sign({purpose:'enrol-admin-totp',id,secret:encrypt(secret,id)},
            settings.APP_SESSION_SECRET,{algorithm:'HS256',expiresIn:'10m'}) };
    }
    async function enable(id,row,token,code) {
        let claims;
        try {
            claims = jwt.verify(token,settings.APP_SESSION_SECRET,{algorithms:['HS256']});
        } catch { throw problem(400,'Start a new authenticator setup.'); }
        if (claims.purpose !== 'enrol-admin-totp' || claims.id !== id || row?.mfa_secret) throw problem(400,'Start a new authenticator setup.');
        const counter = counterFor(decrypt(claims.secret,id),code);
        if (counter === null) throw problem(400,'Enter the current authenticator code.');
        const recoveryCodes = Array.from({length:6},()=>randomBytes(12).toString('hex'));
        await write(id,row,{ mfa_secret:claims.secret,last_counter:counter,recovery_hashes:recoveryCodes.map(codeHash),
            version:randomUUID(),revision:randomUUID() });
        return recoveryCodes;
    }
    async function disable(row) {
        await write(row.id,row,{mfa_secret:null,recovery_hashes:[],last_counter:-1,version:randomUUID(),revision:randomUUID()});
    }
    async function passwordMatches(user,row,password) {
        if (typeof password !== 'string' || Buffer.byteLength(password)>72) return false;
        const hash = user.id === 0 ? row?.password_hash || settings.APP_PASSWORD_HASH
            : (await db.list('kb_users',{id:'eq.'+user.id}))[0]?.password_hash;
        return Boolean(hash && await bcrypt.compare(password,hash));
    }
    async function rotate(user,row,password,newPassword) {
        if (!await passwordMatches(user,row,password)) throw problem(400,'The current password is incorrect.');
        if (typeof newPassword !== 'string' || newPassword.length<12 || Buffer.byteLength(newPassword)>72 || newPassword===password) {
            throw problem(400,'Choose a new password with at least 12 characters and at most 72 bytes.');
        }
        const password_hash = await bcrypt.hash(newPassword,12);
        if (user.id === 0) await write(0,row,{password_hash,version:randomUUID(),revision:randomUUID()});
        else await db.update('kb_users',user.id,{password_hash,version:randomUUID()});
    }
    return {get,verifyCode,begin,enable,disable,passwordMatches,rotate};
}

module.exports = { adminSecurity };
