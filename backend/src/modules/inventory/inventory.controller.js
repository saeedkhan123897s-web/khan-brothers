// ============================================
// INVENTORY CONTROLLER - Request Handlers
// Khan Brothers Motorcycle Workshop ERP
// ============================================

const inventoryModel = require('./inventory.model');
const { paginationResponse } = require('../../utils/helpers');

const { hasPermission, getOverrides } = require('../../utils/routePermissions');
const canSeeCost = async req => hasPermission(req.user, 'inventory.finance', await getOverrides(req));
const privateCostField = /cost|profit|margin|wholesale|discrepancy_value/i;

function redactCostData(value, allowed) {
    if (allowed) return value;
    if (Array.isArray(value)) return value.map(item => redactCostData(item, allowed));
    if (!value || typeof value !== 'object') return value;
    if (value instanceof Date) return value;

    return Object.fromEntries(Object.entries(value)
        .filter(([key]) => !privateCostField.test(key))
        .map(([key, nested]) => [key, redactCostData(nested, allowed)]));
}

const inventoryController = {

    /**
     * GET /stock
     * Get current stock levels for all products (paginated)
     */
    async getStockLevels(req, res) {
        try {
            const {
                page = 1,
                limit = 20,
                search,
                category_id,
                brand_id,
                product_type,
                location,
                stock_status,
                is_active,
                sort_by,
                sort_order
            } = req.query;

            const result = await inventoryModel.getStockLevels({
                page: parseInt(page, 10) || 1,
                limit: parseInt(limit, 10) || 20,
                search: search ? String(search).trim() : '',
                category_id: category_id ? parseInt(category_id, 10) : null,
                brand_id: brand_id ? parseInt(brand_id, 10) : null,
                product_type,
                location: location ? String(location).trim() : '',
                stock_status: stock_status ? String(stock_status).trim() : '',
                is_active: is_active !== undefined ? is_active : 1,
                sort_by: sort_by ? String(sort_by).trim() : 'name',
                sort_order: sort_order ? String(sort_order).trim() : 'ASC'
            });

            const paginated = paginationResponse(result.products, result.total, result.page, result.limit);

            return res.status(200).json({
                success: true,
                data: {
                    items: redactCostData(paginated.data, await canSeeCost(req)),
                    data: redactCostData(paginated.data, await canSeeCost(req)),
                    pagination: paginated.pagination
                },
                message: 'Stock levels retrieved successfully'
            });
        } catch (error) {
            console.error('Error in getStockLevels:', error);
            return res.status(500).json({
                success: false,
                error: error.message || 'Internal server error',
                message: 'Failed to retrieve stock levels'
            });
        }
    },

    /**
     * GET /stock/:productId
     * Get stock details for a single product
     */
    async getProductStock(req, res) {
        try {
            const productId = parseInt(req.params.productId, 10);
            if (!productId || isNaN(productId)) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid product ID',
                    message: 'A valid numeric product ID is required'
                });
            }

            const stockDetails = await inventoryModel.getProductStock(productId);

            if (!stockDetails) {
                return res.status(404).json({
                    success: false,
                    error: 'Product not found',
                    message: `Product with ID ${productId} does not exist`
                });
            }

            return res.status(200).json({
                success: true,
                data: redactCostData(stockDetails, await canSeeCost(req)),
                message: 'Product stock details retrieved successfully'
            });
        } catch (error) {
            console.error('Error in getProductStock:', error);
            return res.status(500).json({
                success: false,
                error: error.message || 'Internal server error',
                message: 'Failed to retrieve product stock details'
            });
        }
    },

    /**
     * POST /adjust
     * Stock adjustment (increase/decrease with reason)
     * Protected route: Management only (Owner, Admin, Manager)
     */
    async adjustStock(req, res) {
        try {
            const {
                product_id,
                productId,
                quantity,
                adjustment_type,
                type,
                movement_type,
                notes,
                reason,
                cost_price,
                reference_type,
                reference_id
            } = req.body;

            const targetProductId = parseInt(product_id || productId, 10);
            if (!targetProductId || isNaN(targetProductId)) {
                return res.status(400).json({
                    success: false,
                    error: 'Validation error',
                    message: 'Valid product_id is required'
                });
            }

            if (quantity === undefined || quantity === null || isNaN(parseInt(quantity, 10))) {
                return res.status(400).json({
                    success: false,
                    error: 'Validation error',
                    message: 'Valid quantity integer is required'
                });
            }

            const adjustmentReason = (notes || reason || '').trim();
            if (!adjustmentReason) {
                return res.status(400).json({
                    success: false,
                    error: 'Validation error',
                    message: 'Reason/notes for stock adjustment is required'
                });
            }

            const adjType = (adjustment_type || type || 'increase').toLowerCase();
            const movType = (movement_type || 'adjustment').toLowerCase();

            const adjustmentResult = await inventoryModel.adjustStock({
                product_id: targetProductId,
                quantity: parseInt(quantity, 10),
                adjustment_type: adjType,
                movement_type: movType,
                notes: adjustmentReason,
                cost_price: cost_price !== undefined ? parseFloat(cost_price) : null,
                reference_type: reference_type || 'manual_adjustment',
                reference_id: reference_id ? parseInt(reference_id, 10) : null,
                created_by: req.user ? req.user.id : null,
                user_name: req.user ? req.user.name : 'System',
                ip_address: req.ip || req.connection.remoteAddress || ''
            });

            return res.status(200).json({
                success: true,
                data: redactCostData(adjustmentResult, await canSeeCost(req)),
                message: `Stock successfully adjusted for product #${adjustmentResult.product.id} (${adjustmentResult.product.name})`
            });
        } catch (error) {
            console.error('Error in adjustStock:', error);
            const statusCode = error.statusCode || 500;
            return res.status(statusCode).json({
                success: false,
                error: error.message || 'Internal server error',
                message: statusCode === 400 || statusCode === 404
                    ? error.message
                    : 'Failed to adjust stock'
            });
        }
    },

    /**
     * GET /movements
     * Get stock movement history (paginated, filter by product/type/date)
     */
    async getMovements(req, res) {
        try {
            const {
                page = 1,
                limit = 20,
                product_id,
                movement_type,
                type,
                start_date,
                end_date,
                reference_type,
                reference_id,
                created_by,
                search
            } = req.query;

            const result = await inventoryModel.getMovements({
                page: parseInt(page, 10) || 1,
                limit: parseInt(limit, 10) || 20,
                product_id: product_id ? parseInt(product_id, 10) : null,
                movement_type: movement_type || type || '',
                start_date: start_date ? String(start_date).trim() : '',
                end_date: end_date ? String(end_date).trim() : '',
                reference_type: reference_type ? String(reference_type).trim() : '',
                reference_id: reference_id ? parseInt(reference_id, 10) : null,
                created_by: created_by ? parseInt(created_by, 10) : null,
                search: search ? String(search).trim() : ''
            });

            const paginated = paginationResponse(result.movements, result.total, result.page, result.limit);

            return res.status(200).json({
                success: true,
                data: {
                    items: redactCostData(paginated.data, await canSeeCost(req)),
                    data: redactCostData(paginated.data, await canSeeCost(req)),
                    pagination: paginated.pagination
                },
                message: 'Stock movements retrieved successfully'
            });
        } catch (error) {
            console.error('Error in getMovements:', error);
            return res.status(500).json({
                success: false,
                error: error.message || 'Internal server error',
                message: 'Failed to retrieve stock movements'
            });
        }
    },

    /**
     * GET /movements/:productId
     * Get stock movements for a specific product
     */
    async getProductMovements(req, res) {
        try {
            const productId = parseInt(req.params.productId, 10);
            if (!productId || isNaN(productId)) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid product ID',
                    message: 'A valid numeric product ID is required'
                });
            }

            // Verify product exists
            const product = await inventoryModel.getProductById(productId);
            if (!product) {
                return res.status(404).json({
                    success: false,
                    error: 'Product not found',
                    message: `Product with ID ${productId} does not exist`
                });
            }

            const {
                page = 1,
                limit = 20,
                movement_type,
                type,
                start_date,
                end_date
            } = req.query;

            const result = await inventoryModel.getProductMovements(productId, {
                page: parseInt(page, 10) || 1,
                limit: parseInt(limit, 10) || 20,
                movement_type: movement_type || type || '',
                start_date: start_date ? String(start_date).trim() : '',
                end_date: end_date ? String(end_date).trim() : ''
            });

            const paginated = paginationResponse(result.movements, result.total, result.page, result.limit);

            return res.status(200).json({
                success: true,
                data: {
                    product: {
                        id: product.id,
                        sku: product.sku,
                        name: product.name,
                        stock_quantity: product.stock_quantity,
                        unit: product.unit
                    },
                    items: redactCostData(paginated.data, await canSeeCost(req)),
                    data: redactCostData(paginated.data, await canSeeCost(req)),
                    pagination: paginated.pagination
                },
                message: `Stock movements for product #${productId} retrieved successfully`
            });
        } catch (error) {
            console.error('Error in getProductMovements:', error);
            return res.status(500).json({
                success: false,
                error: error.message || 'Internal server error',
                message: 'Failed to retrieve product movements'
            });
        }
    },

    /**
     * GET /low-stock
     * Get products below minimum stock level
     */
    async getLowStockProducts(req, res) {
        try {
            const {
                page = 1,
                limit = 20,
                category_id,
                brand_id,
                search,
                out_of_stock_only
            } = req.query;

            const result = await inventoryModel.getLowStockProducts({
                page: parseInt(page, 10) || 1,
                limit: parseInt(limit, 10) || 20,
                category_id: category_id ? parseInt(category_id, 10) : null,
                brand_id: brand_id ? parseInt(brand_id, 10) : null,
                search: search ? String(search).trim() : '',
                out_of_stock_only: out_of_stock_only === 'true' || out_of_stock_only === true
            });

            const paginated = paginationResponse(result.products, result.total, result.page, result.limit);

            return res.status(200).json({
                success: true,
                data: {
                    items: redactCostData(paginated.data, await canSeeCost(req)),
                    data: redactCostData(paginated.data, await canSeeCost(req)),
                    pagination: paginated.pagination,
                    summary: redactCostData(result.summary, await canSeeCost(req))
                },
                message: 'Low stock products retrieved successfully'
            });
        } catch (error) {
            console.error('Error in getLowStockProducts:', error);
            return res.status(500).json({
                success: false,
                error: error.message || 'Internal server error',
                message: 'Failed to retrieve low stock products'
            });
        }
    },

    /**
     * GET /valuation
     * Total inventory value (cost price * quantity for all products)
     */
    async getValuation(req, res) {
        try {
            const { category_id, brand_id } = req.query;

            const valuation = await inventoryModel.getInventoryValuation({
                category_id: category_id ? parseInt(category_id, 10) : null,
                brand_id: brand_id ? parseInt(brand_id, 10) : null
            });

            return res.status(200).json({
                success: true,
                data: redactCostData(valuation, await canSeeCost(req)),
                message: 'Inventory valuation report retrieved successfully'
            });
        } catch (error) {
            console.error('Error in getValuation:', error);
            return res.status(500).json({
                success: false,
                error: error.message || 'Internal server error',
                message: 'Failed to retrieve inventory valuation'
            });
        }
    },

    /**
     * GET /audit
     * Stock audit report (expected vs actual)
     */
    async getStockAudit(req, res) {
        try {
            const {
                page = 1,
                limit = 20,
                category_id,
                brand_id,
                search,
                discrepancy_only
            } = req.query;

            const result = await inventoryModel.getStockAuditReport({
                page: parseInt(page, 10) || 1,
                limit: parseInt(limit, 10) || 20,
                category_id: category_id ? parseInt(category_id, 10) : null,
                brand_id: brand_id ? parseInt(brand_id, 10) : null,
                search: search ? String(search).trim() : '',
                discrepancy_only: discrepancy_only === 'true' || discrepancy_only === true
            });

            const paginated = paginationResponse(result.items, result.total, result.page, result.limit);

            return res.status(200).json({
                success: true,
                data: {
                    items: redactCostData(paginated.data, await canSeeCost(req)),
                    data: redactCostData(paginated.data, await canSeeCost(req)),
                    pagination: paginated.pagination,
                    summary: redactCostData(result.summary, await canSeeCost(req))
                },
                message: 'Stock audit report retrieved successfully'
            });
        } catch (error) {
            console.error('Error in getStockAudit:', error);
            return res.status(500).json({
                success: false,
                error: error.message || 'Internal server error',
                message: 'Failed to retrieve stock audit report'
            });
        }
    }
};

module.exports = inventoryController;
