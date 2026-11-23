'use strict';

async function addColumns(connection, table, columns) {
    const [existingColumns] = await connection.execute(`SHOW COLUMNS FROM ${table}`);
    const existing = new Set(existingColumns.map(column => column.Field));
    const missing = Object.entries(columns).filter(([name]) => !existing.has(name));
    if (missing.length) {
        await connection.execute(`ALTER TABLE ${table} ${missing.map(([name, definition]) => `ADD COLUMN ${name} ${definition}`).join(', ')}`);
    }
}

module.exports = async function migrate(connection) {
    await addColumns(connection, 'job_cards', {
        oil_change_on: 'DATE NULL',
        next_oil_change_on: 'DATE NULL'
    });
    await addColumns(connection, 'used_bike_sales', {
        interest_rate: 'DECIMAL(5,2) NOT NULL DEFAULT 0',
        interest_amount: 'DECIMAL(12,2) NOT NULL DEFAULT 0'
    });
};
