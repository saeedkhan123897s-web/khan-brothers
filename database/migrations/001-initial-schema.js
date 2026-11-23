'use strict';

module.exports = [

    // 1. USERS TABLE
    `CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        phone VARCHAR(20),
        password VARCHAR(255) NOT NULL,
        role ENUM('owner','admin','manager','salesman','mechanic','accountant','customer') DEFAULT 'customer',
        address TEXT,
        is_active TINYINT(1) DEFAULT 1,
        last_login DATETIME,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`,

    // 2. CUSTOMERS TABLE
    `CREATE TABLE IF NOT EXISTS customers (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(100),
        phone VARCHAR(20) NOT NULL,
        cnic VARCHAR(15),
        address TEXT,
        city VARCHAR(50) DEFAULT 'Swat',
        customer_type ENUM('retail','wholesale') DEFAULT 'retail',
        outstanding_balance DECIMAL(12,2) DEFAULT 0.00,
        total_purchases DECIMAL(12,2) DEFAULT 0.00,
        notes TEXT,
        is_active TINYINT(1) DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`,

    // 3. CUSTOMER MOTORCYCLES
    `CREATE TABLE IF NOT EXISTS customer_motorcycles (
        id INT AUTO_INCREMENT PRIMARY KEY,
        customer_id INT NOT NULL,
        make VARCHAR(50) NOT NULL,
        model VARCHAR(50) NOT NULL,
        year INT,
        color VARCHAR(30),
        engine_number VARCHAR(50),
        chassis_number VARCHAR(50),
        registration_number VARCHAR(20),
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
    )`,

    // 4. SUPPLIERS TABLE
    `CREATE TABLE IF NOT EXISTS suppliers (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        company_name VARCHAR(100),
        email VARCHAR(100),
        phone VARCHAR(20) NOT NULL,
        address TEXT,
        city VARCHAR(50),
        payment_terms VARCHAR(50) DEFAULT 'cash',
        outstanding_balance DECIMAL(12,2) DEFAULT 0.00,
        total_supplies DECIMAL(12,2) DEFAULT 0.00,
        notes TEXT,
        is_active TINYINT(1) DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`,

    // 5. CATEGORIES TABLE
    `CREATE TABLE IF NOT EXISTS categories (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        parent_id INT DEFAULT NULL,
        is_active TINYINT(1) DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (parent_id) REFERENCES categories(id) ON DELETE SET NULL
    )`,

    // 6. BRANDS TABLE
    `CREATE TABLE IF NOT EXISTS brands (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        is_active TINYINT(1) DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,

    // 7. PRODUCTS TABLE
    `CREATE TABLE IF NOT EXISTS products (
        id INT AUTO_INCREMENT PRIMARY KEY,
        sku VARCHAR(50) UNIQUE NOT NULL,
        name VARCHAR(200) NOT NULL,
        description TEXT,
        category_id INT,
        brand_id INT,
        cost_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        selling_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        wholesale_price DECIMAL(10,2) DEFAULT 0.00,
        stock_quantity INT DEFAULT 0,
        min_stock_level INT DEFAULT 5,
        max_stock_level INT DEFAULT 100,
        unit VARCHAR(20) DEFAULT 'piece',
        location VARCHAR(50),
        barcode VARCHAR(50),
        image_url VARCHAR(255),
        is_active TINYINT(1) DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
        FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE SET NULL,
        INDEX idx_sku (sku),
        INDEX idx_name (name),
        INDEX idx_category (category_id),
        INDEX idx_brand (brand_id)
    )`,

    // 8. STOCK MOVEMENTS
    `CREATE TABLE IF NOT EXISTS stock_movements (
        id INT AUTO_INCREMENT PRIMARY KEY,
        product_id INT NOT NULL,
        movement_type ENUM('purchase','sale','return_in','return_out','adjustment','workshop_use','damage') NOT NULL,
        quantity INT NOT NULL,
        previous_stock INT NOT NULL,
        new_stock INT NOT NULL,
        cost_price DECIMAL(10,2),
        reference_type VARCHAR(30),
        reference_id INT,
        notes TEXT,
        created_by INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (product_id) REFERENCES products(id),
        FOREIGN KEY (created_by) REFERENCES users(id),
        INDEX idx_product (product_id),
        INDEX idx_type (movement_type),
        INDEX idx_date (created_at)
    )`,

    // 9. SALES TABLE
    `CREATE TABLE IF NOT EXISTS sales (
        id INT AUTO_INCREMENT PRIMARY KEY,
        invoice_number VARCHAR(30) UNIQUE NOT NULL,
        customer_id INT,
        customer_name VARCHAR(100),
        customer_phone VARCHAR(20),
        customer_type ENUM('retail','wholesale') DEFAULT 'retail',
        sale_date DATE NOT NULL,
        subtotal DECIMAL(12,2) NOT NULL DEFAULT 0.00,
        discount_type ENUM('none','percentage','fixed') DEFAULT 'none',
        discount_value DECIMAL(10,2) DEFAULT 0.00,
        discount_amount DECIMAL(10,2) DEFAULT 0.00,
        tax_amount DECIMAL(10,2) DEFAULT 0.00,
        total_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
        amount_paid DECIMAL(12,2) DEFAULT 0.00,
        amount_due DECIMAL(12,2) DEFAULT 0.00,
        change_return DECIMAL(10,2) DEFAULT 0.00,
        payment_method ENUM('cash','bank_transfer','card','digital_wallet','credit','split') DEFAULT 'cash',
        payment_status ENUM('pending','partial','paid','refunded','overdue') DEFAULT 'pending',
        notes TEXT,
        created_by INT,
        status ENUM('completed','cancelled','returned') DEFAULT 'completed',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
        FOREIGN KEY (created_by) REFERENCES users(id),
        INDEX idx_invoice (invoice_number),
        INDEX idx_date (sale_date),
        INDEX idx_customer (customer_id),
        INDEX idx_status (payment_status)
    )`,

    // 10. SALE ITEMS
    `CREATE TABLE IF NOT EXISTS sale_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        sale_id INT NOT NULL,
        product_id INT NOT NULL,
        product_name VARCHAR(200),
        product_sku VARCHAR(50),
        quantity INT NOT NULL,
        unit_price DECIMAL(10,2) NOT NULL,
        cost_price DECIMAL(10,2) NOT NULL,
        discount_amount DECIMAL(10,2) DEFAULT 0.00,
        subtotal DECIMAL(12,2) NOT NULL,
        profit DECIMAL(10,2) DEFAULT 0.00,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE,
        FOREIGN KEY (product_id) REFERENCES products(id),
        INDEX idx_sale (sale_id)
    )`,

    // 11. SALE RETURNS
    `CREATE TABLE IF NOT EXISTS sale_returns (
        id INT AUTO_INCREMENT PRIMARY KEY,
        return_number VARCHAR(30) UNIQUE NOT NULL,
        sale_id INT NOT NULL,
        invoice_number VARCHAR(30),
        customer_id INT,
        return_date DATE NOT NULL,
        total_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
        refund_method ENUM('cash','bank_transfer','credit_note') DEFAULT 'cash',
        reason TEXT,
        notes TEXT,
        status ENUM('pending','approved','completed','rejected') DEFAULT 'pending',
        processed_by INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (sale_id) REFERENCES sales(id),
        FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
        FOREIGN KEY (processed_by) REFERENCES users(id)
    )`,

    // 12. SALE RETURN ITEMS
    `CREATE TABLE IF NOT EXISTS sale_return_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        return_id INT NOT NULL,
        product_id INT NOT NULL,
        quantity INT NOT NULL,
        unit_price DECIMAL(10,2) NOT NULL,
        subtotal DECIMAL(12,2) NOT NULL,
        condition_status ENUM('good','damaged','defective') DEFAULT 'good',
        FOREIGN KEY (return_id) REFERENCES sale_returns(id) ON DELETE CASCADE,
        FOREIGN KEY (product_id) REFERENCES products(id)
    )`,

    // 13. PURCHASES TABLE
    `CREATE TABLE IF NOT EXISTS purchases (
        id INT AUTO_INCREMENT PRIMARY KEY,
        purchase_number VARCHAR(30) UNIQUE NOT NULL,
        supplier_id INT,
        supplier_name VARCHAR(100),
        purchase_date DATE NOT NULL,
        subtotal DECIMAL(12,2) NOT NULL DEFAULT 0.00,
        discount_amount DECIMAL(10,2) DEFAULT 0.00,
        shipping_cost DECIMAL(10,2) DEFAULT 0.00,
        total_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
        amount_paid DECIMAL(12,2) DEFAULT 0.00,
        amount_due DECIMAL(12,2) DEFAULT 0.00,
        payment_method ENUM('cash','bank_transfer','card','credit') DEFAULT 'cash',
        payment_status ENUM('pending','partial','paid','overdue') DEFAULT 'pending',
        notes TEXT,
        created_by INT,
        status ENUM('pending','received','partial','cancelled') DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL,
        FOREIGN KEY (created_by) REFERENCES users(id),
        INDEX idx_purchase_num (purchase_number),
        INDEX idx_supplier (supplier_id),
        INDEX idx_date (purchase_date)
    )`,

    // 14. PURCHASE ITEMS
    `CREATE TABLE IF NOT EXISTS purchase_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        purchase_id INT NOT NULL,
        product_id INT NOT NULL,
        product_name VARCHAR(200),
        quantity INT NOT NULL,
        received_quantity INT DEFAULT 0,
        cost_price DECIMAL(10,2) NOT NULL,
        subtotal DECIMAL(12,2) NOT NULL,
        FOREIGN KEY (purchase_id) REFERENCES purchases(id) ON DELETE CASCADE,
        FOREIGN KEY (product_id) REFERENCES products(id)
    )`,

    // 15. PURCHASE RETURNS
    `CREATE TABLE IF NOT EXISTS purchase_returns (
        id INT AUTO_INCREMENT PRIMARY KEY,
        return_number VARCHAR(30) UNIQUE NOT NULL,
        purchase_id INT NOT NULL,
        supplier_id INT,
        return_date DATE NOT NULL,
        total_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
        reason TEXT,
        status ENUM('pending','approved','completed','rejected') DEFAULT 'pending',
        processed_by INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (purchase_id) REFERENCES purchases(id),
        FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL,
        FOREIGN KEY (processed_by) REFERENCES users(id)
    )`,

    // 16. PURCHASE RETURN ITEMS
    `CREATE TABLE IF NOT EXISTS purchase_return_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        return_id INT NOT NULL,
        product_id INT NOT NULL,
        quantity INT NOT NULL,
        cost_price DECIMAL(10,2) NOT NULL,
        subtotal DECIMAL(12,2) NOT NULL,
        FOREIGN KEY (return_id) REFERENCES purchase_returns(id) ON DELETE CASCADE,
        FOREIGN KEY (product_id) REFERENCES products(id)
    )`,

    // 17. MECHANICS TABLE
    `CREATE TABLE IF NOT EXISTS mechanics (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT,
        name VARCHAR(100) NOT NULL,
        phone VARCHAR(20),
        specialization VARCHAR(100),
        daily_rate DECIMAL(8,2) DEFAULT 0.00,
        is_active TINYINT(1) DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    )`,

    // 18. WORKSHOP SERVICES
    `CREATE TABLE IF NOT EXISTS workshop_services (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        base_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        estimated_hours DECIMAL(4,1) DEFAULT 1.0,
        is_active TINYINT(1) DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,

    // 19. JOB CARDS
    `CREATE TABLE IF NOT EXISTS job_cards (
        id INT AUTO_INCREMENT PRIMARY KEY,
        job_number VARCHAR(30) UNIQUE NOT NULL,
        customer_id INT,
        motorcycle_id INT,
        customer_name VARCHAR(100),
        customer_phone VARCHAR(20),
        motorcycle_make VARCHAR(50),
        motorcycle_model VARCHAR(50),
        motorcycle_registration VARCHAR(20),
        mileage INT,
        complaints TEXT,
        diagnosis TEXT,
        mechanic_id INT,
        estimated_cost DECIMAL(10,2) DEFAULT 0.00,
        actual_cost DECIMAL(10,2) DEFAULT 0.00,
        parts_cost DECIMAL(10,2) DEFAULT 0.00,
        labor_cost DECIMAL(10,2) DEFAULT 0.00,
        total_cost DECIMAL(10,2) DEFAULT 0.00,
        payment_status ENUM('pending','partial','paid') DEFAULT 'pending',
        amount_paid DECIMAL(10,2) DEFAULT 0.00,
        status ENUM('received','diagnosing','waiting_parts','in_progress','completed','delivered','cancelled') DEFAULT 'received',
        received_date DATE NOT NULL,
        estimated_completion DATE,
        completed_date DATE,
        delivered_date DATE,
        notes TEXT,
        created_by INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
        FOREIGN KEY (motorcycle_id) REFERENCES customer_motorcycles(id) ON DELETE SET NULL,
        FOREIGN KEY (mechanic_id) REFERENCES mechanics(id) ON DELETE SET NULL,
        FOREIGN KEY (created_by) REFERENCES users(id),
        INDEX idx_job_number (job_number),
        INDEX idx_status (status),
        INDEX idx_customer (customer_id)
    )`,

    // 20. JOB CARD SERVICES
    `CREATE TABLE IF NOT EXISTS job_card_services (
        id INT AUTO_INCREMENT PRIMARY KEY,
        job_card_id INT NOT NULL,
        service_id INT,
        service_name VARCHAR(100),
        price DECIMAL(10,2) NOT NULL,
        notes TEXT,
        FOREIGN KEY (job_card_id) REFERENCES job_cards(id) ON DELETE CASCADE,
        FOREIGN KEY (service_id) REFERENCES workshop_services(id) ON DELETE SET NULL
    )`,

    // 21. JOB CARD PARTS
    `CREATE TABLE IF NOT EXISTS job_card_parts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        job_card_id INT NOT NULL,
        product_id INT NOT NULL,
        product_name VARCHAR(200),
        quantity INT NOT NULL,
        unit_price DECIMAL(10,2) NOT NULL,
        subtotal DECIMAL(10,2) NOT NULL,
        FOREIGN KEY (job_card_id) REFERENCES job_cards(id) ON DELETE CASCADE,
        FOREIGN KEY (product_id) REFERENCES products(id)
    )`,

    // 22. ORDERS TABLE (Online Orders)
    `CREATE TABLE IF NOT EXISTS orders (
        id INT AUTO_INCREMENT PRIMARY KEY,
        order_number VARCHAR(30) UNIQUE NOT NULL,
        customer_id INT,
        customer_name VARCHAR(100),
        customer_email VARCHAR(100),
        customer_phone VARCHAR(20),
        shipping_address TEXT,
        subtotal DECIMAL(12,2) NOT NULL DEFAULT 0.00,
        shipping_cost DECIMAL(10,2) DEFAULT 0.00,
        total_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
        payment_method VARCHAR(30) DEFAULT 'cash',
        payment_status ENUM('pending','paid','refunded') DEFAULT 'pending',
        status ENUM('pending','confirmed','processing','shipped','delivered','cancelled') DEFAULT 'pending',
        tracking_number VARCHAR(50),
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
        INDEX idx_order_number (order_number),
        INDEX idx_customer (customer_id),
        INDEX idx_status (status)
    )`,

    // 23. ORDER ITEMS
    `CREATE TABLE IF NOT EXISTS order_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        order_id INT NOT NULL,
        product_id INT NOT NULL,
        product_name VARCHAR(200),
        quantity INT NOT NULL,
        unit_price DECIMAL(10,2) NOT NULL,
        subtotal DECIMAL(12,2) NOT NULL,
        FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
        FOREIGN KEY (product_id) REFERENCES products(id)
    )`,

    // 24. PAYMENTS TABLE
    `CREATE TABLE IF NOT EXISTS payments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        payment_number VARCHAR(30) UNIQUE NOT NULL,
        payment_type ENUM('received','made') NOT NULL,
        reference_type ENUM('sale','purchase','job_card','order','expense','other') NOT NULL,
        reference_id INT,
        customer_id INT,
        supplier_id INT,
        amount DECIMAL(12,2) NOT NULL,
        payment_method ENUM('cash','bank_transfer','card','digital_wallet','cheque') DEFAULT 'cash',
        payment_date DATE NOT NULL,
        bank_name VARCHAR(50),
        reference_number VARCHAR(50),
        notes TEXT,
        created_by INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
        FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL,
        FOREIGN KEY (created_by) REFERENCES users(id),
        INDEX idx_type (payment_type),
        INDEX idx_date (payment_date),
        INDEX idx_reference (reference_type, reference_id)
    )`,

    // 25. ACCOUNTS (Chart of Accounts)
    `CREATE TABLE IF NOT EXISTS accounts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        account_code VARCHAR(20) UNIQUE NOT NULL,
        name VARCHAR(100) NOT NULL,
        account_type ENUM('asset','liability','equity','income','expense') NOT NULL,
        parent_id INT,
        balance DECIMAL(14,2) DEFAULT 0.00,
        description TEXT,
        is_active TINYINT(1) DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (parent_id) REFERENCES accounts(id) ON DELETE SET NULL
    )`,

    // 26. LEDGER ENTRIES
    `CREATE TABLE IF NOT EXISTS ledger_entries (
        id INT AUTO_INCREMENT PRIMARY KEY,
        account_id INT NOT NULL,
        entry_date DATE NOT NULL,
        description VARCHAR(255) NOT NULL,
        debit DECIMAL(12,2) DEFAULT 0.00,
        credit DECIMAL(12,2) DEFAULT 0.00,
        balance DECIMAL(14,2) DEFAULT 0.00,
        reference_type VARCHAR(30),
        reference_id INT,
        created_by INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (account_id) REFERENCES accounts(id),
        FOREIGN KEY (created_by) REFERENCES users(id),
        INDEX idx_account (account_id),
        INDEX idx_date (entry_date)
    )`,

    // 27. BANK ACCOUNTS
    `CREATE TABLE IF NOT EXISTS bank_accounts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        bank_name VARCHAR(100) NOT NULL,
        account_title VARCHAR(100) NOT NULL,
        account_number VARCHAR(30),
        branch VARCHAR(100),
        balance DECIMAL(14,2) DEFAULT 0.00,
        is_active TINYINT(1) DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,

    // 28. EXPENSES TABLE
    `CREATE TABLE IF NOT EXISTS expenses (
        id INT AUTO_INCREMENT PRIMARY KEY,
        expense_number VARCHAR(30) UNIQUE NOT NULL,
        category VARCHAR(50) NOT NULL,
        description VARCHAR(255) NOT NULL,
        amount DECIMAL(10,2) NOT NULL,
        expense_date DATE NOT NULL,
        payment_method ENUM('cash','bank_transfer','card') DEFAULT 'cash',
        bank_account_id INT,
        receipt_url VARCHAR(255),
        notes TEXT,
        approved_by INT,
        created_by INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (bank_account_id) REFERENCES bank_accounts(id) ON DELETE SET NULL,
        FOREIGN KEY (approved_by) REFERENCES users(id),
        FOREIGN KEY (created_by) REFERENCES users(id),
        INDEX idx_date (expense_date),
        INDEX idx_category (category)
    )`,

    // 29. AUDIT TRAIL
    `CREATE TABLE IF NOT EXISTS audit_trail (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT,
        user_name VARCHAR(100),
        action VARCHAR(30) NOT NULL,
        module VARCHAR(30) NOT NULL,
        record_id INT,
        old_values JSON,
        new_values JSON,
        ip_address VARCHAR(45),
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
        INDEX idx_user (user_id),
        INDEX idx_action (action),
        INDEX idx_module (module),
        INDEX idx_date (created_at)
    )`,

    // 30. SETTINGS TABLE
    `CREATE TABLE IF NOT EXISTS settings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        setting_key VARCHAR(50) UNIQUE NOT NULL,
        setting_value TEXT,
        setting_group VARCHAR(30) DEFAULT 'general',
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`
];
