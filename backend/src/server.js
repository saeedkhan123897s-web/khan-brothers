// ============================================
// SERVER ENTRY POINT
// Khan Brothers Motorcycle Workshop ERP
// ============================================

require('dotenv').config();
const app = require('./app');
const { testConnection, pool } = require('./config/database');

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || 'localhost';

function validateProductionConfig() {
    if (process.env.NODE_ENV !== 'production') return;

    const problems = [];
    const jwtSecret = process.env.JWT_SECRET || '';
    if (jwtSecret.length < 32 || /your_super_secret|change_this|replace_with|replace_me/i.test(jwtSecret)) {
        problems.push('JWT_SECRET must be a private random value with at least 32 characters');
    }

    try {
        const frontend = new URL(process.env.FRONTEND_URL || '');
        if (frontend.protocol !== 'https:' || frontend.pathname !== '/' || frontend.search || frontend.hash) {
            problems.push('FRONTEND_URL must be an HTTPS origin without a path, query, or fragment');
        }
    } catch (_error) {
        problems.push('FRONTEND_URL must be configured as an HTTPS origin');
    }

    if (problems.length) {
        throw new Error(`Invalid production configuration: ${problems.join('; ')}`);
    }
}

async function startServer() {
    validateProductionConfig();

    // Test database connection
    const dbConnected = await testConnection();
    app.locals.databaseConnected = dbConnected;

    if (!dbConnected && process.env.NODE_ENV === 'production') {
        console.error('❌ Cannot start server without database connection');
        console.error('   Check that MySQL is running and DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, and DB_NAME are correct in .env');
        process.exit(1);
    }

    if (!dbConnected) {
        console.warn('⚠️  Starting in limited mode. Static pages and health checks are available; API requests require MySQL.');
        if (!process.env.JWT_SECRET) {
            console.warn('⚠️  JWT_SECRET is not configured; authentication will not work until it is set.');
        }
    } else if (!process.env.JWT_SECRET) {
        throw new Error('JWT_SECRET must be configured before enabling database-backed APIs.');
    }

    // Keep health state accurate and allow the local API to recover when MySQL
    // starts late or briefly disconnects.
    let previousDatabaseState = dbConnected;
    const databaseMonitor = setInterval(async () => {
        try {
            await pool.query('SELECT 1');
            app.locals.databaseConnected = true;
            if (!previousDatabaseState) console.log('✅ Database connection recovered; API is available.');
            previousDatabaseState = true;
        } catch (_error) {
            app.locals.databaseConnected = false;
            previousDatabaseState = false;
        }
    }, 10000);
    databaseMonitor.unref();

    // Start server
    app.listen(PORT, HOST, () => {
        console.log('');
        console.log('============================================');
        console.log('  KHAN BROTHERS MOTORCYCLE WORKSHOP ERP');
        console.log('============================================');
        console.log(`  🚀 Server running on port ${PORT}`);
        console.log(`  🌐 http://${HOST}:${PORT}`);
        console.log(`  📡 API: http://${HOST}:${PORT}/api`);
        console.log(`  🏥 Health: http://${HOST}:${PORT}/api/health`);
        console.log(`  🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
        console.log('============================================');
        console.log('');
    });
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error.message);
    process.exit(1);
});

process.on('unhandledRejection', (reason) => {
    console.error('❌ Unhandled Rejection:', reason);
    process.exit(1);
});

startServer();
