'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const frontend = path.join(root, 'frontend');
const spaAssets = require('../backend/spa-assets');

function files(directory) {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
        const filename = path.join(directory, entry.name);
        return entry.isDirectory() ? files(filename) : [filename];
    });
}

const htmlFiles = files(frontend).filter(filename => filename.endsWith('.html'));

function frontendPath(urlPath) {
    const location = urlPath.replace(/^\/+/, '');
    if (/^(?:admin|assets)\//.test(location)) return path.join(frontend, location);
    return path.join(frontend, 'public', location || 'index.html');
}

test('project source and documentation contain no empty files', () => {
    for (const directory of ['backend', 'database', 'docs', 'frontend']) {
        for (const filename of files(path.join(root, directory))) {
            assert.ok(fs.statSync(filename).size > 0, path.relative(root, filename));
        }
    }
});

test('local links and script and stylesheet paths resolve from the Express URL roots', () => {
    for (const filename of htmlFiles) {
        const route = '/' + path.relative(frontend, filename).split(path.sep).join('/').replace(/^public\//, '');
        const markup = fs.readFileSync(filename, 'utf8');
        for (const [, target] of markup.matchAll(/\b(?:href|src)="([^"]+)"/g)) {
            if (target.startsWith('#')) continue;
            const url = new URL(target, 'http://localhost' + route);
            if (url.origin !== 'http://localhost') continue;
            const urlPath = decodeURIComponent(url.pathname);
            const destination = filename === path.join(frontend, 'index.html') && Object.hasOwn(spaAssets, urlPath.slice(1))
                ? path.join(root, spaAssets[urlPath.slice(1)]) : frontendPath(urlPath);
            assert.ok(fs.existsSync(destination), `${route} links to ${target}`);
        }
    }
});

test('browser scripts and inline scripts parse', () => {
    for (const filename of [path.join(frontend, 'app.js'), ...files(path.join(frontend, 'assets', 'js'))]) {
        if (filename.endsWith('.js')) new vm.Script(fs.readFileSync(filename, 'utf8'), { filename });
    }
    for (const filename of htmlFiles) {
        const markup = fs.readFileSync(filename, 'utf8');
        for (const [, script] of markup.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
            if (script.trim()) new vm.Script(script, { filename });
        }
    }
});

test('admin page templates register a matching configuration', () => {
    const variants = htmlFiles.filter(filename => filename.startsWith(path.join(frontend, 'admin', 'pages') + path.sep));
    let count = 0;
    for (const filename of variants) {
        const markup = fs.readFileSync(filename, 'utf8');
        const key = markup.match(/data-erp-page="([^"]+)"/)?.[1];
        if (!key) continue;
        count += 1;
        const context = vm.createContext({
            window: {},
            document: { addEventListener() {}, querySelector() { return null; } },
            location: { search: '', pathname: '/' + path.relative(frontend, filename) },
            URLSearchParams
        });
        for (const [, source] of markup.matchAll(/<script src="([^"]+)"/g)) {
            const script = frontendPath(source);
            vm.runInContext(fs.readFileSync(script, 'utf8'), context, { filename: script });
            Object.assign(context, context.window);
        }
        assert.ok(context.Admin.pages[key], key);
    }
    assert.ok(count > 30, 'Expected the shared app to initialize the ERP modules');
});

test('Express loads all API modules with the initial schema and seed sources', () => {
    const app = require('../backend/src/app');
    const mounted = app._router.stack.filter(layer => layer.handle.stack).length;
    assert.equal(mounted >= 16, true);
    const { migrations } = require('../backend/src/config/migrate');
    const { categories, brands, services, accounts, settings } = require('../database/seeds/defaults');
    assert.equal(migrations.length, 30);
    assert.ok([categories, brands, services, accounts, settings].every(items => items.length));
});
