// ============================================
// INVENTORY MODEL - Data Access Layer
// Khan Brothers Motorcycle Workshop ERP
// ============================================

const { query, queryOne, transaction } = require('../../config/database');
const { paginate, formatCurrency, nowSQL } = require('../../utils/helpers');
const { STOCK_MOVEMENT, AUDIT_ACTIONS } = require('../../utils/constants');

const inventoryModel = {

    /**
     * Get paginated stock levels for all products with filters
     * @param {Object} filters
     * @returns {Promise<Object>} { products, total, page, limit }
     */
    async getStockLevels(filters = {}) {
        const {
            page = 1,
            limit = 20,
            search = '',
            category_id = null,
            brand_id = null,
            product_type,
            location = '',
            stock_status = '',
            is_active = 1,
            sort_by = 'name',
            sort_order = 'ASC'
        } = filters;

        const { page: p, limit: l, offset } = paginate(page, limit);

        const conditions = [];
        const params = [];

        // Active status
        if (is_active !== null && is_active !== undefined && is_active !== '') {
            conditions.push('p.is_active = ?');
            params.push(parseInt(is_active, 10));
        }

        // Search by product name, SKU, or barcode
        if (search && search.trim() !== '') {
            conditions.push('(p.name LIKE ? OR p.sku LIKE ? OR p.barcode LIKE ?)');
            const term = `%${search.trim()}%`;
            params.push(term, term, term);
        }

        // Filter by category
        if (category_id) {
            conditions.push('p.category_id = ?');
            params.push(parseInt(category_id, 10));
        }

        if (product_type) {
            conditions.push('p.product_type = ?');
            params.push(product_type);
        }

        // Filter by brand
        if (brand_id) {
            conditions.push('p.brand_id = ?');
            params.push(parseInt(brand_id, 10));
        }

        // Filter by location
        if (location && location.trim() !== '') {
            conditions.push('p.location LIKE ?');
            params.push(`%${location.trim()}%`);
        }

        // Filter by stock status
        if (stock_status) {
            switch (stock_status.toLowerCase()) {
                case 'out_of_stock':
                    conditions.push('p.stock_quantity <= 0');
                    break;
                case 'needs_attention':
                    conditions.push('p.stock_quantity <= p.min_stock_level');
                    break;
                case 'low_stock':
                    conditions.push('p.stock_quantity > 0 AND p.stock_quantity <= p.min_stock_level');
                    break;
                case 'in_stock':
                    conditions.push('p.stock_quantity > 0 AND p.stock_quantity > p.min_stock_level AND (p.max_stock_level <= 0 OR p.stock_quantity <= p.max_stock_level)');
                    break;
                case 'overstocked':
                    conditions.push('p.max_stock_level > 0 AND p.stock_quantity > p.max_stock_level AND p.stock_quantity > p.min_stock_level');
                    break;
            }
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        // Safe sort column mapping
        const allowedSortColumns = {
            name: 'p.name',
            sku: 'p.sku',
            stock_quantity: 'p.stock_quantity',
            cost_price: 'p.cost_price',
            selling_price: 'p.selling_price',
            category: 'category_name',
            brand: 'brand_name',
            location: 'p.location',
            created_at: 'p.created_at'
        };

        const sortColumn = allowedSortColumns[sort_by] || 'p.name';
        const sortDirection = sort_order.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

        // Count query
        const countSql = `
            SELECT COUNT(*) AS total
            FROM products p
            LEFT JOIN categories c ON p.category_id = c.id
            LEFT JOIN brands b ON p.brand_id = b.id
            ${whereClause}
        `;
        const countRow = await queryOne(countSql, params);
        const total = countRow ? parseInt(countRow.total, 10) : 0;

        // Data query
        const dataSql = `
            SELECT 
                p.id,
                p.sku,
                p.name,
                p.product_type,
                p.motorcycle_condition,
                p.description,
                p.category_id,
                c.name AS category_name,
                p.brand_id,
                b.name AS brand_name,
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
                ROUND(p.stock_quantity * p.cost_price, 2) AS total_cost_value,
                ROUND(p.stock_quantity * p.selling_price, 2) AS total_retail_value,
                CASE
                    WHEN p.stock_quantity <= 0 THEN 'out_of_stock'
                    WHEN p.stock_quantity <= p.min_stock_level THEN 'low_stock'
                    WHEN p.max_stock_level > 0 AND p.stock_quantity > p.max_stock_level THEN 'overstocked'
                    ELSE 'in_stock'
                END AS stock_status
            FROM products p
            LEFT JOIN categories c ON p.category_id = c.id
            LEFT JOIN brands b ON p.brand_id = b.id
            ${whereClause}
            ORDER BY ${sortColumn} ${sortDirection}
            LIMIT ${l} OFFSET ${offset}
        `;

        const products = await query(dataSql, params);

        return {
            products,
            total,
            page: p,
            limit: l
        };
    },

    /**
     * Get stock details for a single product including stats and recent movements
     * @param {number} productId
     * @returns {Promise<Object|null>}
     */
    async getProductStock(productId) {
        const productSql = `
            SELECT 
                p.id,
                p.sku,
                p.name,
                p.description,
                p.category_id,
                c.name AS category_name,
                p.brand_id,
                b.name AS brand_name,
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
                ROUND(p.stock_quantity * p.cost_price, 2) AS total_cost_value,
                ROUND(p.stock_quantity * p.selling_price, 2) AS total_retail_value,
                ROUND(p.stock_quantity * (p.selling_price - p.cost_price), 2) AS potential_profit,
                CASE
                    WHEN p.stock_quantity <= 0 THEN 'out_of_stock'
                    WHEN p.stock_quantity <= p.min_stock_level THEN 'low_stock'
                    WHEN p.max_stock_level > 0 AND p.stock_quantity > p.max_stock_level THEN 'overstocked'
                    ELSE 'in_stock'
                END AS stock_status
            FROM products p
            LEFT JOIN categories c ON p.category_id = c.id
            LEFT JOIN brands b ON p.brand_id = b.id
            WHERE p.id = ?
        `;

        const product = await queryOne(productSql, [productId]);
        if (!product) return null;

        // Stock movement statistics for this product
        const statsSql = `
            SELECT 
                COUNT(*) AS total_movements,
                COALESCE(SUM(CASE WHEN movement_type IN ('purchase', 'return_in') THEN quantity ELSE 0 END), 0) AS total_in,
                COALESCE(SUM(CASE WHEN movement_type IN ('sale', 'return_out', 'workshop_use', 'damage') THEN quantity ELSE 0 END), 0) AS total_out,
                COALESCE(SUM(CASE WHEN movement_type = 'adjustment' AND new_stock > previous_stock THEN (new_stock - previous_stock) ELSE 0 END), 0) AS total_adjusted_in,
                COALESCE(SUM(CASE WHEN movement_type = 'adjustment' AND new_stock < previous_stock THEN (previous_stock - new_stock) ELSE 0 END), 0) AS total_adjusted_out,
                MAX(created_at) AS last_movement_date
            FROM stock_movements
            WHERE product_id = ?
        `;
        const stats = await queryOne(statsSql, [productId]);

        // Recent 10 movements for this product
        const recentMovementsSql = `
            SELECT 
                sm.id,
                sm.product_id,
                sm.movement_type,
                sm.movement_type AS type,
                sm.quantity,
                sm.previous_stock,
                sm.new_stock,
                sm.cost_price,
                ROUND(sm.quantity * COALESCE(sm.cost_price, 0), 2) AS total_cost,
                sm.reference_type,
                sm.reference_id,
                sm.notes,
                sm.created_by,
                u.name AS created_by_name,
                sm.created_at
            FROM stock_movements sm
            LEFT JOIN users u ON sm.created_by = u.id
            WHERE sm.product_id = ?
            ORDER BY sm.created_at DESC, sm.id DESC
            LIMIT 10
        `;
        const recentMovements = await query(recentMovementsSql, [productId]);

        return {
            ...product,
            statistics: {
                total_movements: stats ? parseInt(stats.total_movements, 10) : 0,
                total_in: stats ? parseInt(stats.total_in, 10) + parseInt(stats.total_adjusted_in, 10) : 0,
                total_out: stats ? parseInt(stats.total_out, 10) + parseInt(stats.total_adjusted_out, 10) : 0,
                last_movement_date: stats ? stats.last_movement_date : null
            },
            recent_movements: recentMovements
        };
    },

    /**
     * Stock adjustment: updates product stock_quantity and creates a stock_movement record atomically
     * @param {Object} adjustmentData
     * @returns {Promise<Object>}
     */
    async adjustStock(adjustmentData) {
        const {
            product_id,
            quantity,
            adjustment_type = 'increase',
            movement_type = STOCK_MOVEMENT.ADJUSTMENT,
            notes = '',
            cost_price = null,
            reference_type = 'manual_adjustment',
            reference_id = null,
            created_by = null,
            user_name = '',
            ip_address = ''
        } = adjustmentData;

        return await transaction(async (connection) => {
            // 1. Fetch current product with lock
            const [productRows] = await connection.execute(
                `SELECT id, sku, name, cost_price, selling_price, stock_quantity, min_stock_level, max_stock_level, unit, motorcycle_condition
                 FROM products 
                 WHERE id = ? 
                 FOR UPDATE`,
                [product_id]
            );

            if (!productRows || productRows.length === 0) {
                const error = new Error(`Product with ID ${product_id} not found`);
                error.statusCode = 404;
                throw error;
            }

            const product = productRows[0];
            if (product.motorcycle_condition === 'used') {
                throw Object.assign(new Error('Used motorcycles use their own stock workflow.'), { statusCode: 409 });
            }
            const previousStock = parseInt(product.stock_quantity, 10) || 0;
            const parsedQuantity = parseInt(quantity, 10);

            if (isNaN(parsedQuantity)) {
                const error = new Error('Invalid adjustment quantity provided');
                error.statusCode = 400;
                throw error;
            }

            let newStock = previousStock;
            let moveQuantity = Math.abs(parsedQuantity);

            // Calculate new stock based on adjustment_type
            const normalizedType = (adjustment_type || '').toLowerCase();

            if (normalizedType === 'increase' || normalizedType === 'add') {
                if (parsedQuantity <= 0) {
                    const error = new Error('Increase quantity must be greater than zero');
                    error.statusCode = 400;
                    throw error;
                }
                newStock = previousStock + moveQuantity;
            } else if (normalizedType === 'decrease' || normalizedType === 'subtract' || normalizedType === 'deduct') {
                if (parsedQuantity <= 0) {
                    const error = new Error('Decrease quantity must be greater than zero');
                    error.statusCode = 400;
                    throw error;
                }
                if (previousStock < moveQuantity) {
                    const error = new Error(`Cannot decrease stock below zero. Current stock is ${previousStock}, requested deduction is ${moveQuantity}.`);
                    error.statusCode = 400;
                    throw error;
                }
                newStock = previousStock - moveQuantity;
            } else if (normalizedType === 'set' || normalizedType === 'exact') {
                if (parsedQuantity < 0) {
                    const error = new Error('Target stock quantity cannot be negative');
                    error.statusCode = 400;
                    throw error;
                }
                newStock = parsedQuantity;
                moveQuantity = Math.abs(newStock - previousStock);
            } else {
                // If no explicit adjustment_type, treat signed quantity directly
                newStock = previousStock + parsedQuantity;
                if (newStock < 0) {
                    const error = new Error(`Cannot reduce stock below zero. Current stock is ${previousStock}, adjustment would result in ${newStock}.`);
                    error.statusCode = 400;
                    throw error;
                }
                moveQuantity = Math.abs(parsedQuantity);
            }

            // Valid movement_type check
            const validMovementTypes = [
                STOCK_MOVEMENT.PURCHASE,
                STOCK_MOVEMENT.SALE,
                STOCK_MOVEMENT.RETURN_IN,
                STOCK_MOVEMENT.RETURN_OUT,
                STOCK_MOVEMENT.ADJUSTMENT,
                STOCK_MOVEMENT.WORKSHOP_USE,
                STOCK_MOVEMENT.DAMAGE
            ];
            const selectedMovementType = validMovementTypes.includes(movement_type)
                ? movement_type
                : STOCK_MOVEMENT.ADJUSTMENT;

            // Unit cost price (fallback to product's current cost price)
            const unitCost = cost_price !== null && cost_price !== undefined && !isNaN(parseFloat(cost_price))
                ? parseFloat(cost_price)
                : parseFloat(product.cost_price || 0);

            // 2. Update product stock_quantity
            await connection.execute(
                `UPDATE products 
                 SET stock_quantity = ?, updated_at = NOW() 
                 WHERE id = ?`,
                [newStock, product_id]
            );

            // 3. Create stock_movement record
            const [movementResult] = await connection.execute(
                `INSERT INTO stock_movements 
                 (product_id, movement_type, quantity, previous_stock, new_stock, cost_price, reference_type, reference_id, notes, created_by)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    product_id,
                    selectedMovementType,
                    moveQuantity,
                    previousStock,
                    newStock,
                    unitCost,
                    reference_type,
                    reference_id,
                    notes || null,
                    created_by || null
                ]
            );

            const movementId = movementResult.insertId;

            // 4. Record audit trail if possible
            try {
                const actionDesc = `Stock adjusted for product #${product.id} (${product.name}): ` +
                    `previous stock ${previousStock}, new stock ${newStock} ` +
                    `(${normalizedType} ${moveQuantity} via ${selectedMovementType}). Reason: ${notes || 'N/A'}`;

                await connection.execute(
                    `INSERT INTO audit_trail 
                     (user_id, user_name, action, module, record_id, old_values, new_values, ip_address, description)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        created_by || null,
                        user_name || null,
                        AUDIT_ACTIONS.STOCK_ADJUST,
                        'inventory',
                        movementId,
                        JSON.stringify({ stock_quantity: previousStock, cost_price: product.cost_price }),
                        JSON.stringify({ stock_quantity: newStock, movement_id: movementId, type: selectedMovementType, quantity: moveQuantity, notes }),
                        ip_address || null,
                        actionDesc
                    ]
                );
            } catch (auditErr) {
                // Non-blocking for audit table insertion
                console.warn('Audit trail log warning:', auditErr.message);
            }

            return {
                movement: {
                    id: movementId,
                    product_id,
                    movement_type: selectedMovementType,
                    type: selectedMovementType,
                    quantity: moveQuantity,
                    previous_stock: previousStock,
                    new_stock: newStock,
                    cost_price: unitCost,
                    reference_type,
                    reference_id,
                    notes,
                    created_by,
                    created_at: nowSQL()
                },
                product: {
                    id: product.id,
                    sku: product.sku,
                    name: product.name,
                    previous_stock: previousStock,
                    current_stock: newStock,
                    stock_quantity: newStock,
                    unit: product.unit
                }
            };
        });
    },

    /**
     * Get stock movement history with filters and pagination
     * @param {Object} filters
     * @returns {Promise<Object>} { movements, total, page, limit }
     */
    async getMovements(filters = {}) {
        const {
            page = 1,
            limit = 20,
            product_id = null,
            movement_type = '',
            type = '',
            start_date = '',
            end_date = '',
            reference_type = '',
            reference_id = null,
            created_by = null,
            search = ''
        } = filters;

        const { page: p, limit: l, offset } = paginate(page, limit);

        const conditions = [];
        const params = [];

        // Product filter
        if (product_id) {
            conditions.push('sm.product_id = ?');
            params.push(parseInt(product_id, 10));
        }

        // Movement type filter (supports both movement_type and type)
        const selectedType = movement_type || type;
        if (selectedType && selectedType.trim() !== '') {
            conditions.push('sm.movement_type = ?');
            params.push(selectedType.trim());
        }

        // Date range filters
        if (start_date && start_date.trim() !== '') {
            conditions.push('DATE(sm.created_at) >= ?');
            params.push(start_date.trim());
        }

        if (end_date && end_date.trim() !== '') {
            conditions.push('DATE(sm.created_at) <= ?');
            params.push(end_date.trim());
        }

        // Reference filters
        if (reference_type && reference_type.trim() !== '') {
            conditions.push('sm.reference_type = ?');
            params.push(reference_type.trim());
        }

        if (reference_id) {
            conditions.push('sm.reference_id = ?');
            params.push(parseInt(reference_id, 10));
        }

        // Created by user filter
        if (created_by) {
            conditions.push('sm.created_by = ?');
            params.push(parseInt(created_by, 10));
        }

        // Text search on product name, sku, notes
        if (search && search.trim() !== '') {
            conditions.push('(p.name LIKE ? OR p.sku LIKE ? OR sm.notes LIKE ?)');
            const term = `%${search.trim()}%`;
            params.push(term, term, term);
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        // Count query
        const countSql = `
            SELECT COUNT(*) AS total
            FROM stock_movements sm
            JOIN products p ON sm.product_id = p.id
            LEFT JOIN users u ON sm.created_by = u.id
            ${whereClause}
        `;
        const countRow = await queryOne(countSql, params);
        const total = countRow ? parseInt(countRow.total, 10) : 0;

        // Data query
        const dataSql = `
            SELECT 
                sm.id,
                sm.product_id,
                p.sku AS product_sku,
                p.name AS product_name,
                p.unit AS product_unit,
                sm.movement_type,
                sm.movement_type AS type,
                sm.quantity,
                sm.previous_stock,
                sm.new_stock,
                sm.cost_price,
                ROUND(sm.quantity * COALESCE(sm.cost_price, p.cost_price, 0), 2) AS total_cost,
                sm.reference_type,
                sm.reference_id,
                sm.notes,
                sm.created_by,
                u.name AS created_by_name,
                u.email AS created_by_email,
                sm.created_at
            FROM stock_movements sm
            JOIN products p ON sm.product_id = p.id
            LEFT JOIN users u ON sm.created_by = u.id
            ${whereClause}
            ORDER BY sm.created_at DESC, sm.id DESC
            LIMIT ${l} OFFSET ${offset}
        `;

        const movements = await query(dataSql, params);

        return {
            movements,
            total,
            page: p,
            limit: l
        };
    },

    /**
     * Get stock movements for a specific product
     * @param {number} productId
     * @param {Object} filters
     * @returns {Promise<Object>}
     */
    async getProductMovements(productId, filters = {}) {
        return await this.getMovements({
            ...filters,
            product_id: productId
        });
    },

    /**
     * Get products below minimum stock level
     * @param {Object} filters
     * @returns {Promise<Object>} { products, total, page, limit, summary }
     */
    async getLowStockProducts(filters = {}) {
        const {
            page = 1,
            limit = 20,
            category_id = null,
            brand_id = null,
            search = '',
            out_of_stock_only = false
        } = filters;

        const { page: p, limit: l, offset } = paginate(page, limit);

        const conditions = ['p.is_active = 1'];
        const params = [];

        if (out_of_stock_only === true || out_of_stock_only === 'true') {
            conditions.push('p.stock_quantity <= 0');
        } else {
            conditions.push('p.stock_quantity <= p.min_stock_level');
        }

        if (category_id) {
            conditions.push('p.category_id = ?');
            params.push(parseInt(category_id, 10));
        }

        if (brand_id) {
            conditions.push('p.brand_id = ?');
            params.push(parseInt(brand_id, 10));
        }

        if (search && search.trim() !== '') {
            conditions.push('(p.name LIKE ? OR p.sku LIKE ? OR p.barcode LIKE ?)');
            const term = `%${search.trim()}%`;
            params.push(term, term, term);
        }

        const whereClause = `WHERE ${conditions.join(' AND ')}`;

        // Summary statistics across all low stock items matching criteria
        const summarySql = `
            SELECT 
                COUNT(*) AS total_low_stock_items,
                COALESCE(SUM(CASE WHEN p.stock_quantity <= 0 THEN 1 ELSE 0 END), 0) AS out_of_stock_items,
                COALESCE(SUM(GREATEST(0, p.max_stock_level - p.stock_quantity)), 0) AS total_reorder_units,
                COALESCE(SUM(GREATEST(0, p.max_stock_level - p.stock_quantity) * p.cost_price), 0.00) AS total_estimated_reorder_cost
            FROM products p
            LEFT JOIN categories c ON p.category_id = c.id
            LEFT JOIN brands b ON p.brand_id = b.id
            ${whereClause}
        `;
        const summaryRow = await queryOne(summarySql, params);

        const total = summaryRow ? parseInt(summaryRow.total_low_stock_items, 10) : 0;
        const totalReorderCost = summaryRow ? parseFloat(summaryRow.total_estimated_reorder_cost) : 0;

        // Data query
        const dataSql = `
            SELECT 
                p.id,
                p.sku,
                p.name,
                p.category_id,
                c.name AS category_name,
                p.brand_id,
                b.name AS brand_name,
                p.cost_price,
                p.selling_price,
                p.stock_quantity,
                p.min_stock_level,
                p.max_stock_level,
                p.unit,
                p.location,
                p.barcode,
                (p.min_stock_level - p.stock_quantity) AS deficit,
                GREATEST(0, p.max_stock_level - p.stock_quantity) AS suggested_reorder_quantity,
                ROUND(GREATEST(0, p.max_stock_level - p.stock_quantity) * p.cost_price, 2) AS estimated_reorder_cost,
                CASE 
                    WHEN p.stock_quantity <= 0 THEN 'out_of_stock'
                    ELSE 'low_stock'
                END AS alert_level
            FROM products p
            LEFT JOIN categories c ON p.category_id = c.id
            LEFT JOIN brands b ON p.brand_id = b.id
            ${whereClause}
            ORDER BY (p.stock_quantity - p.min_stock_level) ASC, p.stock_quantity ASC
            LIMIT ${l} OFFSET ${offset}
        `;

        const products = await query(dataSql, params);

        return {
            products,
            total,
            page: p,
            limit: l,
            summary: {
                total_low_stock_items: total,
                out_of_stock_items: summaryRow ? parseInt(summaryRow.out_of_stock_items, 10) : 0,
                total_reorder_units: summaryRow ? parseInt(summaryRow.total_reorder_units, 10) : 0,
                total_estimated_reorder_cost: totalReorderCost,
                formatted_estimated_reorder_cost: formatCurrency(totalReorderCost)
            }
        };
    },

    /**
     * Get inventory valuation: total cost, retail value, potential profit, and breakdowns
     * @param {Object} filters
     * @returns {Promise<Object>}
     */
    async getInventoryValuation(filters = {}) {
        const { category_id = null, brand_id = null } = filters;

        const conditions = ['p.is_active = 1'];
        const params = [];

        if (category_id) {
            conditions.push('p.category_id = ?');
            params.push(parseInt(category_id, 10));
        }

        if (brand_id) {
            conditions.push('p.brand_id = ?');
            params.push(parseInt(brand_id, 10));
        }

        const whereClause = `WHERE ${conditions.join(' AND ')}`;

        // 1. Overall valuation totals
        const overallSql = `
            SELECT 
                COUNT(DISTINCT p.id) AS total_products,
                COALESCE(SUM(p.stock_quantity), 0) AS total_quantity,
                COALESCE(SUM(CASE WHEN p.stock_quantity > 0 THEN p.stock_quantity ELSE 0 END), 0) AS positive_quantity,
                COALESCE(SUM(p.stock_quantity * p.cost_price), 0.00) AS total_cost_value,
                COALESCE(SUM(p.stock_quantity * p.selling_price), 0.00) AS total_retail_value,
                COALESCE(SUM(p.stock_quantity * (p.selling_price - p.cost_price)), 0.00) AS potential_profit
            FROM products p
            ${whereClause}
        `;
        const overall = await queryOne(overallSql, params);

        const totalCostValue = overall ? parseFloat(overall.total_cost_value) : 0.00;
        const totalRetailValue = overall ? parseFloat(overall.total_retail_value) : 0.00;
        const potentialProfit = overall ? parseFloat(overall.potential_profit) : 0.00;
        const profitMarginPercentage = totalRetailValue > 0
            ? ((potentialProfit / totalRetailValue) * 100).toFixed(2)
            : '0.00';

        // 2. Valuation breakdown by category
        const categoryBreakdownSql = `
            SELECT 
                COALESCE(c.id, 0) AS category_id,
                COALESCE(c.name, 'Uncategorized') AS category_name,
                COUNT(p.id) AS product_count,
                COALESCE(SUM(p.stock_quantity), 0) AS total_quantity,
                ROUND(COALESCE(SUM(p.stock_quantity * p.cost_price), 0.00), 2) AS total_cost_value,
                ROUND(COALESCE(SUM(p.stock_quantity * p.selling_price), 0.00), 2) AS total_retail_value,
                ROUND(COALESCE(SUM(p.stock_quantity * (p.selling_price - p.cost_price)), 0.00), 2) AS potential_profit
            FROM products p
            LEFT JOIN categories c ON p.category_id = c.id
            ${whereClause}
            GROUP BY c.id, c.name
            ORDER BY total_cost_value DESC
        `;
        const categoryBreakdown = await query(categoryBreakdownSql, params);

        // 3. Valuation breakdown by brand
        const brandBreakdownSql = `
            SELECT 
                COALESCE(b.id, 0) AS brand_id,
                COALESCE(b.name, 'Unbranded') AS brand_name,
                COUNT(p.id) AS product_count,
                COALESCE(SUM(p.stock_quantity), 0) AS total_quantity,
                ROUND(COALESCE(SUM(p.stock_quantity * p.cost_price), 0.00), 2) AS total_cost_value,
                ROUND(COALESCE(SUM(p.stock_quantity * p.selling_price), 0.00), 2) AS total_retail_value,
                ROUND(COALESCE(SUM(p.stock_quantity * (p.selling_price - p.cost_price)), 0.00), 2) AS potential_profit
            FROM products p
            LEFT JOIN brands b ON p.brand_id = b.id
            ${whereClause}
            GROUP BY b.id, b.name
            ORDER BY total_cost_value DESC
        `;
        const brandBreakdown = await query(brandBreakdownSql, params);

        // 4. Top 10 highest value stock items
        const topValuedItemsSql = `
            SELECT 
                p.id,
                p.sku,
                p.name,
                c.name AS category_name,
                b.name AS brand_name,
                p.stock_quantity,
                p.unit,
                p.cost_price,
                p.selling_price,
                ROUND(p.stock_quantity * p.cost_price, 2) AS total_cost_value,
                ROUND(p.stock_quantity * p.selling_price, 2) AS total_retail_value
            FROM products p
            LEFT JOIN categories c ON p.category_id = c.id
            LEFT JOIN brands b ON p.brand_id = b.id
            ${whereClause} AND p.stock_quantity > 0
            ORDER BY (p.stock_quantity * p.cost_price) DESC
            LIMIT 10
        `;
        const topValuedItems = await query(topValuedItemsSql, params);

        return {
            summary: {
                total_products: overall ? parseInt(overall.total_products, 10) : 0,
                total_quantity: overall ? parseInt(overall.total_quantity, 10) : 0,
                positive_quantity: overall ? parseInt(overall.positive_quantity, 10) : 0,
                total_cost_value: totalCostValue,
                total_retail_value: totalRetailValue,
                potential_profit: potentialProfit,
                profit_margin_percentage: parseFloat(profitMarginPercentage),
                formatted_cost_value: formatCurrency(totalCostValue),
                formatted_retail_value: formatCurrency(totalRetailValue),
                formatted_potential_profit: formatCurrency(potentialProfit)
            },
            by_category: categoryBreakdown,
            by_brand: brandBreakdown,
            top_valuable_items: topValuedItems
        };
    },

    /**
     * Stock audit report: Compares current recorded stock against movements to verify integrity
     * @param {Object} filters
     * @returns {Promise<Object>} { items, total, page, limit, summary }
     */
    async getStockAuditReport(filters = {}) {
        const {
            page = 1,
            limit = 20,
            category_id = null,
            brand_id = null,
            search = '',
            discrepancy_only = false
        } = filters;

        const { page: p, limit: l, offset } = paginate(page, limit);

        const conditions = ['p.is_active = 1'];
        const params = [];

        if (category_id) {
            conditions.push('p.category_id = ?');
            params.push(parseInt(category_id, 10));
        }

        if (brand_id) {
            conditions.push('p.brand_id = ?');
            params.push(parseInt(brand_id, 10));
        }

        if (search && search.trim() !== '') {
            conditions.push('(p.name LIKE ? OR p.sku LIKE ? OR p.barcode LIKE ?)');
            const term = `%${search.trim()}%`;
            params.push(term, term, term);
        }

        const whereClause = `WHERE ${conditions.join(' AND ')}`;

        // Query correlating products with movements
        // In an ERP, the latest recorded movement's new_stock reflects the expected balance from transactions.
        const auditQuery = `
            SELECT 
                p.id,
                p.sku,
                p.name,
                p.unit,
                p.location,
                c.name AS category_name,
                b.name AS brand_name,
                p.cost_price,
                p.selling_price,
                p.stock_quantity AS system_stock,
                COALESCE(latest_sm.new_stock, p.stock_quantity) AS expected_movement_stock,
                (p.stock_quantity - COALESCE(latest_sm.new_stock, p.stock_quantity)) AS discrepancy,
                ROUND(ABS(p.stock_quantity - COALESCE(latest_sm.new_stock, p.stock_quantity)) * p.cost_price, 2) AS discrepancy_value,
                COALESCE(sm_counts.total_movements, 0) AS total_movements,
                sm_counts.last_movement_at,
                latest_sm.movement_type AS last_movement_type
            FROM products p
            LEFT JOIN categories c ON p.category_id = c.id
            LEFT JOIN brands b ON p.brand_id = b.id
            LEFT JOIN (
                SELECT product_id, COUNT(*) AS total_movements, MAX(created_at) AS last_movement_at, MAX(id) AS max_movement_id
                FROM stock_movements
                GROUP BY product_id
            ) sm_counts ON p.id = sm_counts.product_id
            LEFT JOIN stock_movements latest_sm ON sm_counts.max_movement_id = latest_sm.id
            ${whereClause}
        `;

        // If discrepancy_only requested
        const finalAuditQuery = (discrepancy_only === true || discrepancy_only === 'true')
            ? `SELECT * FROM (${auditQuery}) AS audit_data WHERE audit_data.discrepancy != 0`
            : auditQuery;

        // Count query
        const countSql = `SELECT COUNT(*) AS total FROM (${finalAuditQuery}) AS count_tbl`;
        const countRow = await queryOne(countSql, params);
        const total = countRow ? parseInt(countRow.total, 10) : 0;

        // Paginated data query
        const paginatedDataSql = `
            SELECT * FROM (${finalAuditQuery}) AS audit_tbl
            ORDER BY ABS(discrepancy) DESC, name ASC
            LIMIT ${l} OFFSET ${offset}
        `;
        const items = await query(paginatedDataSql, params);

        // Map status for presentation
        const mappedItems = items.map(item => ({
            ...item,
            audit_status: item.discrepancy === 0 ? 'balanced' : 'discrepancy',
            formatted_cost_price: formatCurrency(item.cost_price),
            formatted_discrepancy_value: formatCurrency(item.discrepancy_value)
        }));

        // Summary counts
        const allAuditedSql = `
            SELECT 
                COUNT(*) AS total_items,
                COALESCE(SUM(CASE WHEN discrepancy = 0 THEN 1 ELSE 0 END), 0) AS balanced_items,
                COALESCE(SUM(CASE WHEN discrepancy != 0 THEN 1 ELSE 0 END), 0) AS discrepancy_items,
                COALESCE(SUM(discrepancy_value), 0.00) AS total_discrepancy_cost
            FROM (${finalAuditQuery}) AS sum_tbl
        `;
        const auditSummaryRow = await queryOne(allAuditedSql, params);

        const totalDiscrepancyCost = auditSummaryRow ? parseFloat(auditSummaryRow.total_discrepancy_cost) : 0;

        return {
            items: mappedItems,
            total,
            page: p,
            limit: l,
            summary: {
                total_audited: auditSummaryRow ? parseInt(auditSummaryRow.total_items, 10) : 0,
                balanced_items: auditSummaryRow ? parseInt(auditSummaryRow.balanced_items, 10) : 0,
                discrepancy_items: auditSummaryRow ? parseInt(auditSummaryRow.discrepancy_items, 10) : 0,
                total_discrepancy_cost: totalDiscrepancyCost,
                formatted_discrepancy_cost: formatCurrency(totalDiscrepancyCost)
            }
        };
    },

    /**
     * Check if a single product exists
     * @param {number} productId
     * @returns {Promise<Object|null>}
     */
    async getProductById(productId) {
        return await queryOne(
            `SELECT id, sku, name, cost_price, selling_price, stock_quantity, min_stock_level, unit, is_active
             FROM products 
             WHERE id = ?`,
            [productId]
        );
    }
};

module.exports = inventoryModel;
