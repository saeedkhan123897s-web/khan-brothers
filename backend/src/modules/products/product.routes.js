const express = require('express');
const { body, param, query } = require('express-validator');
const ProductModel = require('./product.model');
const { authenticate, optionalAuth } = require('../../middleware/auth');
const { requirePermission } = require('../../middleware/permissions');
const { validate } = require('../../middleware/validate');
const { asyncHandler } = require('../../utils/apiHelpers');
const { hasPermission, getOverrides } = require('../../utils/routePermissions');
const { query: readRows, queryInsert, transaction } = require('../../config/database');

const router = express.Router();
const idRule = param('id').isInt({ min: 1 }).withMessage('ID must be a positive integer');
const write = [authenticate, requirePermission('catalogue.edit')];
const bikeFields = ['product_type', 'model_year', 'engine_cc'];
const productTypes = ['part', 'motorcycle'];
const bikeRules = [
    body('product_type').optional().isIn(productTypes),
    body('model_year').optional({ values: 'null' }).isInt({ min: 1900, max: 2100 }),
    body('engine_cc').optional({ values: 'null' }).isInt({ min: 1, max: 10000 })
];
const typeFilter = query('product_type').optional().isIn(productTypes);
const conditionFilter = query('motorcycle_condition').optional().isIn(['new', 'used']);
router.use(optionalAuth, asyncHandler(async (req, res, next) => {
    res.locals.canSeeCost = hasPermission(req.user, 'inventory.finance', await getOverrides(req));
    next();
}));

function presentProduct(product, canSeeCost) {
    if (!product) return product;
    const result = { ...product };
    if (!canSeeCost) {
        delete result.cost_price;
        delete result.wholesale_price;
        delete result.min_stock_level;
        delete result.max_stock_level;
        delete result.location;
        if (result.stock_quantity !== undefined) {
            result.in_stock = Number(result.stock_quantity) > 0;
            delete result.stock_quantity;
        }
    }
    return result;
}

router.get('/', [
    typeFilter, conditionFilter,
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('category_id').optional().isInt({ min: 1 }),
    query('brand_id').optional().isInt({ min: 1 }),
    query('min_price').optional().isFloat({ min: 0 }),
    query('max_price').optional().isFloat({ min: 0 })
], validate, asyncHandler(async (req, res) => {
    const result = await ProductModel.findAll({ ...req.query, is_active: 1 });
    res.json({ success: true, data: result.products.map(product => presentProduct(product, res.locals.canSeeCost)), pagination: { total: result.total, page: result.page, limit: result.limit, totalPages: Math.ceil(result.total / result.limit) } });
}));

router.get('/search', [query('q').trim().notEmpty(), typeFilter, conditionFilter], validate, asyncHandler(async (req, res) => {
    const result = await ProductModel.search({ ...req.query, query: req.query.q, is_active: 1 });
    res.json({ success: true, data: result.products.map(product => presentProduct(product, res.locals.canSeeCost)), pagination: { total: result.total, page: result.page, limit: result.limit, totalPages: Math.ceil(result.total / result.limit) } });
}));

router.get('/categories', asyncHandler(async (req, res) => {
    const result = await ProductModel.findAllCategories({ ...req.query, is_active: 1, all: req.query.all ?? true });
    res.json({ success: true, data: result.categories, pagination: { total: result.total, page: result.page, limit: result.limit } });
}));

router.post('/categories', ...write, [body('name').trim().isLength({ min: 2, max: 100 }), body('parent_id').optional({ checkFalsy: true }).isInt({ min: 1 })], validate, asyncHandler(async (req, res) => {
    const category = await ProductModel.createCategory({ name: req.body.name, description: req.body.description, parent_id: req.body.parent_id || null });
    res.status(201).json({ success: true, data: category });
}));

router.get('/categories/:id', idRule, validate, asyncHandler(async (req, res) => {
    const category = await ProductModel.findCategoryById(req.params.id);
    if (!category || !category.is_active) return res.status(404).json({ success: false, error: 'Category not found' });
    res.json({ success: true, data: category });
}));

router.put('/categories/:id', ...write, idRule, [body('name').optional().trim().isLength({ min: 2, max: 100 }), body('parent_id').optional({ nullable: true }).isInt({ min: 1 })], validate, asyncHandler(async (req, res) => {
    const category = await ProductModel.updateCategory(req.params.id, req.body);
    if (!category) return res.status(404).json({ success: false, error: 'Category not found' });
    res.json({ success: true, data: category });
}));

router.delete('/categories/:id', ...write, idRule, validate, asyncHandler(async (req, res) => {
    if (!(await ProductModel.findCategoryById(req.params.id))) return res.status(404).json({ success: false, error: 'Category not found' });
    await ProductModel.deleteCategory(req.params.id);
    res.json({ success: true, message: 'Category deactivated' });
}));

router.get('/brands', asyncHandler(async (req, res) => {
    const result = await ProductModel.findAllBrands({ ...req.query, is_active: 1, all: req.query.all ?? true });
    res.json({ success: true, data: result.brands, pagination: { total: result.total, page: result.page, limit: result.limit } });
}));

router.post('/brands', ...write, [body('name').trim().isLength({ min: 2, max: 100 })], validate, asyncHandler(async (req, res) => {
    const brand = await ProductModel.createBrand({ name: req.body.name, description: req.body.description });
    res.status(201).json({ success: true, data: brand });
}));

router.get('/brands/:id', idRule, validate, asyncHandler(async (req, res) => {
    const brand = await ProductModel.findBrandById(req.params.id);
    if (!brand || !brand.is_active) return res.status(404).json({ success: false, error: 'Brand not found' });
    res.json({ success: true, data: brand });
}));

router.put('/brands/:id', ...write, idRule, [body('name').optional().trim().isLength({ min: 2, max: 100 })], validate, asyncHandler(async (req, res) => {
    const brand = await ProductModel.updateBrand(req.params.id, req.body);
    if (!brand) return res.status(404).json({ success: false, error: 'Brand not found' });
    res.json({ success: true, data: brand });
}));

router.delete('/brands/:id', ...write, idRule, validate, asyncHandler(async (req, res) => {
    if (!(await ProductModel.findBrandById(req.params.id))) return res.status(404).json({ success: false, error: 'Brand not found' });
    await ProductModel.deleteBrand(req.params.id);
    res.json({ success: true, message: 'Brand deactivated' });
}));

router.get('/sku/:sku', asyncHandler(async (req, res) => {
    const product = await ProductModel.findBySku(req.params.sku);
    if (!product || !product.is_active) return res.status(404).json({ success: false, error: 'Product not found' });
    res.json({ success: true, data: presentProduct(product, res.locals.canSeeCost) });
}));

router.get('/barcode/:barcode', asyncHandler(async (req, res) => {
    const product = await ProductModel.findByBarcode(req.params.barcode);
    if (!product || !product.is_active) return res.status(404).json({ success: false, error: 'Product not found' });
    res.json({ success: true, data: presentProduct(product, res.locals.canSeeCost) });
}));

router.get('/:id', idRule, validate, asyncHandler(async (req, res) => {
    const product = await ProductModel.findById(req.params.id);
    if (!product || !product.is_active) return res.status(404).json({ success: false, error: 'Product not found' });
    const data = presentProduct(product, res.locals.canSeeCost);
    if (data.motorcycle_condition === 'used') {
        const photos = await readRows(`SELECT bp.image_url FROM used_bike_photos bp JOIN used_bikes b ON b.id=bp.used_bike_id
            WHERE b.product_id=? ORDER BY bp.position`, [product.id]);
        data.images = [...new Set([data.image_url, ...photos.map(row => row.image_url)].filter(Boolean))].slice(0, 3);
    }
    res.json({ success: true, data });
}));

router.post('/', ...write, [
    ...bikeRules,
    body('sku').trim().notEmpty().isLength({ max: 50 }),
    body('name').trim().isLength({ min: 2, max: 200 }),
    body('cost_price').optional().isFloat({ min: 0 }),
    body('selling_price').isFloat({ min: 0 }),
    body('wholesale_price').optional().isFloat({ min: 0 }),
    body('stock_quantity').optional().isInt({ min: 0 })
], validate, asyncHandler(async (req, res) => {
    if (await ProductModel.skuExists(req.body.sku)) return res.status(409).json({ success: false, error: 'SKU already exists' });
    if (req.body.barcode && await ProductModel.barcodeExists(req.body.barcode)) return res.status(409).json({ success: false, error: 'Barcode already exists' });
    const allowed = [...bikeFields, 'sku', 'name', 'description', 'category_id', 'brand_id', 'cost_price', 'selling_price', 'wholesale_price', 'stock_quantity', 'min_stock_level', 'max_stock_level', 'unit', 'location', 'barcode', 'image_url'];
    const data = Object.fromEntries(allowed.filter(key => req.body[key] !== undefined).map(key => [key, req.body[key]]));
    if (data.product_type !== 'motorcycle') { data.model_year = null; data.engine_cc = null; }
    if (Number(data.stock_quantity) > 0 && !hasPermission(req.user, 'inventory.adjust', await getOverrides(req))) {
        return res.status(403).json({ success: false, error: 'Stock adjustment permission is required to add opening stock.' });
    }
    const product = await ProductModel.create(data);
    const initialStock = Number(product.stock_quantity) || 0;
    if (initialStock > 0) {
        await queryInsert(`INSERT INTO stock_movements (product_id,movement_type,quantity,previous_stock,new_stock,cost_price,reference_type,notes,created_by) VALUES (?,'adjustment',?,0,?,?, 'product', 'Initial stock', ?)`, [product.id, initialStock, initialStock, product.cost_price, req.user.id]);
    }
    res.status(201).json({ success: true, data: presentProduct(product, res.locals.canSeeCost) });
}));

router.put('/:id', ...write, idRule, [
    ...bikeRules,
    body('name').optional().trim().isLength({ min: 2, max: 200 }),
    body('cost_price').optional().isFloat({ min: 0 }),
    body('selling_price').optional().isFloat({ min: 0 }),
    body('stock_quantity').optional().isInt({ min: 0 })
], validate, asyncHandler(async (req, res) => {
    const old = await ProductModel.findById(req.params.id);
    if (!old) return res.status(404).json({ success: false, error: 'Product not found' });
    if (old.motorcycle_condition === 'used') {
        return res.status(409).json({ success: false, error: 'Edit this listing from Used motorcycles.' });
    }
    const allowed = [...bikeFields, 'sku', 'name', 'description', 'category_id', 'brand_id', 'cost_price', 'selling_price', 'wholesale_price', 'min_stock_level', 'max_stock_level', 'unit', 'location', 'barcode', 'image_url', 'is_active'];
    const data = Object.fromEntries(allowed.filter(key => req.body[key] !== undefined).map(key => [key, req.body[key]]));
    if (data.sku && await ProductModel.skuExists(data.sku, req.params.id)) return res.status(409).json({ success: false, error: 'SKU already exists' });
    if (data.barcode && await ProductModel.barcodeExists(data.barcode, req.params.id)) return res.status(409).json({ success: false, error: 'Barcode already exists' });
    if ((data.product_type ?? old.product_type) !== 'motorcycle') { data.model_year = null; data.engine_cc = null; }
    if (req.body.stock_quantity !== undefined && !hasPermission(req.user, 'inventory.adjust', await getOverrides(req))) {
        return res.status(403).json({ success: false, error: 'Stock adjustment permission is required.' });
    }
    await ProductModel.update(req.params.id, data);
    if (req.body.stock_quantity !== undefined && Number(req.body.stock_quantity) !== Number(old.stock_quantity)) {
        await transaction(async connection => {
            const [rows] = await connection.execute('SELECT stock_quantity,cost_price FROM products WHERE id=? FOR UPDATE', [req.params.id]);
            const current = rows[0];
            const nextStock = Number(req.body.stock_quantity);
            const previous = Number(current.stock_quantity);
            await connection.execute('UPDATE products SET stock_quantity=? WHERE id=?', [nextStock, req.params.id]);
            await connection.execute(`INSERT INTO stock_movements (product_id,movement_type,quantity,previous_stock,new_stock,cost_price,reference_type,notes,created_by) VALUES (?,'adjustment',?,?,?,?, 'product_edit','Stock set from product form',?)`, [req.params.id, Math.abs(nextStock - previous), previous, nextStock, current.cost_price, req.user.id]);
        });
    }
    const updatedProduct = await ProductModel.findById(req.params.id);
    res.json({ success: true, data: presentProduct(updatedProduct, res.locals.canSeeCost) });
}));

router.delete('/:id', ...write, idRule, validate, asyncHandler(async (req, res) => {
    const product = await ProductModel.findById(req.params.id);
    if (!product) return res.status(404).json({ success: false, error: 'Product not found' });
    if (product.motorcycle_condition === 'used') {
        return res.status(409).json({ success: false, error: 'Pause this listing from Used motorcycles.' });
    }
    await ProductModel.softDelete(req.params.id);
    res.json({ success: true, message: 'Product deactivated' });
}));

module.exports = router;
