// ============================================
// DATABASE MIGRATION - Create All Tables
// Khan Brothers Motorcycle Workshop ERP
// ============================================

const { pool } = require('./database');
require('dotenv').config();

const migrations = require('../../../database/migrations/001-initial-schema');
const migrateRouteAccess = require('../../../database/migrations/002-route-access-and-motorcycles');
const migrateUsedBikes = require('../../../database/migrations/003-used-bike-resale');
const migrateBikeBusiness = require('../../../database/migrations/004-bike-business');
const migrateOilServiceAndInterest = require('../../../database/migrations/005-oil-service-and-qist-interest');

async function runMigrations() {
    console.log('🔄 Running database migrations...');
    console.log('');

    const connection = await pool.getConnection();

    try {
        for (let i = 0; i < migrations.length; i++) {
            const tableName = migrations[i].match(/CREATE TABLE IF NOT EXISTS (\w+)/)?.[1] || `migration_${i + 1}`;
            await connection.execute(migrations[i]);
            console.log(`  ✅ ${i + 1}/${migrations.length} - Table "${tableName}" created`);
        }

        console.log('');
        await migrateRouteAccess(connection);
        await migrateUsedBikes(connection);
        await migrateBikeBusiness(connection);
        await migrateOilServiceAndInterest(connection);
        console.log('✅ All migrations completed successfully!');

    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        throw error;
    } finally {
        connection.release();
        await pool.end();
    }
}

// Run if called directly
if (require.main === module) {
    runMigrations()
        .then(() => process.exit(0))
        .catch(() => process.exit(1));
}

module.exports = { runMigrations, migrations };
