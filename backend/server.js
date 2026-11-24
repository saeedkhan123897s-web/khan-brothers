'use strict';

require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const { rateLimit } = require('express-rate-limit');
const { createSupabase, problem } = require('./supabase');
const { date, id, run, today } = require('./routes/shared');
const { state, exportReport } = require('./reports');
const assets = require('./spa-assets');
const finance = require('./routes/finance');
const { recordRouter } = require('./routes/records');
const { adminSecurity } = require('./admin-security');
const securityRouter = require('./routes/security');
const { directory, settingsRouter } = require('./routes/business');
const { accountAccess, authorize, has, restrictedState } = require('./access');
const { commission, capital, dashboard } = require('./routes/operations');
const routes = {
    bikes: require('./routes/bikes'),
    sales: require('./routes/sales'),
    customers: require('./routes/customers'),
    qist: require('./routes/qist'),
    expenses: require('./routes/expenses'),
    workshop: require('./routes/workshop'),
    suppliers: db => directory(db, 'suppliers'),
    'spare-parts': db => directory(db, 'parts'),
    staff: db => directory(db, 'staff'),
    settings: settingsRouter,
    users: require('./routes/users'),
    commission
};

function createApp(settings = process.env, db = createSupabase(settings), app = express()) {
    const businessTimeZone = settings.BUSINESS_TIME_ZONE || 'Asia/Muscat';
    const cookieName = 'kb_business_session';
    const secure = settings.VERCEL === '1' || settings.NODE_ENV === 'production';
    const cookieOptions = { httpOnly: true, sameSite: 'strict', secure, path: '/' };
    const canSignIn = Boolean(settings.APP_PASSWORD_HASH && settings.APP_SESSION_SECRET?.length >= 32);
    const security = adminSecurity(db,settings);
    const accounts = accountAccess(db,settings,canSignIn,security);
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
        const {token,user} = await accounts.verify(req.body.username,req.body.password,req.body.code);
        res.cookie(cookieName, token, { ...cookieOptions, maxAge: 8 * 60 * 60 * 1000 }).json({ signedIn:true,user });
    }));
    app.post('/api/logout', (_req, res) => res.clearCookie(cookieName, cookieOptions).json({ signedIn: false }));
    app.use('/api', run(async (req,res,next) => {
        res.locals.user = await accounts.session(req.cookies[cookieName]);
        authorize(req,res.locals.user);
        if (db.withActor) db.withActor(res.locals.user,next);
        else next();
    }));
    app.get('/api/session',(_req,res)=>res.json(res.locals.user));
    app.get('/api/state', run(async (req, res) => {
        const user = res.locals.user;
        if (req.query.daily !== '1' || !['dashboard','daily'].some(key=>has(user,key))) {
            return res.json({...restrictedState(await state(db),user),user});
        }
        const [snapshot, daily] = await Promise.all([
            state(db), db.rpc('kb_daily_overview', { p_day:today(businessTimeZone), p_timezone:businessTimeZone })
        ]);
        res.json({ ...restrictedState({...snapshot,daily},user),user });
    }));
    app.post('/api/daily-report/close', run(async (req, res) => {
        const day = date(req.body.date, null);
        if (!day) throw problem(400, 'Enter a valid date.');
        if (day!==today(businessTimeZone) && !res.locals.user.admin) throw problem(403,'Only an admin can close an earlier day.');
        res.json(await db.rpc('kb_close_day', { p_day:day, p_timezone:businessTimeZone }));
    }));
    app.post('/api/daily-report/repurchase/:id', run(async (req, res) => {
        const { quantity } = req.body;
        if (!Number.isInteger(quantity) || quantity < 0 || quantity > 5) throw problem(400, 'Enter a valid quantity.');
        const part = await db.update('kb_spare_parts', id(req.params.id),
            { repurchase_checked_at:new Date().toISOString() }, { quantity:'eq.'+quantity });
        res.json({ id:part.id });
    }));
    app.get('/api/notifications', run(async (_req, res) => {
        const user=res.locals.user;
        const feed=await db.rpc('kb_notification_feed', { p_timezone:businessTimeZone });
        const activityGrant={sale:'sell','qist-payment':'qist',ready:'workshop'};
        res.json({...feed,activity:feed.activity.filter(row=>has(user,row.id.startsWith('part-sale:') ? 'parts' : activityGrant[row.kind])),
            reminders:has(user,'qist') ? feed.reminders : [], bikeStock:has(user,'stock') ? feed.bikeStock : null,
            lowParts:has(user,'parts') ? feed.lowParts : [],summary:has(user,'daily') ? feed.summary : null});
    }));
    app.get('/api/dashboard/charts',dashboard(db,businessTimeZone));
    app.use('/api/capital',capital(db,businessTimeZone));
    app.use('/api/finance',finance(db,businessTimeZone));
    app.use('/api/records',recordRouter(db));
    app.use('/api/security',securityRouter(security));
    app.get('/api/profit/entries', run(async (_req, res) => res.json(await db.rpc('kb_profit_entries', {}))));
    for (const [resource, router] of Object.entries(routes)) app.use('/api/' + resource, router(db));
    app.get('/api/export/:section', run(async (req, res) => {
        const file = await exportReport(db, req.params.section, req.query.format,businessTimeZone);
        res.attachment(file.filename).type(file.mime).send(file.content);
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
