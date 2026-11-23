const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { authenticate } = require('../../middleware/auth');
const { requirePermission } = require('../../middleware/permissions');

const router = express.Router();
const uploadDir = path.resolve(__dirname, '../../../../uploads');
fs.mkdirSync(uploadDir, { recursive: true });

const imageExtensions = new Map([
    ['image/jpeg', '.jpg'], ['image/png', '.png'], ['image/webp', '.webp'], ['image/gif', '.gif']
]);
const storage = multer.diskStorage({
    destination: (_req, _file, callback) => callback(null, uploadDir),
    filename: (_req, file, callback) => {
        const extension = imageExtensions.get(file.mimetype);
        callback(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${extension}`);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024, files: 1 },
    fileFilter: (_req, file, callback) => {
        if (!imageExtensions.has(file.mimetype)) return callback(new Error('Only JPEG, PNG, WEBP, and GIF images are supported'));
        callback(null, true);
    }
});

router.post('/images', authenticate, requirePermission('catalogue.edit', 'used_bikes.manage'), (req, res, next) => {
    upload.single('image')(req, res, error => {
        if (error) {
            error.statusCode = error.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
            return next(error);
        }
        next();
    });
}, (req, res) => {
    if (!req.file) return res.status(400).json({ success: false, error: 'Select an image file using the "image" field' });
    res.status(201).json({ success: true, data: { filename: req.file.filename, url: `/uploads/${req.file.filename}`, size: req.file.size, mime_type: req.file.mimetype } });
});

module.exports = router;
