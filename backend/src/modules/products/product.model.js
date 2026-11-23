// ============================================
// PRODUCT MODEL - Database Access Layer
// Khan Brothers Motorcycle Workshop ERP
// ============================================

const { query, queryInsert, queryUpdate, queryOne, transaction, pool } = require('../../config/database');
const {
    generateId,
    generateInvoiceNumber,
    generateJobCardNumber,
    generatePurchaseNumber,
    generateSKU,
    formatCurrency,
    paginate,
    paginationResponse,
    todaySQL,
    nowSQL
} = require('../../utils/helpers');
const {
    ROLES,
    ORDER_STATUS,
    PAYMENT_STATUS,
    PAYMENT_METHODS,
    JOB_STATUS,
    STOCK_MOVEMENT,
    ACCOUNT_TYPES,
    AUDIT_ACTIONS
} = require('../../utils/constants');

const ProductModel = {

    // ============================================
    // PRODUCT METHODS
    // ============================================

    /**
     * Find all products with pagination, filtering, and sorting
     * @param {Object} options Filter and pagination options
     * @returns {Promise<{ products: Array, total: number, page: number, limit: number }>}
     */
    async findAll(options = {}) {
        const {
            page = 1,
            limit = 20,
            search,
            category_id,
            brand_id,
            product_type,
            motorcycle_condition,
            is_active,
            min_price,
            max_price,
            in_stock,
            sort_by = 'created_at',
            sort_order = 'DESC'
        } = options;

        const whereClauses = [];
        const params = [];

        // Filter by active status
        if (is_active !== undefined && is_active !== null && is_active !== '') {
            whereClauses.push('p.is_active = ?');
            params.push(is_active === true || is_active === 1 || is_active === '1' || is_active === 'true' ? 1 : 0);
        }

        // Filter by category
        if (category_id) {
            whereClauses.push('p.category_id = ?');
            params.push(parseInt(category_id, 10));
        }

        if (product_type) {
            whereClauses.push('p.product_type = ?');
            params.push(product_type);
        }
        if (motorcycle_condition) {
            whereClauses.push("p.product_type = 'motorcycle' AND p.motorcycle_condition = ?");
            params.push(motorcycle_condition);
        }

        // Filter by brand
        if (brand_id) {
            whereClauses.push('p.brand_id = ?');
            params.push(parseInt(brand_id, 10));
        }

        // Search by name, SKU, or barcode
        if (search && search.trim()) {
            whereClauses.push('(p.name LIKE ? OR p.sku LIKE ? OR p.barcode LIKE ? OR p.description LIKE ?)');
            const term = `%${search.trim()}%`;
            params.push(term, term, term, term);
        }

        // Price range filters
        if (min_price !== undefined && min_price !== null && min_price !== '') {
            whereClauses.push('p.selling_price >= ?');
            params.push(parseFloat(min_price));
        }

        if (max_price !== undefined && max_price !== null && max_price !== '') {
            whereClauses.push('p.selling_price <= ?');
            params.push(parseFloat(max_price));
        }

        // Stock availability filter
        if (in_stock === true || in_stock === 1 || in_stock === '1' || in_stock === 'true') {
            whereClauses.push('p.stock_quantity > 0');
        } else if (in_stock === false || in_stock === 0 || in_stock === '0' || in_stock === 'false') {
            whereClauses.push('p.stock_quantity <= 0');
        }

        const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

        // Count total matching records
        const countSql = `SELECT COUNT(*) AS total FROM products p ${whereSql}`;
        const countResult = await queryOne(countSql, params);
        const total = countResult ? parseInt(countResult.total, 10) : 0;

        // Sorting whitelist
        const allowedSortCols = {
            id: 'p.id',
            sku: 'p.sku',
            name: 'p.name',
            cost_price: 'p.cost_price',
            selling_price: 'p.selling_price',
            wholesale_price: 'p.wholesale_price',
            stock_quantity: 'p.stock_quantity',
            created_at: 'p.created_at',
            updated_at: 'p.updated_at'
        };

        const sortColumn = allowedSortCols[sort_by] || 'p.created_at';
        const sortDirection = String(sort_order).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

        // Calculate pagination offsets
        const paginationInfo = paginate(page, limit);
        const pLimit = paginationInfo.limit;
        const pOffset = paginationInfo.offset;

        // Query product records
        const selectSql = `
            SELECT 
                p.id,
                p.sku,
                p.name,
                p.product_type,
                p.motorcycle_condition,
                p.model_year,
                p.engine_cc,
                p.description,
                p.category_id,
                p.brand_id,
                p.cost_price,
                p.selling_price,
                p.wholesale_price,
                p.stock_quantity,
                p.min_stock_level,
                p.max_stock_level,
                p.unit,
                p.location,
                p.barcode,
                p.image_url,
                p.is_active,
                p.created_at,
                p.updated_at,
                c.name AS category_name,
                b.name AS brand_name
            FROM products p
            LEFT JOIN categories c ON p.category_id = c.id
            LEFT JOIN brands b ON p.brand_id = b.id
            ${whereSql}
            ORDER BY ${sortColumn} ${sortDirection}
            LIMIT ? OFFSET ?
        `;

        const rows = await query(selectSql, [...params, pLimit, pOffset]);

        return {
            products: rows,
            total,
            page: paginationInfo.page,
            limit: paginationInfo.limit
        };
    },

    /**
     * Find single product by ID with category and brand details
     * @param {number|string} id Product ID
     * @returns {Promise<Object|null>}
     */
    async findById(id) {
        const sql = `
            SELECT 
                p.id,
                p.sku,
                p.name,
                p.product_type,
                p.motorcycle_condition,
                p.model_year,
                p.engine_cc,
                p.description,
                p.category_id,
                p.brand_id,
                p.cost_price,
                p.selling_price,
                p.wholesale_price,
                p.stock_quantity,
                p.min_stock_level,
                p.max_stock_level,
                p.unit,
                p.location,
                p.barcode,
                p.image_url,
                p.is_active,
                p.created_at,
                p.updated_at,
                c.name AS category_name,
                b.name AS brand_name
            FROM products p
            LEFT JOIN categories c ON p.category_id = c.id
            LEFT JOIN brands b ON p.brand_id = b.id
            WHERE p.id = ?
        `;
        return await queryOne(sql, [id]);
    },

    /**
     * Find single product by SKU
     * @param {string} sku Product SKU
     * @returns {Promise<Object|null>}
     */
    async findBySku(sku) {
        const sql = `
            SELECT 
                p.id,
                p.sku,
                p.name,
                p.product_type,
                p.motorcycle_condition,
                p.model_year,
                p.engine_cc,
                p.description,
                p.category_id,
                p.brand_id,
                p.cost_price,
                p.selling_price,
                p.wholesale_price,
                p.stock_quantity,
                p.min_stock_level,
                p.max_stock_level,
                p.unit,
                p.location,
                p.barcode,
                p.image_url,
                p.is_active,
                p.created_at,
                p.updated_at,
                c.name AS category_name,
                b.name AS brand_name
            FROM products p
            LEFT JOIN categories c ON p.category_id = c.id
            LEFT JOIN brands b ON p.brand_id = b.id
            WHERE p.sku = ?
        `;
        return await queryOne(sql, [sku]);
    },

    /**
     * Find single product by barcode
     * @param {string} barcode Product barcode
     * @returns {Promise<Object|null>}
     */
    async findByBarcode(barcode) {
        const sql = `
            SELECT 
                p.id,
                p.sku,
                p.name,
                p.product_type,
                p.motorcycle_condition,
                p.model_year,
                p.engine_cc,
                p.description,
                p.category_id,
                p.brand_id,
                p.cost_price,
                p.selling_price,
                p.wholesale_price,
                p.stock_quantity,
                p.min_stock_level,
                p.max_stock_level,
                p.unit,
                p.location,
                p.barcode,
                p.image_url,
                p.is_active,
                p.created_at,
                p.updated_at,
                c.name AS category_name,
                b.name AS brand_name
            FROM products p
            LEFT JOIN categories c ON p.category_id = c.id
            LEFT JOIN brands b ON p.brand_id = b.id
            WHERE p.barcode = ?
        `;
        return await queryOne(sql, [barcode]);
    },

    /**
     * Check if a SKU exists (excluding a specific product ID if updating)
     * @param {string} sku SKU code
     * @param {number|null} excludeId Product ID to exclude from check
     * @returns {Promise<boolean>}
     */
    async skuExists(sku, excludeId = null) {
        let sql = 'SELECT id FROM products WHERE sku = ?';
        const params = [sku];
        if (excludeId) {
            sql += ' AND id != ?';
            params.push(excludeId);
        }
        const row = await queryOne(sql, params);
        return Boolean(row);
    },

    /**
     * Check if a barcode exists (excluding a specific product ID if updating)
     * @param {string} barcode Barcode string
     * @param {number|null} excludeId Product ID to exclude from check
     * @returns {Promise<boolean>}
     */
    async barcodeExists(barcode, excludeId = null) {
        if (!barcode || !barcode.trim()) return false;
        let sql = 'SELECT id FROM products WHERE barcode = ?';
        const params = [barcode.trim()];
        if (excludeId) {
            sql += ' AND id != ?';
            params.push(excludeId);
        }
        const row = await queryOne(sql, params);
        return Boolean(row);
    },

    /**
     * Create a new product
     * @param {Object} productData Product details
     * @returns {Promise<Object>} Created product details
     */
    async create(productData) {
        const sql = `
            INSERT INTO products (
                sku,
                name,
                description,
                product_type,
                model_year,
                engine_cc,
                category_id,
                brand_id,
                cost_price,
                selling_price,
                wholesale_price,
                stock_quantity,
                min_stock_level,
                max_stock_level,
                unit,
                location,
                barcode,
                image_url,
                is_active
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        const params = [
            productData.sku,
            productData.name,
            productData.description !== undefined && productData.description !== '' ? productData.description : null,
            productData.product_type || 'part',
            productData.model_year ?? null,
            productData.engine_cc ?? null,
            productData.category_id ? parseInt(productData.category_id, 10) : null,
            productData.brand_id ? parseInt(productData.brand_id, 10) : null,
            productData.cost_price !== undefined && productData.cost_price !== null ? parseFloat(productData.cost_price) : 0.00,
            parseFloat(productData.selling_price || 0.00),
            productData.wholesale_price !== undefined && productData.wholesale_price !== null ? parseFloat(productData.wholesale_price) : 0.00,
            productData.stock_quantity !== undefined && productData.stock_quantity !== null ? parseInt(productData.stock_quantity, 10) : 0,
            productData.min_stock_level !== undefined && productData.min_stock_level !== null ? parseInt(productData.min_stock_level, 10) : 5,
            productData.max_stock_level !== undefined && productData.max_stock_level !== null ? parseInt(productData.max_stock_level, 10) : 100,
            productData.unit && productData.unit.trim() ? productData.unit.trim() : 'piece',
            productData.location !== undefined && productData.location !== '' ? productData.location : null,
            productData.barcode !== undefined && productData.barcode !== '' ? productData.barcode : null,
            productData.image_url !== undefined && productData.image_url !== '' ? productData.image_url : null,
            productData.is_active !== undefined ? (productData.is_active ? 1 : 0) : 1
        ];

        const insertId = await queryInsert(sql, params);
        return await this.findById(insertId);
    },

    /**
     * Update an existing product
     * @param {number|string} id Product ID
     * @param {Object} productData Fields to update
     * @returns {Promise<Object>} Updated product details
     */
    async update(id, productData) {
        const allowedFields = [
            'sku',
            'name',
            'description',
            'product_type',
            'model_year',
            'engine_cc',
            'category_id',
            'brand_id',
            'cost_price',
            'selling_price',
            'wholesale_price',
            'stock_quantity',
            'min_stock_level',
            'max_stock_level',
            'unit',
            'location',
            'barcode',
            'image_url',
            'is_active'
        ];

        const updates = [];
        const params = [];

        for (const field of allowedFields) {
            if (productData[field] !== undefined) {
                updates.push(`${field} = ?`);

                if (field === 'category_id' || field === 'brand_id') {
                    params.push(productData[field] ? parseInt(productData[field], 10) : null);
                } else if (field === 'cost_price' || field === 'selling_price' || field === 'wholesale_price') {
                    params.push(productData[field] !== null ? parseFloat(productData[field]) : 0.00);
                } else if (field === 'stock_quantity' || field === 'min_stock_level' || field === 'max_stock_level') {
                    params.push(productData[field] !== null ? parseInt(productData[field], 10) : 0);
                } else if (field === 'is_active') {
                    params.push(productData[field] ? 1 : 0);
                } else if (productData[field] === '') {
                    params.push(null);
                } else {
                    params.push(productData[field]);
                }
            }
        }

        if (updates.length === 0) {
            return await this.findById(id);
        }

        params.push(id);
        const sql = `UPDATE products SET ${updates.join(', ')} WHERE id = ?`;
        await queryUpdate(sql, params);

        return await this.findById(id);
    },

    /**
     * Soft delete product by setting is_active = 0
     * @param {number|string} id Product ID
     * @returns {Promise<number>} Affected rows
     */
    async softDelete(id) {
        const sql = 'UPDATE products SET is_active = 0 WHERE id = ?';
        return await queryUpdate(sql, [id]);
    },

    /**
     * Hard delete product (for testing or cleanup)
     * @param {number|string} id Product ID
     * @returns {Promise<number>} Affected rows
     */
    async hardDelete(id) {
        const sql = 'DELETE FROM products WHERE id = ?';
        return await queryUpdate(sql, [id]);
    },

    /**
     * Get products where stock_quantity <= min_stock_level
     * @param {Object} options Filter options
     * @returns {Promise<{ products: Array, total: number, page: number, limit: number }>}
     */
    async getLowStock(options = {}) {
        const { page = 1, limit = 20, threshold } = options;

        const hasCustomThreshold = threshold !== undefined && threshold !== null && threshold !== '';
        const parsedThreshold = hasCustomThreshold ? parseInt(threshold, 10) : null;

        const whereSql = hasCustomThreshold
            ? 'WHERE p.stock_quantity <= ? AND p.is_active = 1'
            : 'WHERE p.stock_quantity <= p.min_stock_level AND p.is_active = 1';

        const countParams = hasCustomThreshold ? [parsedThreshold] : [];

        const countSql = `SELECT COUNT(*) AS total FROM products p ${whereSql}`;
        const countResult = await queryOne(countSql, countParams);
        const total = countResult ? parseInt(countResult.total, 10) : 0;

        const paginationInfo = paginate(page, limit);
        const pLimit = paginationInfo.limit;
        const pOffset = paginationInfo.offset;

        const selectSql = `
            SELECT 
                p.id,
                p.sku,
                p.name,
                p.product_type,
                p.motorcycle_condition,
                p.model_year,
                p.engine_cc,
                p.description,
                p.category_id,
                p.brand_id,
                p.cost_price,
                p.selling_price,
                p.wholesale_price,
                p.stock_quantity,
                p.min_stock_level,
                p.max_stock_level,
                (p.min_stock_level - p.stock_quantity) AS stock_deficit,
                p.unit,
                p.location,
                p.barcode,
                p.image_url,
                p.is_active,
                p.created_at,
                p.updated_at,
                c.name AS category_name,
                b.name AS brand_name
            FROM products p
            LEFT JOIN categories c ON p.category_id = c.id
            LEFT JOIN brands b ON p.brand_id = b.id
            ${whereSql}
            ORDER BY (p.min_stock_level - p.stock_quantity) DESC, p.stock_quantity ASC
            LIMIT ? OFFSET ?
        `;

        const selectParams = hasCustomThreshold
            ? [parsedThreshold, pLimit, pOffset]
            : [pLimit, pOffset];

        const rows = await query(selectSql, selectParams);

        return {
            products: rows,
            total,
            page: paginationInfo.page,
            limit: paginationInfo.limit
        };
    },

    /**
     * Search products by name, SKU or barcode (optimized for POS)
     * @param {Object} options Search options
     * @returns {Promise<{ products: Array, total: number, page: number, limit: number }>}
     */
    async search(options = {}) {
        const {
            query: searchTerm = '',
            page = 1,
            limit = 20,
            product_type,
            motorcycle_condition,
            is_active
        } = options;

        const term = String(searchTerm).trim();
        const wildcardTerm = `%${term}%`;

        const whereClauses = ['(p.name LIKE ? OR p.sku LIKE ? OR p.barcode LIKE ?)'];
        const params = [wildcardTerm, wildcardTerm, wildcardTerm];

        if (is_active !== undefined && is_active !== null && is_active !== '') {
            whereClauses.push('p.is_active = ?');
            params.push(is_active === true || is_active === 1 || is_active === '1' || is_active === 'true' ? 1 : 0);
        }

        if (product_type) {
            whereClauses.push('p.product_type = ?');
            params.push(product_type);
        }
        if (motorcycle_condition) {
            whereClauses.push("p.product_type = 'motorcycle' AND p.motorcycle_condition = ?");
            params.push(motorcycle_condition);
        }

        const whereSql = `WHERE ${whereClauses.join(' AND ')}`;

        const countSql = `SELECT COUNT(*) AS total FROM products p ${whereSql}`;
        const countResult = await queryOne(countSql, params);
        const total = countResult ? parseInt(countResult.total, 10) : 0;

        const paginationInfo = paginate(page, limit);
        const pLimit = paginationInfo.limit;
        const pOffset = paginationInfo.offset;

        const selectSql = `
            SELECT 
                p.id,
                p.sku,
                p.name,
                p.product_type,
                p.motorcycle_condition,
                p.model_year,
                p.engine_cc,
                p.description,
                p.category_id,
                p.brand_id,
                p.cost_price,
                p.selling_price,
                p.wholesale_price,
                p.stock_quantity,
                p.min_stock_level,
                p.max_stock_level,
                p.unit,
                p.location,
                p.barcode,
                p.image_url,
                p.is_active,
                c.name AS category_name,
                b.name AS brand_name
            FROM products p
            LEFT JOIN categories c ON p.category_id = c.id
            LEFT JOIN brands b ON p.brand_id = b.id
            ${whereSql}
            ORDER BY 
                CASE 
                    WHEN p.barcode = ? THEN 1
                    WHEN p.sku = ? THEN 2
                    WHEN p.name = ? THEN 3
                    WHEN p.name LIKE ? THEN 4
                    ELSE 5
                END,
                p.name ASC
            LIMIT ? OFFSET ?
        `;

        const exactTerm = term;
        const prefixTerm = `${term}%`;
        const selectParams = [...params, exactTerm, exactTerm, exactTerm, prefixTerm, pLimit, pOffset];

        const rows = await query(selectSql, selectParams);

        return {
            products: rows,
            total,
            page: paginationInfo.page,
            limit: paginationInfo.limit
        };
    },

    // ============================================
    // CATEGORY METHODS
    // ============================================

    /**
     * Find all categories with optional search and pagination
     * @param {Object} options Query options
     * @returns {Promise<{ categories: Array, total: number, page: number, limit: number }>}
     */
    async findAllCategories(options = {}) {
        const {
            page = 1,
            limit = 20,
            search,
            is_active,
            all = false
        } = options;

        const whereClauses = [];
        const params = [];

        if (is_active !== undefined && is_active !== null && is_active !== '') {
            whereClauses.push('c.is_active = ?');
            params.push(is_active === true || is_active === 1 || is_active === '1' || is_active === 'true' ? 1 : 0);
        }

        if (search && search.trim()) {
            whereClauses.push('(c.name LIKE ? OR c.description LIKE ?)');
            const term = `%${search.trim()}%`;
            params.push(term, term);
        }

        const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

        const countSql = `SELECT COUNT(*) AS total FROM categories c ${whereSql}`;
        const countResult = await queryOne(countSql, params);
        const total = countResult ? parseInt(countResult.total, 10) : 0;

        let rows;
        let paginationInfo;

        if (all === true || all === 'true') {
            const selectSql = `
                SELECT 
                    c.id,
                    c.name,
                    c.description,
                    c.parent_id,
                    c.is_active,
                    c.created_at,
                    parent.name AS parent_name,
                    COUNT(p.id) AS product_count
                FROM categories c
                LEFT JOIN categories parent ON c.parent_id = parent.id
                LEFT JOIN products p ON p.category_id = c.id AND p.is_active = 1
                ${whereSql}
                GROUP BY c.id, c.name, c.description, c.parent_id, c.is_active, c.created_at, parent.name
                ORDER BY c.name ASC
            `;
            rows = await query(selectSql, params);
            paginationInfo = { page: 1, limit: total || 1, offset: 0 };
        } else {
            paginationInfo = paginate(page, limit);
            const selectSql = `
                SELECT 
                    c.id,
                    c.name,
                    c.description,
                    c.parent_id,
                    c.is_active,
                    c.created_at,
                    parent.name AS parent_name,
                    COUNT(p.id) AS product_count
                FROM categories c
                LEFT JOIN categories parent ON c.parent_id = parent.id
                LEFT JOIN products p ON p.category_id = c.id AND p.is_active = 1
                ${whereSql}
                GROUP BY c.id, c.name, c.description, c.parent_id, c.is_active, c.created_at, parent.name
                ORDER BY c.name ASC
                LIMIT ? OFFSET ?
            `;
            rows = await query(selectSql, [...params, paginationInfo.limit, paginationInfo.offset]);
        }

        return {
            categories: rows,
            total,
            page: paginationInfo.page,
            limit: paginationInfo.limit
        };
    },

    /**
     * Find category by ID with parent category and active products count
     * @param {number|string} id Category ID
     * @returns {Promise<Object|null>}
     */
    async findCategoryById(id) {
        const sql = `
            SELECT 
                c.id,
                c.name,
                c.description,
                c.parent_id,
                c.is_active,
                c.created_at,
                parent.name AS parent_name,
                COUNT(p.id) AS product_count
            FROM categories c
            LEFT JOIN categories parent ON c.parent_id = parent.id
            LEFT JOIN products p ON p.category_id = c.id AND p.is_active = 1
            WHERE c.id = ?
            GROUP BY c.id, c.name, c.description, c.parent_id, c.is_active, c.created_at, parent.name
        `;
        return await queryOne(sql, [id]);
    },

    /**
     * Find category by name (case-insensitive)
     * @param {string} name Category name
     * @param {number|null} excludeId Optional category ID to exclude
     * @returns {Promise<Object|null>}
     */
    async findCategoryByName(name, excludeId = null) {
        if (!name || !name.trim()) return null;
        let sql = 'SELECT * FROM categories WHERE LOWER(name) = LOWER(?)';
        const params = [name.trim()];
        if (excludeId) {
            sql += ' AND id != ?';
            params.push(excludeId);
        }
        return await queryOne(sql, params);
    },

    /**
     * Create a new category
     * @param {Object} categoryData Category details
     * @returns {Promise<Object>} Created category details
     */
    async createCategory(categoryData) {
        const sql = `
            INSERT INTO categories (name, description, parent_id, is_active)
            VALUES (?, ?, ?, ?)
        `;
        const params = [
            categoryData.name.trim(),
            categoryData.description !== undefined && categoryData.description !== '' ? categoryData.description : null,
            categoryData.parent_id ? parseInt(categoryData.parent_id, 10) : null,
            categoryData.is_active !== undefined ? (categoryData.is_active ? 1 : 0) : 1
        ];

        const insertId = await queryInsert(sql, params);
        return await this.findCategoryById(insertId);
    },

    /**
     * Update category
     * @param {number|string} id Category ID
     * @param {Object} categoryData Update details
     * @returns {Promise<Object>} Updated category details
     */
    async updateCategory(id, categoryData) {
        const updates = [];
        const params = [];

        if (categoryData.name !== undefined) {
            updates.push('name = ?');
            params.push(categoryData.name.trim());
        }

        if (categoryData.description !== undefined) {
            updates.push('description = ?');
            params.push(categoryData.description !== '' ? categoryData.description : null);
        }

        if (categoryData.parent_id !== undefined) {
            updates.push('parent_id = ?');
            params.push(categoryData.parent_id ? parseInt(categoryData.parent_id, 10) : null);
        }

        if (categoryData.is_active !== undefined) {
            updates.push('is_active = ?');
            params.push(categoryData.is_active ? 1 : 0);
        }

        if (updates.length === 0) {
            return await this.findCategoryById(id);
        }

        params.push(id);
        const sql = `UPDATE categories SET ${updates.join(', ')} WHERE id = ?`;
        await queryUpdate(sql, params);

        return await this.findCategoryById(id);
    },

    /**
     * Delete category (soft delete by setting is_active = 0)
     * @param {number|string} id Category ID
     * @returns {Promise<number>} Affected rows
     */
    async deleteCategory(id) {
        const sql = 'UPDATE categories SET is_active = 0 WHERE id = ?';
        return await queryUpdate(sql, [id]);
    },

    /**
     * Count products assigned to category
     * @param {number|string} categoryId Category ID
     * @returns {Promise<number>}
     */
    async countCategoryProducts(categoryId) {
        const sql = 'SELECT COUNT(*) AS total FROM products WHERE category_id = ? AND is_active = 1';
        const res = await queryOne(sql, [categoryId]);
        return res ? parseInt(res.total, 10) : 0;
    },

    // ============================================
    // BRAND METHODS
    // ============================================

    /**
     * Find all brands with optional search and pagination
     * @param {Object} options Query options
     * @returns {Promise<{ brands: Array, total: number, page: number, limit: number }>}
     */
    async findAllBrands(options = {}) {
        const {
            page = 1,
            limit = 20,
            search,
            is_active,
            all = false
        } = options;

        const whereClauses = [];
        const params = [];

        if (is_active !== undefined && is_active !== null && is_active !== '') {
            whereClauses.push('b.is_active = ?');
            params.push(is_active === true || is_active === 1 || is_active === '1' || is_active === 'true' ? 1 : 0);
        }

        if (search && search.trim()) {
            whereClauses.push('(b.name LIKE ? OR b.description LIKE ?)');
            const term = `%${search.trim()}%`;
            params.push(term, term);
        }

        const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

        const countSql = `SELECT COUNT(*) AS total FROM brands b ${whereSql}`;
        const countResult = await queryOne(countSql, params);
        const total = countResult ? parseInt(countResult.total, 10) : 0;

        let rows;
        let paginationInfo;

        if (all === true || all === 'true') {
            const selectSql = `
                SELECT 
                    b.id,
                    b.name,
                    b.description,
                    b.is_active,
                    b.created_at,
                    COUNT(p.id) AS product_count
                FROM brands b
                LEFT JOIN products p ON p.brand_id = b.id AND p.is_active = 1
                ${whereSql}
                GROUP BY b.id, b.name, b.description, b.is_active, b.created_at
                ORDER BY b.name ASC
            `;
            rows = await query(selectSql, params);
            paginationInfo = { page: 1, limit: total || 1, offset: 0 };
        } else {
            paginationInfo = paginate(page, limit);
            const selectSql = `
                SELECT 
                    b.id,
                    b.name,
                    b.description,
                    b.is_active,
                    b.created_at,
                    COUNT(p.id) AS product_count
                FROM brands b
                LEFT JOIN products p ON p.brand_id = b.id AND p.is_active = 1
                ${whereSql}
                GROUP BY b.id, b.name, b.description, b.is_active, b.created_at
                ORDER BY b.name ASC
                LIMIT ? OFFSET ?
            `;
            rows = await query(selectSql, [...params, paginationInfo.limit, paginationInfo.offset]);
        }

        return {
            brands: rows,
            total,
            page: paginationInfo.page,
            limit: paginationInfo.limit
        };
    },

    /**
     * Find brand by ID with active products count
     * @param {number|string} id Brand ID
     * @returns {Promise<Object|null>}
     */
    async findBrandById(id) {
        const sql = `
            SELECT 
                b.id,
                b.name,
                b.description,
                b.is_active,
                b.created_at,
                COUNT(p.id) AS product_count
            FROM brands b
            LEFT JOIN products p ON p.brand_id = b.id AND p.is_active = 1
            WHERE b.id = ?
            GROUP BY b.id, b.name, b.description, b.is_active, b.created_at
        `;
        return await queryOne(sql, [id]);
    },

    /**
     * Find brand by name (case-insensitive)
     * @param {string} name Brand name
     * @param {number|null} excludeId Optional brand ID to exclude
     * @returns {Promise<Object|null>}
     */
    async findBrandByName(name, excludeId = null) {
        if (!name || !name.trim()) return null;
        let sql = 'SELECT * FROM brands WHERE LOWER(name) = LOWER(?)';
        const params = [name.trim()];
        if (excludeId) {
            sql += ' AND id != ?';
            params.push(excludeId);
        }
        return await queryOne(sql, params);
    },

    /**
     * Create a new brand
     * @param {Object} brandData Brand details
     * @returns {Promise<Object>} Created brand details
     */
    async createBrand(brandData) {
        const sql = `
            INSERT INTO brands (name, description, is_active)
            VALUES (?, ?, ?)
        `;
        const params = [
            brandData.name.trim(),
            brandData.description !== undefined && brandData.description !== '' ? brandData.description : null,
            brandData.is_active !== undefined ? (brandData.is_active ? 1 : 0) : 1
        ];

        const insertId = await queryInsert(sql, params);
        return await this.findBrandById(insertId);
    },

    /**
     * Update brand
     * @param {number|string} id Brand ID
     * @param {Object} brandData Update details
     * @returns {Promise<Object>} Updated brand details
     */
    async updateBrand(id, brandData) {
        const updates = [];
        const params = [];

        if (brandData.name !== undefined) {
            updates.push('name = ?');
            params.push(brandData.name.trim());
        }

        if (brandData.description !== undefined) {
            updates.push('description = ?');
            params.push(brandData.description !== '' ? brandData.description : null);
        }

        if (brandData.is_active !== undefined) {
            updates.push('is_active = ?');
            params.push(brandData.is_active ? 1 : 0);
        }

        if (updates.length === 0) {
            return await this.findBrandById(id);
        }

        params.push(id);
        const sql = `UPDATE brands SET ${updates.join(', ')} WHERE id = ?`;
        await queryUpdate(sql, params);

        return await this.findBrandById(id);
    },

    /**
     * Delete brand (soft delete by setting is_active = 0)
     * @param {number|string} id Brand ID
     * @returns {Promise<number>} Affected rows
     */
    async deleteBrand(id) {
        const sql = 'UPDATE brands SET is_active = 0 WHERE id = ?';
        return await queryUpdate(sql, [id]);
    },

    /**
     * Count products assigned to brand
     * @param {number|string} brandId Brand ID
     * @returns {Promise<number>}
     */
    async countBrandProducts(brandId) {
        const sql = 'SELECT COUNT(*) AS total FROM products WHERE brand_id = ? AND is_active = 1';
        const res = await queryOne(sql, [brandId]);
        return res ? parseInt(res.total, 10) : 0;
    },

    // ============================================
    // STOCK MOVEMENT & AUDIT LOGGING HELPERS
    // ============================================

    /**
     * Record a stock movement entry in the database
     * @param {Object} movement Stock movement details
     * @returns {Promise<number|null>} Inserted ID or null
     */
    async recordStockMovement(movement) {
        try {
            const sql = `
                INSERT INTO stock_movements (
                    product_id,
                    movement_type,
                    quantity,
                    previous_stock,
                    new_stock,
                    cost_price,
                    reference_type,
                    reference_id,
                    notes,
                    created_by
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;
            const params = [
                movement.productId,
                movement.movementType,
                movement.quantity,
                movement.previousStock,
                movement.newStock,
                movement.costPrice !== undefined ? movement.costPrice : null,
                movement.referenceType || null,
                movement.referenceId || null,
                movement.notes || null,
                movement.userId || null
            ];
            return await queryInsert(sql, params);
        } catch (error) {
            console.error('⚠️ Failed to record stock movement:', error.message);
            return null;
        }
    },

    /**
     * Record an audit trail entry
     * @param {Object} auditData Audit log details
     * @returns {Promise<number|null>} Inserted ID or null
     */
    async recordAuditTrail(auditData) {
        try {
            const sql = `
                INSERT INTO audit_trail (
                    user_id,
                    user_name,
                    action,
                    module,
                    record_id,
                    old_values,
                    new_values,
                    ip_address,
                    description
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;
            const params = [
                auditData.userId || null,
                auditData.userName || null,
                auditData.action,
                auditData.module || 'products',
                auditData.recordId || null,
                auditData.oldValues ? JSON.stringify(auditData.oldValues) : null,
                auditData.newValues ? JSON.stringify(auditData.newValues) : null,
                auditData.ipAddress || null,
                auditData.description || null
            ];
            return await queryInsert(sql, params);
        } catch (error) {
            console.error('⚠️ Failed to record audit trail:', error.message);
            return null;
        }
    }
};

module.exports = ProductModel;
