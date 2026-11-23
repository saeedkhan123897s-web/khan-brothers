// ============================================
// SUPPLIER MODEL
// Khan Brothers Motorcycle Workshop ERP
// ============================================

const { query, queryInsert, queryUpdate, queryOne, transaction } = require('../../config/database');
const { paginate, paginationResponse, formatCurrency } = require('../../utils/helpers');

const SupplierModel = {
    /**
     * Find all suppliers with filtering, searching, sorting, and pagination
     * @param {Object} options
     * @returns {Promise<{data: Array, total: number, page: number, limit: number}>}
     */
    async findAll({
        page = 1,
        limit = 20,
        search = '',
        city = '',
        isActive = null,
        paymentTerms = '',
        sortBy = 'created_at',
        sortOrder = 'DESC'
    } = {}) {
        const { page: p, limit: l, offset } = paginate(page, limit);
        const whereClauses = [];
        const params = [];

        // Search across name, company_name, phone, and email
        if (search && search.trim()) {
            const term = `%${search.trim()}%`;
            whereClauses.push('(name LIKE ? OR company_name LIKE ? OR phone LIKE ? OR email LIKE ?)');
            params.push(term, term, term, term);
        }

        // City filter
        if (city && city.trim()) {
            whereClauses.push('city = ?');
            params.push(city.trim());
        }

        // Payment terms filter
        if (paymentTerms && paymentTerms.trim()) {
            whereClauses.push('payment_terms = ?');
            params.push(paymentTerms.trim());
        }

        // Active status filter (supports boolean, 1/0, or 'all')
        if (isActive !== null && isActive !== undefined && isActive !== '' && isActive !== 'all') {
            const activeVal = (isActive === true || isActive === 'true' || isActive === 1 || isActive === '1') ? 1 : 0;
            whereClauses.push('is_active = ?');
            params.push(activeVal);
        }

        const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

        // Safe sort column mapping to prevent SQL injection
        const allowedSortColumns = {
            id: 'id',
            name: 'name',
            company_name: 'company_name',
            email: 'email',
            phone: 'phone',
            city: 'city',
            payment_terms: 'payment_terms',
            outstanding_balance: 'outstanding_balance',
            total_supplies: 'total_supplies',
            is_active: 'is_active',
            created_at: 'created_at',
            updated_at: 'updated_at'
        };

        const sortColumn = allowedSortColumns[sortBy] || 'created_at';
        const order = sortOrder && sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

        // Count total matching records
        const countSql = `SELECT COUNT(*) as total FROM suppliers ${whereSql}`;
        const countResult = await queryOne(countSql, params);
        const total = countResult ? Number(countResult.total) : 0;

        // Fetch paginated suppliers
        const dataSql = `
            SELECT 
                id,
                name,
                company_name,
                email,
                phone,
                address,
                city,
                payment_terms,
                outstanding_balance,
                total_supplies,
                notes,
                is_active,
                created_at,
                updated_at
            FROM suppliers
            ${whereSql}
            ORDER BY ${sortColumn} ${order}, id DESC
            LIMIT ${l} OFFSET ${offset}
        `;

        const rows = await query(dataSql, params);

        return {
            data: rows,
            total,
            page: p,
            limit: l
        };
    },

    /**
     * Find supplier by ID
     * @param {number|string} id
     * @returns {Promise<Object|null>}
     */
    async findById(id) {
        const sql = `
            SELECT 
                id,
                name,
                company_name,
                email,
                phone,
                address,
                city,
                payment_terms,
                outstanding_balance,
                total_supplies,
                notes,
                is_active,
                created_at,
                updated_at
            FROM suppliers
            WHERE id = ?
        `;
        return await queryOne(sql, [id]);
    },

    /**
     * Find supplier by ID with aggregated purchase history summary and recent purchases
     * @param {number|string} id
     * @returns {Promise<Object|null>}
     */
    async findByIdWithSummary(id) {
        const supplier = await this.findById(id);
        if (!supplier) return null;

        // Purchase history summary
        const summarySql = `
            SELECT 
                COUNT(*) as total_orders,
                COALESCE(SUM(total_amount), 0.00) as total_purchased,
                COALESCE(SUM(amount_paid), 0.00) as total_paid,
                COALESCE(SUM(amount_due), 0.00) as total_due,
                COALESCE(SUM(CASE WHEN payment_status = 'pending' THEN 1 ELSE 0 END), 0) as pending_bills_count,
                COALESCE(SUM(CASE WHEN payment_status = 'partial' THEN 1 ELSE 0 END), 0) as partial_bills_count,
                COALESCE(SUM(CASE WHEN payment_status = 'paid' THEN 1 ELSE 0 END), 0) as paid_bills_count,
                COALESCE(SUM(CASE WHEN payment_status = 'overdue' THEN 1 ELSE 0 END), 0) as overdue_bills_count,
                COALESCE(SUM(CASE WHEN status = 'received' THEN 1 ELSE 0 END), 0) as received_orders_count,
                COALESCE(SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END), 0) as pending_orders_count,
                COALESCE(SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END), 0) as cancelled_orders_count,
                MAX(purchase_date) as last_purchase_date
            FROM purchases
            WHERE supplier_id = ?
        `;
        const summary = await queryOne(summarySql, [id]);

        // Recent 5 purchases
        const recentSql = `
            SELECT 
                id,
                purchase_number,
                purchase_date,
                subtotal,
                discount_amount,
                shipping_cost,
                total_amount,
                amount_paid,
                amount_due,
                payment_method,
                payment_status,
                status,
                created_at
            FROM purchases
            WHERE supplier_id = ?
            ORDER BY purchase_date DESC, id DESC
            LIMIT 5
        `;
        const recentPurchases = await query(recentSql, [id]);

        return {
            ...supplier,
            formatted_outstanding_balance: formatCurrency(supplier.outstanding_balance),
            formatted_total_supplies: formatCurrency(supplier.total_supplies),
            purchase_summary: {
                total_orders: Number(summary?.total_orders || 0),
                total_purchased: parseFloat(summary?.total_purchased || 0).toFixed(2),
                total_paid: parseFloat(summary?.total_paid || 0).toFixed(2),
                total_due: parseFloat(summary?.total_due || 0).toFixed(2),
                formatted_total_purchased: formatCurrency(summary?.total_purchased || 0),
                formatted_total_paid: formatCurrency(summary?.total_paid || 0),
                formatted_total_due: formatCurrency(summary?.total_due || 0),
                pending_bills_count: Number(summary?.pending_bills_count || 0),
                partial_bills_count: Number(summary?.partial_bills_count || 0),
                paid_bills_count: Number(summary?.paid_bills_count || 0),
                overdue_bills_count: Number(summary?.overdue_bills_count || 0),
                received_orders_count: Number(summary?.received_orders_count || 0),
                pending_orders_count: Number(summary?.pending_orders_count || 0),
                cancelled_orders_count: Number(summary?.cancelled_orders_count || 0),
                last_purchase_date: summary?.last_purchase_date || null
            },
            recent_purchases: recentPurchases
        };
    },

    /**
     * Find supplier by phone number (with optional ID exclusion for update checks)
     * @param {string} phone
     * @param {number|string|null} excludeId
     * @returns {Promise<Object|null>}
     */
    async findByPhone(phone, excludeId = null) {
        if (!phone) return null;
        let sql = 'SELECT * FROM suppliers WHERE phone = ?';
        const params = [phone.trim()];
        if (excludeId) {
            sql += ' AND id != ?';
            params.push(excludeId);
        }
        return await queryOne(sql, params);
    },

    /**
     * Find supplier by email (with optional ID exclusion for update checks)
     * @param {string} email
     * @param {number|string|null} excludeId
     * @returns {Promise<Object|null>}
     */
    async findByEmail(email, excludeId = null) {
        if (!email) return null;
        let sql = 'SELECT * FROM suppliers WHERE email = ?';
        const params = [email.trim()];
        if (excludeId) {
            sql += ' AND id != ?';
            params.push(excludeId);
        }
        return await queryOne(sql, params);
    },

    /**
     * Create a new supplier
     * @param {Object} data
     * @returns {Promise<Object>}
     */
    async create(data) {
        const {
            name,
            company_name = null,
            email = null,
            phone,
            address = null,
            city = null,
            payment_terms = 'cash',
            notes = null,
            is_active = 1
        } = data;

        const sql = `
            INSERT INTO suppliers (
                name,
                company_name,
                email,
                phone,
                address,
                city,
                payment_terms,
                notes,
                is_active
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        const params = [
            name.trim(),
            company_name ? company_name.trim() : null,
            email ? email.trim() : null,
            phone.trim(),
            address ? address.trim() : null,
            city ? city.trim() : null,
            payment_terms ? payment_terms.trim() : 'cash',
            notes ? notes.trim() : null,
            is_active === 0 || is_active === false ? 0 : 1
        ];

        const insertId = await queryInsert(sql, params);
        return await this.findById(insertId);
    },

    /**
     * Update an existing supplier
     * @param {number|string} id
     * @param {Object} data
     * @returns {Promise<Object|null>}
     */
    async update(id, data) {
        const allowedFields = [
            'name',
            'company_name',
            'email',
            'phone',
            'address',
            'city',
            'payment_terms',
            'notes',
            'is_active'
        ];

        const setClauses = [];
        const params = [];

        for (const field of allowedFields) {
            if (data[field] !== undefined) {
                setClauses.push(`${field} = ?`);
                let val = data[field];
                if (typeof val === 'string') {
                    val = val.trim();
                } else if (field === 'is_active') {
                    val = val ? 1 : 0;
                }
                params.push(val);
            }
        }

        if (setClauses.length === 0) {
            return await this.findById(id);
        }

        params.push(id);
        const sql = `UPDATE suppliers SET ${setClauses.join(', ')} WHERE id = ?`;
        await queryUpdate(sql, params);

        return await this.findById(id);
    },

    /**
     * Soft delete supplier (set is_active = 0)
     * @param {number|string} id
     * @returns {Promise<boolean>}
     */
    async softDelete(id) {
        const sql = 'UPDATE suppliers SET is_active = 0 WHERE id = ?';
        const affectedRows = await queryUpdate(sql, [id]);
        return affectedRows > 0;
    },

    /**
     * Get paginated purchases for a specific supplier
     * @param {number|string} supplierId
     * @param {Object} options
     * @returns {Promise<{data: Array, total: number, page: number, limit: number}>}
     */
    async getPurchases(supplierId, {
        page = 1,
        limit = 20,
        status = '',
        paymentStatus = '',
        startDate = '',
        endDate = '',
        sortBy = 'purchase_date',
        sortOrder = 'DESC'
    } = {}) {
        const { page: p, limit: l, offset } = paginate(page, limit);
        const whereClauses = ['p.supplier_id = ?'];
        const params = [supplierId];

        if (status && status.trim()) {
            whereClauses.push('p.status = ?');
            params.push(status.trim());
        }

        if (paymentStatus && paymentStatus.trim()) {
            whereClauses.push('p.payment_status = ?');
            params.push(paymentStatus.trim());
        }

        if (startDate && startDate.trim()) {
            whereClauses.push('p.purchase_date >= ?');
            params.push(startDate.trim());
        }

        if (endDate && endDate.trim()) {
            whereClauses.push('p.purchase_date <= ?');
            params.push(endDate.trim());
        }

        const whereSql = `WHERE ${whereClauses.join(' AND ')}`;

        const allowedSortColumns = {
            id: 'p.id',
            purchase_number: 'p.purchase_number',
            purchase_date: 'p.purchase_date',
            total_amount: 'p.total_amount',
            amount_paid: 'p.amount_paid',
            amount_due: 'p.amount_due',
            payment_status: 'p.payment_status',
            status: 'p.status',
            created_at: 'p.created_at'
        };

        const sortColumn = allowedSortColumns[sortBy] || 'p.purchase_date';
        const order = sortOrder && sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

        // Total count
        const countSql = `SELECT COUNT(*) as total FROM purchases p ${whereSql}`;
        const countResult = await queryOne(countSql, params);
        const total = countResult ? Number(countResult.total) : 0;

        // Paginated list with total items count per purchase
        const dataSql = `
            SELECT 
                p.id,
                p.purchase_number,
                p.supplier_id,
                p.supplier_name,
                p.purchase_date,
                p.subtotal,
                p.discount_amount,
                p.shipping_cost,
                p.total_amount,
                p.amount_paid,
                p.amount_due,
                p.payment_method,
                p.payment_status,
                p.notes,
                p.status,
                p.created_by,
                p.created_at,
                p.updated_at,
                (SELECT COUNT(*) FROM purchase_items pi WHERE pi.purchase_id = p.id) as total_items
            FROM purchases p
            ${whereSql}
            ORDER BY ${sortColumn} ${order}, p.id DESC
            LIMIT ${l} OFFSET ${offset}
        `;

        const rows = await query(dataSql, params);

        return {
            data: rows,
            total,
            page: p,
            limit: l
        };
    },

    /**
     * Get supplier outstanding balance details, purchase summaries, payments, and unpaid bills
     * @param {number|string} id
     * @returns {Promise<Object|null>}
     */
    async getBalance(id) {
        const supplier = await this.findById(id);
        if (!supplier) return null;

        // Purchases statistics
        const purchasesStatsSql = `
            SELECT 
                COUNT(*) as total_orders,
                COALESCE(SUM(total_amount), 0.00) as total_purchases_amount,
                COALESCE(SUM(amount_paid), 0.00) as total_purchases_paid,
                COALESCE(SUM(amount_due), 0.00) as total_purchases_due,
                COALESCE(SUM(CASE WHEN amount_due > 0 THEN 1 ELSE 0 END), 0) as unpaid_orders_count
            FROM purchases
            WHERE supplier_id = ? AND status != 'cancelled'
        `;
        const purchasesStats = await queryOne(purchasesStatsSql, [id]);

        // Payments made to supplier from payments table
        const paymentsStatsSql = `
            SELECT 
                COUNT(*) as total_payments_count,
                COALESCE(SUM(amount), 0.00) as total_payments_amount,
                MAX(payment_date) as last_payment_date
            FROM payments
            WHERE supplier_id = ? AND payment_type = 'made'
        `;
        const paymentsStats = await queryOne(paymentsStatsSql, [id]);

        // Unpaid or partially paid purchases (with balance due)
        const unpaidPurchasesSql = `
            SELECT 
                id,
                purchase_number,
                purchase_date,
                total_amount,
                amount_paid,
                amount_due,
                payment_status,
                payment_method,
                status
            FROM purchases
            WHERE supplier_id = ? AND amount_due > 0 AND status != 'cancelled'
            ORDER BY purchase_date ASC, id ASC
        `;
        const unpaidPurchases = await query(unpaidPurchasesSql, [id]);

        return {
            supplier_id: supplier.id,
            name: supplier.name,
            company_name: supplier.company_name,
            phone: supplier.phone,
            email: supplier.email,
            payment_terms: supplier.payment_terms,
            outstanding_balance: parseFloat(supplier.outstanding_balance || 0).toFixed(2),
            total_supplies: parseFloat(supplier.total_supplies || 0).toFixed(2),
            formatted_outstanding_balance: formatCurrency(supplier.outstanding_balance),
            formatted_total_supplies: formatCurrency(supplier.total_supplies),
            purchases_summary: {
                total_orders: Number(purchasesStats?.total_orders || 0),
                unpaid_orders_count: Number(purchasesStats?.unpaid_orders_count || 0),
                total_purchases_amount: parseFloat(purchasesStats?.total_purchases_amount || 0).toFixed(2),
                total_purchases_paid: parseFloat(purchasesStats?.total_purchases_paid || 0).toFixed(2),
                total_purchases_due: parseFloat(purchasesStats?.total_purchases_due || 0).toFixed(2),
                formatted_purchases_amount: formatCurrency(purchasesStats?.total_purchases_amount || 0),
                formatted_purchases_paid: formatCurrency(purchasesStats?.total_purchases_paid || 0),
                formatted_purchases_due: formatCurrency(purchasesStats?.total_purchases_due || 0)
            },
            payments_summary: {
                total_payments_count: Number(paymentsStats?.total_payments_count || 0),
                total_payments_amount: parseFloat(paymentsStats?.total_payments_amount || 0).toFixed(2),
                formatted_payments_amount: formatCurrency(paymentsStats?.total_payments_amount || 0),
                last_payment_date: paymentsStats?.last_payment_date || null
            },
            unpaid_purchases: unpaidPurchases
        };
    },

    /**
     * Recalculate supplier balance from actual purchase records
     * @param {number|string} id
     * @returns {Promise<Object>}
     */
    async recalculateBalance(id) {
        const stats = await queryOne(
            `SELECT 
                COALESCE(SUM(CASE WHEN status != 'cancelled' THEN total_amount ELSE 0 END), 0.00) as calculated_supplies,
                COALESCE(SUM(CASE WHEN status != 'cancelled' THEN amount_due ELSE 0 END), 0.00) as calculated_due
             FROM purchases
             WHERE supplier_id = ?`,
            [id]
        );

        const supplies = parseFloat(stats?.calculated_supplies || 0).toFixed(2);
        const due = parseFloat(stats?.calculated_due || 0).toFixed(2);

        await queryUpdate(
            'UPDATE suppliers SET total_supplies = ?, outstanding_balance = ? WHERE id = ?',
            [supplies, due, id]
        );

        return await this.findById(id);
    }
};

module.exports = SupplierModel;
