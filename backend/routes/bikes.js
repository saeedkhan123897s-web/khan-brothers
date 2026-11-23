'use strict';

const express = require('express');
const multer = require('multer');
const { randomUUID } = require('node:crypto');
const { problem } = require('../supabase');
const { methods, photoName, today, text, money, date, requestKey, run } = require('./shared');

module.exports = function bikes(db) {
    const router = express.Router();
    const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024, files: 1, parts: 2 } });
    router.get('/', run(async (_req, res) => res.json(await db.list('bikes'))));
    router.post('/photos', upload.single('photo'), run(async (req, res) => {
        const data = req.file?.buffer;
        const isPng = data?.subarray(0, 8).toString('hex') === '89504e470d0a1a0a';
        const isJpg = data?.subarray(0, 3).toString('hex') === 'ffd8ff';
        const isWebp = data?.toString('ascii', 0, 4) === 'RIFF' && data?.toString('ascii', 8, 12) === 'WEBP';
        if (!isPng && !isJpg && !isWebp) throw problem(400, 'Choose a JPG, PNG or WebP photo.');
        const type = isPng ? 'png' : isJpg ? 'jpg' : 'webp';
        const name = randomUUID() + '.' + type;
        await db.upload(name, data, 'image/' + (isJpg ? 'jpeg' : type));
        res.status(201).json({ photo_url: '/api/bikes/photos/' + name });
    }));
    router.get('/photos/:name', run(async (req, res) => {
        if (!photoName.test(req.params.name)) throw problem(404, 'Photo not found.');
        const photo = await db.photo(req.params.name);
        res.type(req.params.name.endsWith('.jpg') ? 'image/jpeg' :
            req.params.name.endsWith('.png') ? 'image/png' : 'image/webp').send(photo.data);
    }));
    router.post('/', run(async (req, res) => {
        const data = req.body;
        const photo = text(data.photo_url, 'Photo URL', 2048);
        if (photo && !/^https:\/\/[^\s]+$/i.test(photo) &&
            !(photo.startsWith('/api/bikes/photos/') && photoName.test(photo.slice('/api/bikes/photos/'.length)))) {
            throw problem(400, 'Use a valid HTTPS photo URL or upload a photo.');
        }
        const price = data.sell_price === '' || data.sell_price == null ? null : money(data.sell_price, 'Expected sell price', { min: .01 });
        const chassis = text(data.chassis_no, 'Chassis number', 80);
        if (chassis && !/[a-z0-9]/i.test(chassis)) throw problem(400, 'Chassis number requires letters or digits.');
        const purchaseMethod = data.purchase_method || 'cash';
        if (!methods.slice(0, -1).includes(purchaseMethod)) throw problem(400, 'Select a valid purchase payment method.');
        res.status(201).json(await db.insert('bikes', {
            bike_name: text(data.bike_name, 'Bike name', 150, true), model: text(data.model, 'Model', 100, true),
            photo_url: photo, chassis_no: chassis, plate_no: text(data.plate_no, 'Plate number', 40),
            condition_engine: text(data.condition_engine, 'Engine condition', 120),
            condition_tyre: text(data.condition_tyre, 'Tyre condition', 120),
            condition_body: text(data.condition_body, 'Body condition', 120),
            purchase_price: money(data.purchase_price, 'Purchase price'), repair_cost: money(data.repair_cost || 0, 'Repair cost'),
            other_cost: money(data.other_cost || 0, 'Other cost'), sell_price: price,
            purchase_method: purchaseMethod, purchased_on: date(data.purchased_on, today()), request_key: requestKey(data.request_key)
        }));
    }));
    return router;
};
