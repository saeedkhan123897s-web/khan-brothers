// ============================================
// SUPPLIER CONTROLLER
// Khan Brothers Motorcycle Workshop ERP
// ============================================

const SupplierModel = require('./supplier.model');
const { paginationResponse } = require('../../utils/helpers');
const { AUDIT_ACTIONS } = require('../../utils/constants');
const { queryInsert } = require('../../config/database');

/**
 * Helper: Log action to audit trail
 */
async function logAudit({ userId, userName, action, recordId, oldValues = null, newValues = null, ipAddress = null, description = '' }) {
    try {
        const sql = `
            INSERT INTO audit_trail (
                user_id, user_name, action, module, record_id,
                old_values, new_values, ip_address, description
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        await queryInsert(sql, [
            userId || null,
            userName || 'System',
            action,
            'suppliers',
            recordId,
            oldValues ? JSON.stringify(oldValues) : null,
            newValues ? JSON.stringify(newValues) : null,
            ipAddress || null,
            description
        ]);
    } catch (err) {
        console.error('Audit trail logging failed:', err.message);
    }
}

/**
 * Supplier Controller Object
 */
const supplierController = {
    /**
     * GET / - List all suppliers (paginated, with search and filter options)
     */
    async getSuppliers(req, res) {
        try {
            const {
                page = 1,
                limit = 20,
                search = '',
                city = '',
                is_active = null,
                payment_terms = '',
                sortBy = 'created_at',
                sortOrder = 'DESC'
            } = req.query;

            const result = await SupplierModel.findAll({
                page,
                limit,
                search,
                city,
                isActive: is_active,
                paymentTerms: payment_terms,
                sortBy,
                sortOrder
            });

            const paginated = paginationResponse(result.data, result.total, result.page, result.limit);

            return res.status(200).json({
                success: true,
                data: paginated.data,
                pagination: paginated.pagination,
                message: 'Suppliers retrieved successfully'
            });
        } catch (error) {
            console.error('Error in getSuppliers:', error);
            return res.status(500).json({
                success: false,
                error: error.message || 'Internal server error',
                message: 'Failed to retrieve suppliers'
            });
        }
    },

    /**
     * GET /:id - Get supplier by ID with purchase history summary and recent orders
     */
    async getSupplierById(req, res) {
        try {
            const { id } = req.params;

            const supplier = await SupplierModel.findByIdWithSummary(id);
            if (!supplier) {
                return res.status(404).json({
                    success: false,
                    error: 'Supplier not found',
                    message: `Supplier with ID ${id} was not found`
                });
            }

            return res.status(200).json({
                success: true,
                data: supplier,
                message: 'Supplier retrieved successfully'
            });
        } catch (error) {
            console.error('Error in getSupplierById:', error);
            return res.status(500).json({
                success: false,
                error: error.message || 'Internal server error',
                message: 'Failed to retrieve supplier details'
            });
        }
    },

    /**
     * POST / - Create a new supplier
     */
    async createSupplier(req, res) {
        try {
            const {
                name,
                company_name,
                email,
                phone,
                address,
                city,
                payment_terms,
                notes,
                is_active
            } = req.body;

            // Check if phone already in use
            const existingPhone = await SupplierModel.findByPhone(phone);
            if (existingPhone) {
                return res.status(409).json({
                    success: false,
                    error: 'Duplicate supplier phone',
                    message: `A supplier with phone number "${phone}" already exists`
                });
            }

            // Check if email already in use (if provided)
            if (email && email.trim()) {
                const existingEmail = await SupplierModel.findByEmail(email);
                if (existingEmail) {
                    return res.status(409).json({
                        success: false,
                        error: 'Duplicate supplier email',
                        message: `A supplier with email "${email}" already exists`
                    });
                }
            }

            const newSupplier = await SupplierModel.create({
                name,
                company_name,
                email,
                phone,
                address,
                city,
                payment_terms,
                notes,
                is_active
            });

            // Log audit trail
            await logAudit({
                userId: req.user?.id,
                userName: req.user?.name,
                action: AUDIT_ACTIONS.CREATE,
                recordId: newSupplier.id,
                newValues: newSupplier,
                ipAddress: req.ip || req.connection?.remoteAddress,
                description: `Created new supplier: ${newSupplier.name} (${newSupplier.phone})`
            });

            return res.status(201).json({
                success: true,
                data: newSupplier,
                message: 'Supplier created successfully'
            });
        } catch (error) {
            console.error('Error in createSupplier:', error);
            return res.status(500).json({
                success: false,
                error: error.message || 'Internal server error',
                message: 'Failed to create supplier'
            });
        }
    },

    /**
     * PUT /:id - Update an existing supplier
     */
    async updateSupplier(req, res) {
        try {
            const { id } = req.params;

            const existingSupplier = await SupplierModel.findById(id);
            if (!existingSupplier) {
                return res.status(404).json({
                    success: false,
                    error: 'Supplier not found',
                    message: `Supplier with ID ${id} was not found`
                });
            }

            // Phone uniqueness check if changed
            if (req.body.phone && req.body.phone.trim() !== existingSupplier.phone) {
                const phoneConflict = await SupplierModel.findByPhone(req.body.phone, id);
                if (phoneConflict) {
                    return res.status(409).json({
                        success: false,
                        error: 'Duplicate supplier phone',
                        message: `Another supplier with phone number "${req.body.phone}" already exists`
                    });
                }
            }

            // Email uniqueness check if changed
            if (req.body.email && req.body.email.trim() !== (existingSupplier.email || '')) {
                const emailConflict = await SupplierModel.findByEmail(req.body.email, id);
                if (emailConflict) {
                    return res.status(409).json({
                        success: false,
                        error: 'Duplicate supplier email',
                        message: `Another supplier with email "${req.body.email}" already exists`
                    });
                }
            }

            const updatedSupplier = await SupplierModel.update(id, req.body);

            // Log audit trail
            await logAudit({
                userId: req.user?.id,
                userName: req.user?.name,
                action: AUDIT_ACTIONS.UPDATE,
                recordId: id,
                oldValues: existingSupplier,
                newValues: updatedSupplier,
                ipAddress: req.ip || req.connection?.remoteAddress,
                description: `Updated supplier: ${updatedSupplier.name} (ID: ${id})`
            });

            return res.status(200).json({
                success: true,
                data: updatedSupplier,
                message: 'Supplier updated successfully'
            });
        } catch (error) {
            console.error('Error in updateSupplier:', error);
            return res.status(500).json({
                success: false,
                error: error.message || 'Internal server error',
                message: 'Failed to update supplier'
            });
        }
    },

    /**
     * DELETE /:id - Soft delete supplier (set is_active = 0)
     */
    async deleteSupplier(req, res) {
        try {
            const { id } = req.params;

            const existingSupplier = await SupplierModel.findById(id);
            if (!existingSupplier) {
                return res.status(404).json({
                    success: false,
                    error: 'Supplier not found',
                    message: `Supplier with ID ${id} was not found`
                });
            }

            await SupplierModel.softDelete(id);

            // Log audit trail
            await logAudit({
                userId: req.user?.id,
                userName: req.user?.name,
                action: AUDIT_ACTIONS.DELETE,
                recordId: id,
                oldValues: existingSupplier,
                newValues: { is_active: 0 },
                ipAddress: req.ip || req.connection?.remoteAddress,
                description: `Deactivated supplier: ${existingSupplier.name} (ID: ${id})`
            });

            return res.status(200).json({
                success: true,
                data: {
                    id: Number(id),
                    is_active: 0
                },
                message: 'Supplier deactivated successfully'
            });
        } catch (error) {
            console.error('Error in deleteSupplier:', error);
            return res.status(500).json({
                success: false,
                error: error.message || 'Internal server error',
                message: 'Failed to deactivate supplier'
            });
        }
    },

    /**
     * GET /:id/purchases - Get supplier's purchase history with pagination and filters
     */
    async getSupplierPurchases(req, res) {
        try {
            const { id } = req.params;

            const supplier = await SupplierModel.findById(id);
            if (!supplier) {
                return res.status(404).json({
                    success: false,
                    error: 'Supplier not found',
                    message: `Supplier with ID ${id} was not found`
                });
            }

            const {
                page = 1,
                limit = 20,
                status = '',
                payment_status = '',
                start_date = '',
                end_date = '',
                sortBy = 'purchase_date',
                sortOrder = 'DESC'
            } = req.query;

            const result = await SupplierModel.getPurchases(id, {
                page,
                limit,
                status,
                paymentStatus: payment_status,
                startDate: start_date,
                endDate: end_date,
                sortBy,
                sortOrder
            });

            const paginated = paginationResponse(result.data, result.total, result.page, result.limit);

            return res.status(200).json({
                success: true,
                data: paginated.data,
                pagination: paginated.pagination,
                supplier: {
                    id: supplier.id,
                    name: supplier.name,
                    company_name: supplier.company_name
                },
                message: 'Supplier purchase history retrieved successfully'
            });
        } catch (error) {
            console.error('Error in getSupplierPurchases:', error);
            return res.status(500).json({
                success: false,
                error: error.message || 'Internal server error',
                message: 'Failed to retrieve supplier purchase history'
            });
        }
    },

    /**
     * GET /:id/balance - Get supplier outstanding balance details, purchase stats, and payments
     */
    async getSupplierBalance(req, res) {
        try {
            const { id } = req.params;

            const balance = await SupplierModel.getBalance(id);
            if (!balance) {
                return res.status(404).json({
                    success: false,
                    error: 'Supplier not found',
                    message: `Supplier with ID ${id} was not found`
                });
            }

            return res.status(200).json({
                success: true,
                data: balance,
                message: 'Supplier balance retrieved successfully'
            });
        } catch (error) {
            console.error('Error in getSupplierBalance:', error);
            return res.status(500).json({
                success: false,
                error: error.message || 'Internal server error',
                message: 'Failed to retrieve supplier balance'
            });
        }
    }
};

module.exports = supplierController;
