// ============================================
// CUSTOMER MODEL
// Khan Brothers Motorcycle Workshop ERP
// ============================================

const { query, queryInsert, queryUpdate, queryOne, transaction, pool } = require('../../config/database');
const { paginate, formatCurrency } = require('../../utils/helpers');

const CustomerModel = {
    /**
     * Find all customers with pagination, search, and filters
     * @param {Object} options Filter and pagination options
     * @returns {Promise<{customers: Array, total: number, page: number, limit: number}>}
     */
    async findAll({
        page = 1,
        limit = 20,
        search = '',
        customer_type = null,
        city = null,
        is_active = 1,
        sort_by = 'created_at',
        order = 'DESC'
    } = {}) {
        const conditions = [];
        const params = [];

        // Active status filter (1, 0, or 'all')
        if (is_active !== undefined && is_active !== null && is_active !== 'all') {
            conditions.push('c.is_active = ?');
            params.push(parseInt(is_active, 10));
        }

        // Search filter across name, phone, email, and CNIC
        if (search && search.trim()) {
            const searchTerm = `%${search.trim()}%`;
            conditions.push('(c.name LIKE ? OR c.phone LIKE ? OR c.email LIKE ? OR c.cnic LIKE ?)');
            params.push(searchTerm, searchTerm, searchTerm, searchTerm);
        }

        // Customer type filter ('retail', 'wholesale')
        if (customer_type && customer_type !== 'all') {
            conditions.push('c.customer_type = ?');
            params.push(customer_type);
        }

        // City filter
        if (city && city.trim()) {
            conditions.push('c.city LIKE ?');
            params.push(`%${city.trim()}%`);
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        // Count total matching records
        const countSql = `SELECT COUNT(*) AS total FROM customers c ${whereClause}`;
        const countResult = await queryOne(countSql, params);
        const total = countResult ? parseInt(countResult.total, 10) : 0;

        // Sorting whitelist
        const allowedSort = [
            'id', 'name', 'email', 'phone', 'city',
            'customer_type', 'outstanding_balance', 'total_purchases',
            'created_at', 'updated_at'
        ];
        const sortColumn = allowedSort.includes(sort_by) ? `c.${sort_by}` : 'c.created_at';
        const sortDirection = (order && order.toUpperCase() === 'ASC') ? 'ASC' : 'DESC';

        // Calculate pagination bounds
        const { page: currentPage, limit: perPage, offset } = paginate(page, limit);

        // Main select query with aggregated motorcycle count
        const sql = `
            SELECT 
                c.id,
                c.name,
                c.email,
                c.phone,
                c.cnic,
                c.address,
                c.city,
                c.customer_type,
                c.outstanding_balance,
                c.total_purchases,
                c.notes,
                c.is_active,
                c.created_at,
                c.updated_at,
                COUNT(cm.id) AS motorcycles_count
            FROM customers c
            LEFT JOIN customer_motorcycles cm ON cm.customer_id = c.id
            ${whereClause}
            GROUP BY c.id
            ORDER BY ${sortColumn} ${sortDirection}
            LIMIT ${Number(perPage)} OFFSET ${Number(offset)}
        `;

        const customers = await query(sql, params);

        return {
            customers,
            total,
            page: currentPage,
            limit: perPage
        };
    },

    /**
     * Find customer by ID
     * @param {number} id Customer ID
     * @returns {Promise<Object|null>}
     */
    async findById(id) {
        const sql = `
            SELECT 
                id,
                name,
                email,
                phone,
                cnic,
                address,
                city,
                customer_type,
                outstanding_balance,
                total_purchases,
                notes,
                is_active,
                created_at,
                updated_at
            FROM customers 
            WHERE id = ?
        `;
        return await queryOne(sql, [id]);
    },

    /**
     * Find customer by phone number (optionally excluding a specific ID)
     * @param {string} phone Phone number
     * @param {number|null} excludeId Customer ID to exclude
     * @returns {Promise<Object|null>}
     */
    async findByPhone(phone, excludeId = null) {
        if (!phone) return null;
        let sql = 'SELECT * FROM customers WHERE phone = ?';
        const params = [phone.trim()];

        if (excludeId) {
            sql += ' AND id != ?';
            params.push(excludeId);
        }

        return await queryOne(sql, params);
    },

    /**
     * Find customer by email (optionally excluding a specific ID)
     * @param {string} email Email address
     * @param {number|null} excludeId Customer ID to exclude
     * @returns {Promise<Object|null>}
     */
    async findByEmail(email, excludeId = null) {
        if (!email) return null;
        let sql = 'SELECT * FROM customers WHERE email = ?';
        const params = [email.trim().toLowerCase()];

        if (excludeId) {
            sql += ' AND id != ?';
            params.push(excludeId);
        }

        return await queryOne(sql, params);
    },

    /**
     * Create a new customer
     * @param {Object} customerData Customer payload
     * @returns {Promise<Object>} Created customer record
     */
    async create(customerData) {
        const {
            name,
            email = null,
            phone,
            cnic = null,
            address = null,
            city = 'Swat',
            customer_type = 'retail',
            outstanding_balance = 0.00,
            total_purchases = 0.00,
            notes = null,
            is_active = 1
        } = customerData;

        const sql = `
            INSERT INTO customers (
                name,
                email,
                phone,
                cnic,
                address,
                city,
                customer_type,
                outstanding_balance,
                total_purchases,
                notes,
                is_active
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        const params = [
            name.trim(),
            email ? email.trim().toLowerCase() : null,
            phone.trim(),
            cnic ? cnic.trim() : null,
            address ? address.trim() : null,
            city ? city.trim() : 'Swat',
            customer_type || 'retail',
            parseFloat(outstanding_balance) || 0.00,
            parseFloat(total_purchases) || 0.00,
            notes ? notes.trim() : null,
            is_active !== undefined ? parseInt(is_active, 10) : 1
        ];

        const insertId = await queryInsert(sql, params);
        return await this.findById(insertId);
    },

    /**
     * Update an existing customer
     * @param {number} id Customer ID
     * @param {Object} updateData Fields to update
     * @returns {Promise<Object|null>} Updated customer record
     */
    async update(id, updateData) {
        const allowedFields = [
            'name',
            'email',
            'phone',
            'cnic',
            'address',
            'city',
            'customer_type',
            'outstanding_balance',
            'total_purchases',
            'notes',
            'is_active'
        ];

        const setClauses = [];
        const params = [];

        for (const field of allowedFields) {
            if (updateData[field] !== undefined) {
                setClauses.push(`${field} = ?`);
                let value = updateData[field];

                if (field === 'email' && value) {
                    value = value.trim().toLowerCase();
                } else if (typeof value === 'string') {
                    value = value.trim();
                } else if (['outstanding_balance', 'total_purchases'].includes(field)) {
                    value = parseFloat(value) || 0.00;
                } else if (field === 'is_active') {
                    value = parseInt(value, 10);
                }

                params.push(value);
            }
        }

        if (setClauses.length === 0) {
            return await this.findById(id);
        }

        params.push(id);
        const sql = `UPDATE customers SET ${setClauses.join(', ')} WHERE id = ?`;
        await queryUpdate(sql, params);

        return await this.findById(id);
    },

    /**
     * Soft delete a customer by setting is_active = 0
     * @param {number} id Customer ID
     * @returns {Promise<boolean>}
     */
    async softDelete(id) {
        const sql = 'UPDATE customers SET is_active = 0 WHERE id = ?';
        const affectedRows = await queryUpdate(sql, [id]);
        return affectedRows > 0;
    },

    /**
     * Get customer by ID along with their motorcycles and recent purchase history
     * @param {number} id Customer ID
     * @returns {Promise<Object|null>} Customer object with nested motorcycles & history
     */
    async getCustomerWithDetails(id) {
        const customer = await this.findById(id);
        if (!customer) return null;

        // Fetch motorcycles belonging to this customer
        const motorcycles = await this.getMotorcyclesByCustomerId(id);

        // Fetch recent sales / purchase history
        const salesSql = `
            SELECT 
                id,
                invoice_number,
                sale_date,
                subtotal,
                discount_amount,
                tax_amount,
                total_amount,
                amount_paid,
                amount_due,
                payment_method,
                payment_status,
                status,
                created_at
            FROM sales
            WHERE customer_id = ?
            ORDER BY sale_date DESC, id DESC
            LIMIT 10
        `;
        const sales = await query(salesSql, [id]);

        // Fetch recent workshop job cards
        const jobCardsSql = `
            SELECT 
                id,
                job_number,
                motorcycle_make,
                motorcycle_model,
                motorcycle_registration,
                complaints,
                total_cost,
                amount_paid,
                status,
                payment_status,
                received_date,
                completed_date
            FROM job_cards
            WHERE customer_id = ?
            ORDER BY received_date DESC, id DESC
            LIMIT 5
        `;
        const jobCards = await query(jobCardsSql, [id]);

        return {
            ...customer,
            motorcycles: motorcycles || [],
            purchase_history: sales || [],
            recent_job_cards: jobCards || []
        };
    },

    /**
     * Get all motorcycles registered under a customer
     * @param {number} customerId Customer ID
     * @returns {Promise<Array>} List of motorcycles
     */
    async getMotorcyclesByCustomerId(customerId) {
        const sql = `
            SELECT 
                id,
                customer_id,
                make,
                model,
                year,
                color,
                engine_number,
                chassis_number,
                registration_number,
                notes,
                created_at
            FROM customer_motorcycles
            WHERE customer_id = ?
            ORDER BY created_at DESC
        `;
        return await query(sql, [customerId]);
    },

    /**
     * Get a specific motorcycle by ID and Customer ID
     * @param {number} customerId Customer ID
     * @param {number} motoId Motorcycle ID
     * @returns {Promise<Object|null>}
     */
    async getMotorcycleById(customerId, motoId) {
        const sql = `
            SELECT 
                id,
                customer_id,
                make,
                model,
                year,
                color,
                engine_number,
                chassis_number,
                registration_number,
                notes,
                created_at
            FROM customer_motorcycles
            WHERE id = ? AND customer_id = ?
        `;
        return await queryOne(sql, [motoId, customerId]);
    },

    /**
     * Add a motorcycle to a customer
     * @param {number} customerId Customer ID
     * @param {Object} motorcycleData Motorcycle details
     * @returns {Promise<Object>} Created motorcycle record
     */
    async addMotorcycle(customerId, motorcycleData) {
        const {
            make,
            model,
            year = null,
            color = null,
            engine_number = null,
            chassis_number = null,
            registration_number = null,
            notes = null
        } = motorcycleData;

        const sql = `
            INSERT INTO customer_motorcycles (
                customer_id,
                make,
                model,
                year,
                color,
                engine_number,
                chassis_number,
                registration_number,
                notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        const params = [
            customerId,
            make.trim(),
            model.trim(),
            year ? parseInt(year, 10) : null,
            color ? color.trim() : null,
            engine_number ? engine_number.trim() : null,
            chassis_number ? chassis_number.trim() : null,
            registration_number ? registration_number.trim().toUpperCase() : null,
            notes ? notes.trim() : null
        ];

        const insertId = await queryInsert(sql, params);
        return await this.getMotorcycleById(customerId, insertId);
    },

    /**
     * Update a customer's motorcycle details
     * @param {number} customerId Customer ID
     * @param {number} motoId Motorcycle ID
     * @param {Object} motorcycleData Updated motorcycle details
     * @returns {Promise<Object|null>} Updated motorcycle record
     */
    async updateMotorcycle(customerId, motoId, motorcycleData) {
        const allowedFields = [
            'make',
            'model',
            'year',
            'color',
            'engine_number',
            'chassis_number',
            'registration_number',
            'notes'
        ];

        const setClauses = [];
        const params = [];

        for (const field of allowedFields) {
            if (motorcycleData[field] !== undefined) {
                setClauses.push(`${field} = ?`);
                let value = motorcycleData[field];

                if (field === 'year') {
                    value = value ? parseInt(value, 10) : null;
                } else if (field === 'registration_number' && value) {
                    value = value.trim().toUpperCase();
                } else if (typeof value === 'string') {
                    value = value.trim();
                }

                params.push(value);
            }
        }

        if (setClauses.length === 0) {
            return await this.getMotorcycleById(customerId, motoId);
        }

        params.push(motoId, customerId);
        const sql = `UPDATE customer_motorcycles SET ${setClauses.join(', ')} WHERE id = ? AND customer_id = ?`;
        await queryUpdate(sql, params);

        return await this.getMotorcycleById(customerId, motoId);
    },

    /**
     * Remove a customer's motorcycle
     * @param {number} customerId Customer ID
     * @param {number} motoId Motorcycle ID
     * @returns {Promise<boolean>}
     */
    async deleteMotorcycle(customerId, motoId) {
        const sql = 'DELETE FROM customer_motorcycles WHERE id = ? AND customer_id = ?';
        const affectedRows = await queryUpdate(sql, [motoId, customerId]);
        return affectedRows > 0;
    },

    /**
     * Get customer transaction history (sales, payments, job cards) and balance summary
     * @param {number} customerId Customer ID
     * @returns {Promise<Object|null>} Complete transaction history and financial breakdown
     */
    async getCustomerTransactions(customerId) {
        const customer = await this.findById(customerId);
        if (!customer) return null;

        // Fetch sales history
        const salesSql = `
            SELECT 
                id,
                invoice_number,
                sale_date,
                subtotal,
                discount_amount,
                tax_amount,
                total_amount,
                amount_paid,
                amount_due,
                payment_method,
                payment_status,
                status,
                created_at
            FROM sales
            WHERE customer_id = ?
            ORDER BY sale_date DESC, id DESC
        `;
        const sales = await query(salesSql, [customerId]);

        // Fetch payments made by customer
        const paymentsSql = `
            SELECT 
                id,
                payment_number,
                payment_type,
                reference_type,
                reference_id,
                amount,
                payment_method,
                payment_date,
                bank_name,
                reference_number,
                notes,
                created_at
            FROM payments
            WHERE customer_id = ?
            ORDER BY payment_date DESC, id DESC
        `;
        const payments = await query(paymentsSql, [customerId]);

        // Fetch workshop job cards history
        const jobCardsSql = `
            SELECT 
                id,
                job_number,
                motorcycle_make,
                motorcycle_model,
                motorcycle_registration,
                total_cost,
                amount_paid,
                (total_cost - amount_paid) AS amount_due,
                payment_status,
                status,
                received_date,
                completed_date
            FROM job_cards
            WHERE customer_id = ?
            ORDER BY received_date DESC, id DESC
        `;
        const jobCards = await query(jobCardsSql, [customerId]);

        // Compute metrics
        let totalSalesAmount = 0;
        let totalSalesPaid = 0;
        let totalSalesDue = 0;

        for (const sale of sales) {
            totalSalesAmount += parseFloat(sale.total_amount || 0);
            totalSalesPaid += parseFloat(sale.amount_paid || 0);
            totalSalesDue += parseFloat(sale.amount_due || 0);
        }

        let totalPaymentsReceived = 0;
        for (const payment of payments) {
            if (payment.payment_type === 'received') {
                totalPaymentsReceived += parseFloat(payment.amount || 0);
            }
        }

        let totalJobCardsCost = 0;
        let totalJobCardsPaid = 0;
        for (const job of jobCards) {
            totalJobCardsCost += parseFloat(job.total_cost || 0);
            totalJobCardsPaid += parseFloat(job.amount_paid || 0);
        }

        const outstandingBalance = parseFloat(customer.outstanding_balance || 0);
        const totalPurchases = parseFloat(customer.total_purchases || 0);

        return {
            customer: {
                id: customer.id,
                name: customer.name,
                phone: customer.phone,
                email: customer.email,
                customer_type: customer.customer_type,
                city: customer.city,
                outstanding_balance: outstandingBalance,
                total_purchases: totalPurchases
            },
            summary: {
                total_invoices_count: sales.length,
                total_invoiced_amount: totalSalesAmount,
                total_sales_paid: totalSalesPaid,
                total_sales_due: totalSalesDue,
                total_payments_received: totalPaymentsReceived,
                total_job_cards_count: jobCards.length,
                total_job_cards_cost: totalJobCardsCost,
                total_job_cards_paid: totalJobCardsPaid,
                outstanding_balance: outstandingBalance,
                total_purchases: totalPurchases,
                formatted_outstanding_balance: formatCurrency(outstandingBalance),
                formatted_total_purchases: formatCurrency(totalPurchases)
            },
            sales: sales || [],
            payments: payments || [],
            job_cards: jobCards || []
        };
    },

    /**
     * Update customer outstanding balance and total purchases
     * @param {number} customerId Customer ID
     * @param {number} balanceChange Amount to adjust outstanding balance by
     * @param {number} purchaseChange Amount to adjust total purchases by
     * @returns {Promise<boolean>}
     */
    async updateBalance(customerId, balanceChange, purchaseChange = 0) {
        const sql = `
            UPDATE customers 
            SET 
                outstanding_balance = outstanding_balance + ?,
                total_purchases = total_purchases + ?
            WHERE id = ?
        `;
        const affectedRows = await queryUpdate(sql, [
            parseFloat(balanceChange) || 0,
            parseFloat(purchaseChange) || 0,
            customerId
        ]);
        return affectedRows > 0;
    }
};

module.exports = CustomerModel;
