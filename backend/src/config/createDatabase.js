require('dotenv').config();
const mysql = require('mysql2/promise');

async function createDatabase() {
    const databaseName = process.env.DB_NAME || 'motorcycle_erp';
    if (!/^[A-Za-z0-9_]+$/.test(databaseName)) {
        throw new Error('DB_NAME may contain only letters, numbers, and underscores');
    }

    const connection = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        port: Number(process.env.DB_PORT || 3306),
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || ''
    });

    try {
        await connection.query(`CREATE DATABASE IF NOT EXISTS \`${databaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
        console.log(`✅ Database "${databaseName}" is ready`);
    } finally {
        await connection.end();
    }
}

if (require.main === module) {
    createDatabase().catch(error => {
        console.error('❌ Could not create database:', error.message || error.code || error);
        process.exitCode = 1;
    });
}

module.exports = { createDatabase };
