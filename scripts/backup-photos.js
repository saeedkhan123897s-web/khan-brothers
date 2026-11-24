'use strict';

const { createHash } = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { photoName } = require('../backend/routes/shared');

async function backupPhotos(root, { SUPABASE_URL, SUPABASE_KEY }, fetcher = fetch) {
    if (!root || !SUPABASE_URL || !SUPABASE_KEY) throw new Error('Set the backup folder, Supabase URL and service key.');
    const url = new URL(SUPABASE_URL);
    if (url.protocol !== 'https:' && url.hostname !== 'localhost') throw new Error('Supabase backup URL must use HTTPS.');
    const headers = { apikey: SUPABASE_KEY };
    if (!SUPABASE_KEY.startsWith('sb_secret_')) headers.Authorization = 'Bearer ' + SUPABASE_KEY;
    async function fetchObject(endpoint, body) {
        const response = await fetcher(new URL('/storage/v1/object/' + endpoint,url),{
            headers: body ? {...headers,'Content-Type':'application/json'} : headers,
            method: body ? 'POST' : 'GET',body: body ? JSON.stringify(body) : undefined,
            signal:AbortSignal.timeout(30000)
        });
        if (!response.ok) throw new Error('Photo backup request failed with HTTP '+response.status+'.');
        return response;
    }

    const folder = path.join(root,'kb-bike-photos');
    await fs.mkdir(folder,{recursive:true,mode:0o700});
    const files = [];
    const seen = new Set();
    const pageSize = 100;
    for (let offset = 0; ; offset += pageSize) {
        const response = await fetchObject('list/kb-bike-photos',{
            prefix:'',limit:pageSize,offset,sortBy:{column:'name',order:'asc'}
        });
        const page = await response.json();
        if (!Array.isArray(page)) throw new Error('Photo bucket list is invalid.');
        for (const {name} of page) {
            if (!photoName.test(name) || seen.has(name)) throw new Error('Photo bucket contents changed or include an unsupported path.');
            seen.add(name);
            const reply = await fetchObject('authenticated/kb-bike-photos/' + name);
            const data = Buffer.from(await reply.arrayBuffer());
            await fs.writeFile(path.join(folder,name),data,{mode:0o600,flag:'wx'});
            files.push({name,size:data.length,sha256:createHash('sha256').update(data).digest('hex')});
        }
        if (page.length < pageSize) break;
    }
    await fs.writeFile(path.join(root,'photo-manifest.json'),JSON.stringify({bucket:'kb-bike-photos',files},null,2)+'\n',
        {mode:0o600,flag:'wx'});
    console.log('Backed up '+files.length+' bike photos.');
}

if (require.main === module) {
    backupPhotos(process.argv[2],process.env).catch(error=>{
        console.error(error.message);
        process.exitCode = 1;
    });
}
module.exports = { backupPhotos };
