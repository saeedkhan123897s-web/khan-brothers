// ============================================
// EXPRESS APP CONFIGURATION
// Khan Brothers Motorcycle Workshop ERP
// ============================================

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const path = require('path');

const routeModules = [
    ['/api/auth', './modules/auth/auth.routes'],
    ['/api/customers', './modules/customers/customer.routes'],
    ['/api/suppliers', './modules/suppliers/supplier.routes'],
    ['/api/products', './modules/products/product.routes'],
    ['/api/inventory', './modules/inventory/inventory.routes'],
    ['/api/sales', './modules/sales/sale.routes'],
    ['/api/purchases', './modules/purchases/purchase.routes'],
    ['/api/used-bikes', './modules/used-bikes/used-bike.routes'],
    ['/api/orders', './modules/orders/order.routes'],
    ['/api/payments', './modules/payments/payment.routes'],
    ['/api/workshop', './modules/workshop/workshop.routes'],
    ['/api/accounts', './modules/accounts/account.routes'],
    ['/api/profit', './modules/profit/profit.routes'],
    ['/api/audit', './modules/audit/audit.routes'],
    ['/api/reports', './modules/reports/report.routes'],
    ['/api/settings', './modules/settings/setting.routes'],
    ['/api/uploads', './modules/uploads/upload.routes']
];

// Import middleware
const { errorHandler, notFound } = require('./middleware/errorHandler');
const { limitApi, limitLogin } = require('./middleware/apiRateLimit');

// Create Express app
const app = express();
const allowedFrontendOrigin = process.env.NODE_ENV === 'production'
    ? (() => {
        try { return new URL(process.env.FRONTEND_URL || '').origin; }
        catch (_error) { return false; }
    })()
    : true;

// ============================================
// SECURITY MIDDLEWARE
// ============================================

app.use(helmet({
    contentSecurityPolicy: false
}));

app.use(cors({
    origin: allowedFrontendOrigin,
    credentials: true
}));

// ============================================
// GENERAL MIDDLEWARE
// ============================================

app.use(compression());
app.use(cookieParser());
app.use(morgan('dev'));

app.get('/api/health', (req, res) => {
    const databaseConnected = app.locals.databaseConnected;
    res.json({
        status: databaseConnected === false ? 'degraded' : 'ok',
        database: databaseConnected === false ? 'disconnected' : 'connected',
        name: 'Khan Brothers Motorcycle Workshop ERP',
        version: '1.0.0',
        timestamp: new Date().toISOString()
    });
});

app.post('/api/auth/login', limitLogin);
app.use('/api', limitApi);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve public site, admin pages, and shared assets from stable URL roots.
const frontendRoot = path.join(__dirname, '../../frontend');
const redirects = {
    '/admin/pages/inventory/product.html': '/admin/pages/inventory/products.html',
    '/admin/pages/workshop/mechanices.html': '/admin/pages/workshop/mechanics.html',
    '/admin/pages/accounts/genral-ledger.html': '/admin/pages/accounts/general-ledger.html',
    '/admin/pages/accounts/expenses.htm': '/admin/pages/accounts/expenses.html',
    '/admin/pages/accounts/expances.html': '/admin/pages/accounts/expenses.html',
    '/admin/pages/accounts/trail-balance.html': '/admin/pages/accounts/trial-balance.html',
    '/admin/pages/profit/sapare-part-profit.html': '/admin/pages/profit/spare-part-profit.html',
    '/admin/pages/purchases/parchase-return.html': '/admin/pages/purchases/purchase-returns.html',
    '/pages/prodect-details.html': '/pages/product-details.html',
    '/favicon.ico': '/assets/icons/image.png'
};

for (const name of ['product', 'products', 'add-product', 'categories', 'brands', 'stock', 'stock-audit', 'stock-adjustment']) {
    const filename = name === 'product' ? 'products' : name;
    redirects[`/pages/inventory/${name}.html`] = `/admin/pages/inventory/${filename}.html`;
}

app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    const normalized = req.path.replace(/\/{2,}/g, '/').replace(/^\/frontend\/(admin|assets)(?=\/)/, '/$1')
        .replace(/^\/frontend\/public(?=\/|$)/, '')
        .replace(/^\/assets\/css\/js\//, '/assets/js/');
    const target = redirects[normalized] || normalized || '/';
    if (target === req.path) return next();
    const queryStart = req.originalUrl.indexOf('?');
    res.redirect(308, target + (queryStart < 0 ? '' : req.originalUrl.slice(queryStart)));
});

app.use('/assets', express.static(path.join(frontendRoot, 'assets')));
app.use('/admin', express.static(path.join(frontendRoot, 'admin')));
app.use(express.static(path.join(frontendRoot, 'public')));

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, '../../uploads')));

// ============================================
// API ROUTES
// ============================================

// Keep the server usable for static pages in development when MySQL is not
// configured, while returning a clear response for database-backed APIs.
app.use('/api', (req, res, next) => {
    if (app.locals.databaseConnected === false) {
        return res.status(503).json({
            success: false,
            error: 'Database is unavailable. Configure MySQL in .env and restart the server.'
        });
    }
    next();
});

for (const [basePath, modulePath] of routeModules) {
    app.use(basePath, require(modulePath));
}

// ============================================
// ERROR HANDLING
// ============================================

app.use(notFound);
app.use(errorHandler);

module.exports = app;
