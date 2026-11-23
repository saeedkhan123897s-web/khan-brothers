'use strict';

async function migrate(connection) {
    await connection.execute(`CREATE TABLE IF NOT EXISTS user_route_permissions (
        user_id INT NOT NULL,
        permission_key VARCHAR(50) NOT NULL,
        allowed BOOLEAN NOT NULL,
        PRIMARY KEY (user_id, permission_key),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`);

    const [columns] = await connection.execute("SHOW COLUMNS FROM products LIKE 'product_type'");
    if (!columns.length) {
        await connection.execute(`ALTER TABLE products
            ADD COLUMN product_type ENUM('part', 'motorcycle') NOT NULL DEFAULT 'part',
            ADD COLUMN model_year SMALLINT UNSIGNED NULL,
            ADD COLUMN engine_cc SMALLINT UNSIGNED NULL,
            ADD INDEX idx_products_type_active (product_type, is_active)`);
    }
}

module.exports = migrate;
