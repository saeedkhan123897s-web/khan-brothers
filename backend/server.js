'use strict';

require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { rateLimit } = require('express-rate-limit');
const { createSupabase, problem } = require('./supabase');
const { run } = require('./routes/shared');
const { state, exportReport } = require('./reports');
const assets = require('./spa-assets');
const routes = {
    bikes: require('./routes/bikes'),
    sales: require('./routes/sales'),
    customers: require('./routes/customers'),
    qist: require('./routes/qist'),
    expenses: require('./routes/expenses')
};

function createApp(settings = process.env, db = createSupabase(settings), app = express()) {
    const cookieName = 'kb_business_session';
    const secure = settings.VERCEL === '1' || settings.NODE_ENV === 'production';
    const cookieOptions = { httpOnly: true, sameSite: 'strict', secure, path: '/' };
    const canSignIn = Boolean(settings.APP_PASSWORD_HASH && settings.APP_SESSION_SECRET?.length >= 32);
    app.disable('x-powered-by');
    if (settings.VERCEL === '1') app.set('trust proxy', 1);
    app.use(helmet({
        contentSecurityPolicy: { directives: { imgSrc: ["'self'", 'https:', 'data:'], upgradeInsecureRequests: null } },
        strictTransportSecurity: secure
    }));
    app.use(express.json({ limit: '32kb' }));
    app.use(cookieParser());
    app.use('/api', (_req, res, next) => {
        res.set('Cache-Control', 'no-store');
        next();
    });
    app.use('/api', (req, _res, next) => {
        if (['POST','PATCH','PUT','DELETE'].includes(req.method)) {
            const origin = req.get('Origin');
            if ((origin && origin !== (secure ? 'https://' : req.protocol + '://') + req.get('Host')) ||
                req.get('Sec-Fetch-Site') === 'cross-site') return next(problem(403, 'Request origin is not allowed.'));
        }
        next();
    });

    app.get('/api/health', (_req, res) => res.json({
        databaseConfigured: Boolean(settings.SUPABASE_URL && settings.SUPABASE_KEY), signInConfigured: canSignIn
    }));
    app.post('/api/login', rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, skipSuccessfulRequests: true,
        handler: (_req, res) => res.status(429).json({ error: 'Too many sign-in attempts. Try again later.' }) }),
    run(async (req, res) => {
        if (!canSignIn) throw problem(503, 'Configure the staff password hash and session secret.');
        if (typeof req.body.password !== 'string' || Buffer.byteLength(req.body.password) > 72 ||
            !await bcrypt.compare(req.body.password, settings.APP_PASSWORD_HASH)) throw problem(401, 'Invalid staff password.');
        const token = jwt.sign({ sub: 'kb-staff' }, settings.APP_SESSION_SECRET, { expiresIn: '8h', algorithm: 'HS256' });
        res.cookie(cookieName, token, { ...cookieOptions, maxAge: 8 * 60 * 60 * 1000 }).json({ signedIn: true });
    }));
    app.use('/api', (req, _res, next) => {
        try {
            if (!canSignIn || jwt.verify(req.cookies[cookieName], settings.APP_SESSION_SECRET, { algorithms: ['HS256'] }).sub !== 'kb-staff') {
                throw new Error();
            }
        } catch {
            return next(problem(401, 'Sign in to access Khan Brothers records.'));
        }
        next();
    });

    app.post('/api/logout', (_req, res) => res.clearCookie(cookieName, cookieOptions).json({ signedIn: false }));
    app.get('/api/state', run(async (_req, res) => res.json(await state(db))));
    for (const [resource, router] of Object.entries(routes)) app.use('/api/' + resource, router(db));
    app.get('/api/export/:section', run(async (req, res) => {
        const file = await exportReport(db, req.params.section, req.query.format);
        res.attachment('khan-brothers-' + req.params.section + '.' + file.extension).type(file.mime).send(file.content);
    }));
    app.use('/api', (_req, _res, next) => next(problem(404, 'Endpoint not found.')));

    for (const [url, source] of Object.entries(assets)) {
        app.get(url === 'index.html' ? ['/', '/index.html'] : '/' + url,
            (_req, res) => res.sendFile(source));
    }
    app.use((error, _req, res, _next) => {
        if (error.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'Photos must be at most 2 MB.' });
        const status = error.status >= 400 && error.status < 600 ? error.status : error.name === 'MulterError' ? 400 : 500;
        res.status(status).json({ error: status === 500 ? 'The request could not be completed.' : error.message });
    });
    return app;
}

if (require.main === module) {
    const port = process.env.PORT || 3100;
    createApp().listen(port, process.env.HOST || 'localhost', () => console.log('Khan Brothers at http://localhost:' + port));
}

module.exports = { createApp };
