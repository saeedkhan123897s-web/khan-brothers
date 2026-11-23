'use strict';

const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'public');

fs.mkdirSync(output, { recursive: true });
for (const [file, source] of Object.entries(require('../backend/spa-assets'))) {
    fs.copyFileSync(source, path.join(output, file));
}
