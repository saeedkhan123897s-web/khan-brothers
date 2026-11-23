'use strict';

async function migrate(connection) {
    const [productColumns] = await connection.execute("SHOW COLUMNS FROM products LIKE 'motorcycle_condition'");
    if (!productColumns.length) {
        await connection.execute(`ALTER TABLE products
            ADD COLUMN motorcycle_condition ENUM('new','used') NOT NULL DEFAULT 'new'`);
    }

    const [[reference]] = await connection.execute("SHOW COLUMNS FROM payments LIKE 'reference_type'");
    if (!reference.Type.includes("'used_bike'")) {
        await connection.execute(`ALTER TABLE payments
            MODIFY COLUMN reference_type ENUM('sale','purchase','job_card','order','expense','other','used_bike') NOT NULL`);
    }

    await connection.execute(`CREATE TABLE IF NOT EXISTS used_bikes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        product_id INT NOT NULL UNIQUE,
        seller_name VARCHAR(100) NOT NULL,
        seller_phone VARCHAR(20),
        chassis_number VARCHAR(50) UNIQUE,
        registration_number VARCHAR(30),
        acquired_on DATE NOT NULL,
        purchase_price DECIMAL(10,2) NOT NULL,
        intake_notes TEXT,
        intake_key CHAR(36) UNIQUE,
        created_by INT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (product_id) REFERENCES products(id),
        FOREIGN KEY (created_by) REFERENCES users(id)
    )`);

    await connection.execute(`CREATE TABLE IF NOT EXISTS used_bike_work (
        id INT AUTO_INCREMENT PRIMARY KEY,
        used_bike_id INT NOT NULL,
        worked_on DATE NOT NULL,
        description VARCHAR(255) NOT NULL,
        amount DECIMAL(10,2) NOT NULL DEFAULT 0,
        request_key CHAR(36),
        created_by INT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (used_bike_id, request_key),
        FOREIGN KEY (used_bike_id) REFERENCES used_bikes(id),
        FOREIGN KEY (created_by) REFERENCES users(id)
    )`);
}

module.exports = migrate;
