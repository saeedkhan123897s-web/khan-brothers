// ============================================
// DATABASE CONNECTION - MySQL
// Khan Brothers Motorcycle Workshop ERP
// ============================================

const mysql = require('mysql2/promise');
require('dotenv').config();

// Create connection pool
const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'motorcycle_erp',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0
});

// Test connection
async function testConnection() {
    try {
        const connection = await pool.getConnection();
        console.log('✅ Database connected successfully');
        connection.release();
        return true;
    } catch (error) {
        console.error('❌ Database connection failed:', error.message || error.code || error);
        return false;
    }
}

// Helper: Execute query
async function query(sql, params = []) {
    const [rows] = await pool.execute(sql, params);
    return rows;
}

// Helper: Execute query and return insert ID
async function queryInsert(sql, params = []) {
    const [result] = await pool.execute(sql, params);
    return result.insertId;
}

// Helper: Execute query and return affected rows
async function queryUpdate(sql, params = []) {
    const [result] = await pool.execute(sql, params);
    return result.affectedRows;
}

// Helper: Get single row
async function queryOne(sql, params = []) {
    const [rows] = await pool.execute(sql, params);
    return rows[0] || null;
}

// Helper: Transaction wrapper
async function transaction(callback) {
    const connection = await pool.getConnection();
    await connection.beginTransaction();
    try {
        const result = await callback(connection);
        await connection.commit();
        return result;
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}

module.exports = {
    pool,
    query,
    queryInsert,
    queryUpdate,
    queryOne,
    transaction,
    testConnection
};
