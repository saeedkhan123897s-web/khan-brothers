'use strict';

function problem(status, message) {
    return Object.assign(new Error(message), { status });
}

function createSupabase(settings, fetcher = fetch) {
    const { SUPABASE_URL: url, SUPABASE_KEY: key } = settings;
    async function call(path, { method = 'GET', body, headers, binary = false } = {}) {
        if (!url || !key) throw problem(503, 'Configure SUPABASE_URL and SUPABASE_KEY to connect the database.');
        const response = await fetcher(url.replace(/\/$/, '') + path, {
            method,
            headers: { apikey: key, ...(!key.startsWith('sb_secret_') ? { Authorization: 'Bearer ' + key } : {}),
                ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers },
            body: body === undefined || Buffer.isBuffer(body) ? body : JSON.stringify(body),
            signal: AbortSignal.timeout(12000)
        }).catch(() => { throw problem(502, 'Supabase is unavailable. Try again.'); });
        if (response.ok) {
            if (binary) return { data: Buffer.from(await response.arrayBuffer()), type: response.headers.get('content-type') };
            return response.status === 204 ? null : response.json();
        }
        const payload = await response.json().catch(() => ({}));
        if (payload.code === '23505') throw problem(409, payload.message === 'This bike is already sold.'
            ? payload.message : 'A record with these details already exists.');
        if (payload.code === 'P0002') throw problem(404, payload.message);
        if (payload.code === '22023') throw problem(400, payload.message);
        throw problem(502, 'Supabase could not process the request. Check the database configuration and schema.');
    }
    const rest = (target, options) => call('/rest/v1/' + target, options);
    async function list(table) {
        const rows = [];
        const size = 500;
        for (;;) {
            const page = await rest(table + '?' + new URLSearchParams({ select: '*', order: 'id.asc', limit: size, offset: rows.length }));
            if (!Array.isArray(page)) throw problem(502, 'The database returned an unexpected response.');
            rows.push(...page);
            if (page.length < size) return rows;
        }
    }
    async function insert(table, data) {
        const rows = await rest(table + '?on_conflict=request_key', {
            method: 'POST', body: data, headers: { Prefer: 'resolution=ignore-duplicates,return=representation' }
        });
        if (rows[0]) return rows[0];
        const existing = await rest(table + '?' + new URLSearchParams({ request_key: 'eq.' + data.request_key }));
        return existing[0];
    }
    const bucket = '/storage/v1/object';
    return {
        list, insert,
        rpc: (name, body) => rest('rpc/' + name, { method: 'POST', body }),
        upload: (name, data, type) => call(bucket + '/kb-bike-photos/' + name,
            { method: 'POST', body: data, headers: { 'Content-Type': type } }),
        photo: name => call(bucket + '/authenticated/kb-bike-photos/' + name, { binary: true })
    };
}

module.exports = { createSupabase, problem };
