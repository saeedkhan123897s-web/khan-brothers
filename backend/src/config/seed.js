// ============================================
// DATABASE SEED - Initial Data
// Khan Brothers Motorcycle Workshop ERP
// ============================================

const { pool } = require('./database');
const bcrypt = require('bcryptjs');
const { categories, brands, services, accounts, settings } = require('../../../database/seeds/defaults');
require('dotenv').config();

async function seed() {
    console.log('🌱 Seeding database...');
    console.log('');

    try {
        // 1. Create the initial owner account. The published demo credentials
        // are allowed only outside production; production credentials must be
        // supplied explicitly through the environment.
        const production = process.env.NODE_ENV === 'production';
        const adminEmail = (process.env.SEED_ADMIN_EMAIL || (production ? '' : 'admin@khanbros.pk')).trim().toLowerCase();
        const adminPassword = process.env.SEED_ADMIN_PASSWORD || (production ? '' : 'admin123');
        const adminName = process.env.SEED_ADMIN_NAME || (production ? 'ERP Owner' : 'Admin Khan');
        if (!adminEmail || !adminPassword || (production && adminPassword.length < 16)) {
            throw new Error('Set SEED_ADMIN_EMAIL and a SEED_ADMIN_PASSWORD of at least 16 characters before seeding production.');
        }
        const hashedPassword = await bcrypt.hash(adminPassword, 12);
        await pool.execute(
            `INSERT IGNORE INTO users (name, email, phone, password, role)
             VALUES (?, ?, ?, ?, ?)`,
            [adminName, adminEmail, process.env.SEED_ADMIN_PHONE || null, hashedPassword, 'owner']
        );
        console.log(`  ✅ Initial owner account ensured (${adminEmail})`);

        // 2. Create default categories
        for (const [name, desc] of categories) {
            await pool.execute(
                'INSERT INTO categories (name, description) SELECT ?, ? FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name = ?)',
                [name, desc, name]
            );
        }
        console.log(`  ✅ ${categories.length} categories created`);

        // 3. Create default brands
        for (const name of brands) {
            await pool.execute(
                'INSERT INTO brands (name) SELECT ? FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM brands WHERE name = ?)',
                [name, name]
            );
        }
        console.log(`  ✅ ${brands.length} brands created`);

        // 4. Create workshop services
        for (const [name, desc, price] of services) {
            await pool.execute(
                'INSERT INTO workshop_services (name, description, base_price) SELECT ?, ?, ? FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM workshop_services WHERE name = ?)',
                [name, desc, price, name]
            );
        }
        console.log(`  ✅ ${services.length} workshop services created`);

        // 5. Create default chart of accounts
        for (const [code, name, type] of accounts) {
            await pool.execute(
                'INSERT IGNORE INTO accounts (account_code, name, account_type) VALUES (?, ?, ?)',
                [code, name, type]
            );
        }
        console.log(`  ✅ ${accounts.length} chart of accounts created`);

        // 6. Create default settings
        for (const [key, value, group] of settings) {
            await pool.execute(
                'INSERT IGNORE INTO settings (setting_key, setting_value, setting_group) VALUES (?, ?, ?)',
                [key, value, group]
            );
        }
        console.log(`  ✅ ${settings.length} default settings created`);

        console.log('');
        console.log('✅ Database seeding completed!');

    } catch (error) {
        console.error('❌ Seeding failed:', error.message);
        throw error;
    } finally {
        await pool.end();
    }
}

if (require.main === module) {
    seed()
        .then(() => process.exit(0))
        .catch(() => process.exit(1));
}

module.exports = { seed };
