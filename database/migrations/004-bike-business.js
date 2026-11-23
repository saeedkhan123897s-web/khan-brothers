'use strict';

async function addColumns(connection, table, definitions) {
    const [columns] = await connection.execute(`SHOW COLUMNS FROM ${table}`);
    const existing = new Set(columns.map(column => column.Field));
    const additions = Object.entries(definitions).filter(([name]) => !existing.has(name));
    if (additions.length) {
        await connection.execute(`ALTER TABLE ${table} ${additions.map(([name, definition]) => `ADD COLUMN ${name} ${definition}`).join(', ')}`);
    }
}

async function migrate(connection) {
    await addColumns(connection, 'used_bikes', {
        model: 'VARCHAR(100) NULL',
        engine_condition: 'VARCHAR(120) NULL',
        tyre_condition: 'VARCHAR(120) NULL',
        body_condition: 'VARCHAR(120) NULL',
        purchase_method: "VARCHAR(24) NOT NULL DEFAULT 'cash'"
    });
    await addColumns(connection, 'used_bike_work', {
        cost_type: "ENUM('repair','other') NOT NULL DEFAULT 'repair'"
    });
    await addColumns(connection, 'orders', { delivered_on: 'DATE NULL' });
    await addColumns(connection, 'expenses', {
        business_area: "ENUM('general','used_bikes') NOT NULL DEFAULT 'general'"
    });

    await connection.execute(`CREATE TABLE IF NOT EXISTS used_bike_photos (
        used_bike_id INT NOT NULL,
        position TINYINT UNSIGNED NOT NULL,
        image_url VARCHAR(255) NOT NULL,
        PRIMARY KEY (used_bike_id, position),
        FOREIGN KEY (used_bike_id) REFERENCES used_bikes(id)
    )`);

    await connection.execute(`CREATE TABLE IF NOT EXISTS used_bike_sales (
        id INT AUTO_INCREMENT PRIMARY KEY,
        used_bike_id INT NOT NULL,
        sale_id INT NOT NULL UNIQUE,
        buyer_cnic VARCHAR(15),
        payment_method ENUM('cash','bank_transfer','jazzcash','easypaisa','card','qist') NOT NULL,
        initial_payment DECIMAL(12,2) NOT NULL,
        monthly_installment DECIMAL(12,2),
        next_due_date DATE,
        request_key CHAR(36) UNIQUE,
        FOREIGN KEY (used_bike_id) REFERENCES used_bikes(id),
        FOREIGN KEY (sale_id) REFERENCES sales(id),
        INDEX idx_bike_sales_due (next_due_date)
    )`);

    await connection.execute(`CREATE TABLE IF NOT EXISTS used_bike_installments (
        used_bike_sale_id INT NOT NULL,
        payment_id INT NOT NULL,
        request_key CHAR(36) NOT NULL,
        PRIMARY KEY (used_bike_sale_id, request_key),
        FOREIGN KEY (used_bike_sale_id) REFERENCES used_bike_sales(id),
        FOREIGN KEY (payment_id) REFERENCES payments(id)
    )`);
}

module.exports = migrate;
