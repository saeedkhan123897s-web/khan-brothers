'use strict';

(() => {
    const { pages, management, field, search, dates, select, lookup, amount, integer, text,
        column, currency, day, status, edit, remove, metrics, product } = Admin;
    const { request, money, escape: e } = ERP;
    const products = '/api/products';
    const catalog = '/admin/pages/inventory/products.html';
    const category = options => lookup('category_id', 'Category', products + '/categories', ['name'], options);
    const types = [['part', 'Spare part'], ['motorcycle', 'Motorcycle']];
    const typeField = (options = {}) => select('product_type', 'Product type', types, options);
    const brand = options => lookup('brand_id', 'Brand', products + '/brands', ['name'], options);
    const links = [
        ['Products', 'inventory/products.html'], ['Add product', 'inventory/add-product.html', management],
        ['Add motorcycle', 'inventory/add-product.html?product_type=motorcycle', management],
        ['Categories', 'inventory/categories.html'], ['Brands', 'inventory/brands.html'],
        ['Stock', 'inventory/stock.html'], ['Stock adjustment', 'inventory/stock-adjustment.html', management],
        ['Stock audit', 'inventory/stock-audit.html']
    ];

    for (const [type, title] of [['categories', 'Category'], ['brands', 'Brand']]) {
        const path = products + '/' + type;
        const fields = [field('name', title + ' name', { required: true, minLength: 2, maxLength: 100 }),
            text('description', 'Description', { keepEmpty: true }),
            ...(type === 'categories' ? [lookup('parent_id', 'Parent category', path, ['name'], { emptyAsNull: true })] : [])];
        const recordPath = row => path + '/' + row.id;
        pages[type] = {
            title: type === 'categories' ? 'Product categories' : 'Product brands', links, path,
            columns: [column('name'), column('description'), column('product_count', 'Products')],
            form: { roles: management, permission: 'catalogue.edit', fields, path, button: 'Add ' + title.toLowerCase() },
            actions: [edit('Edit ' + title.toLowerCase(), recordPath, fields, { permission: 'catalogue.edit' }), remove('Deactivate', recordPath, management, 'catalogue.edit')]
        };
    }

    const productFields = [
        typeField({ required: true, value: 'part' }),
        integer('model_year', 'Model year', { min: 1900, max: 2100, emptyAsNull: true }),
        integer('engine_cc', 'Engine size (cc)', { min: 1, max: 10000, emptyAsNull: true }),
        field('sku', 'SKU', { required: true, maxLength: 50 }), field('name', 'Product name', { required: true, minLength: 2, maxLength: 200 }),
        category({ emptyAsNull: true }), brand({ emptyAsNull: true }), field('barcode', 'Barcode', { maxLength: 100, emptyAsNull: true }),
        amount('cost_price', 'Cost price', { required: true, value: 0 }), amount('selling_price', 'Selling price', { required: true }),
        amount('wholesale_price', 'Wholesale price', { value: 0 }), integer('min_stock_level', 'Minimum stock', { value: 0 }),
        integer('max_stock_level', 'Maximum stock', { value: 0 }), field('unit', 'Unit', { value: 'piece', maxLength: 20 }),
        field('location', 'Location', { maxLength: 100, emptyAsNull: true }), text('description', 'Description', { keepEmpty: true })
    ];
    const image = field('image', 'Product image', { type: 'file' });
    const params = new URLSearchParams(location.search);
    const currentProduct = params.get('id');
    const newBike = params.get('product_type') === 'motorcycle';
    pages['add-product'] = {
        title: currentProduct ? 'Edit product' : newBike ? 'Add motorcycle' : 'Add product', links, roles: management,
        form: {
            path: currentProduct ? products + '/' + encodeURIComponent(currentProduct) : products,
            method: currentProduct ? 'PUT' : 'POST', button: 'Save product',
            fields: [...productFields, ...(!currentProduct ? [integer('stock_quantity', 'Opening stock', { value: 0 })] : []), image],
            values: async () => currentProduct ? (await request(products + '/' + encodeURIComponent(currentProduct))).data :
                newBike ? { product_type: 'motorcycle', unit: 'bike' } : {},
            setup(form, _record, { user }) {
                const type = form.elements.product_type;
                const toggle = (name, available) => {
                    const input = form.elements[name];
                    if (!input) return;
                    input.disabled = !available;
                    input.closest('.erp-field').hidden = !available;
                };
                const syncBike = () => {
                    const bike = type.value === 'motorcycle';
                    toggle('model_year', bike);
                    toggle('engine_cc', bike);
                };
                const finance = Admin.can(user, 'inventory.finance', Admin.finance);
                toggle('cost_price', finance);
                toggle('wholesale_price', finance);
                toggle('min_stock_level', finance);
                toggle('max_stock_level', finance);
                toggle('location', finance);
                toggle('stock_quantity', Admin.can(user, 'inventory.adjust', management));
                type.addEventListener('change', syncBike);
                syncBike();
            },
            async body(values, _record, form) {
                delete values.image;
                const file = form.elements.image.files[0];
                if (file) {
                    const data = new FormData();
                    data.append('image', file);
                    const response = await fetch('/api/uploads/images', { method: 'POST', body: data });
                    const result = await response.json();
                    if (!response.ok) throw new Error(result.error || result.message || 'Image upload failed.');
                    values.image_url = result.data.url;
                }
                return values;
            },
            saved: ({ data }, _form, { user }) => {
                if (Admin.can(user, 'inventory.view', Admin.staff)) {
                    location.assign(ERP.url(catalog, { product_type: data.product_type === 'motorcycle' ? 'motorcycle' : '' }));
                }
            }
        }
    };

    const stockFilters = [search, typeField(), category(), brand(), select('stock_status', 'Stock level', [['needs_attention', 'Needs attention'], 'in_stock', 'low_stock', 'out_of_stock', 'overstocked'])];
    pages.stock = {
        title: 'Stock levels', links, path: '/api/inventory/stock', paged: true, filters: stockFilters,
        columns: [column('sku', 'SKU'), column('name', 'Product'), column('category_name', 'Category'), column('brand_name', 'Brand'),
            column('stock_quantity', 'On hand'), column('min_stock_level', 'Minimum'), column('location'), status('stock_status')]
    };
    pages['stock-adjustment'] = {
        title: 'Stock adjustment', links, roles: management, path: '/api/inventory/movements', listPermission: 'inventory.view', paged: true,
        columns: [day('created_at', 'Date'), column('product_name', 'Product'), status('movement_type', 'Movement'),
            column('previous_stock', 'Previous'), column('new_stock', 'New stock'), column('notes')],
        filters: [search, ...dates],
        form: {
            fields: [product({ required: true }), select('adjustment_type', 'Change', ['increase', 'decrease', 'set'], { required: true, value: 'increase' }),
                integer('quantity', 'Quantity', { required: true }), text('notes', 'Reason', { required: true })],
            path: '/api/inventory/adjust', button: 'Record adjustment'
        }
    };
    const stockAudit = {
        title: 'Stock reconciliation', links, path: '/api/inventory/audit', paged: true,
        filters: [search, category(), brand(), select('discrepancy_only', 'Stock discrepancies', [['true', 'Discrepancies only']])],
        columns: [column('sku', 'SKU'), column('name', 'Product'), column('system_stock', 'Recorded stock'),
            column('expected_movement_stock', 'Expected from movements'), column('discrepancy', 'Difference'), status('audit_status')],
        summary: payload => metrics([column('total_audited', 'Products checked'), column('balanced_items', 'Balanced'),
            column('discrepancy_items', 'Discrepancies')], payload.data.summary)
    };
    pages['stock-audit'] = stockAudit;
    pages['inventory-audit'] = { ...stockAudit, links: Admin.auditLinks };

    const root = document.querySelector('[data-page="inventory-products"]');
    if (!root) return;
    const setSidebarUser = Admin.mountSidebar(links);
    const byId = id => document.getElementById(id);
    const form = byId('inventoryFilters');
    const rows = byId('inventoryRows');
    const pager = byId('inventoryPagination');
    let page = 1;
    let loadId = 0;
    let writable = false;
    let canViewUsedBikes = false;
    const stockValue = row => Number(row.stock_quantity) * Number(row.selling_price);

    async function load() {
        const id = ++loadId;
        rows.innerHTML = '<tr><td class="inventory-empty" colspan="7">Loading inventory…</td></tr>';
        pager.replaceChildren();
        try {
            const { data } = await request(ERP.url('/api/inventory/stock', {
                page, limit: 20, search: byId('inventorySearch').value.trim(),
                product_type: byId('inventoryProductType').value, category_id: byId('inventoryCategory').value, stock_status: byId('inventoryStockStatus').value
            }));
            if (id !== loadId) return;
            const items = data.items;
            byId('inventoryProductCount').textContent = data.pagination.total;
            byId('inventoryUnitCount').textContent = items.reduce((total, row) => total + Number(row.stock_quantity), 0);
            byId('inventoryLowStock').textContent = items.filter(row => ['low_stock', 'out_of_stock'].includes(row.stock_status)).length;
            byId('inventoryRetailValue').textContent = money(items.reduce((total, row) => total + stockValue(row), 0));
            rows.innerHTML = items.map(row => {
                const name = `<strong>${e(row.name)}</strong>`;
                const used = row.motorcycle_condition === 'used';
                const editPath = used
                    ? canViewUsedBikes && ERP.url('/admin/pages/purchases/used-bikes.html', { search: row.sku })
                    : writable && '/admin/pages/inventory/add-product.html?id=' + Number(row.id);
                const kind = used ? ' · Used motorcycle' : row.product_type === 'motorcycle' ? ' · Motorcycle' : '';
                return `<tr><td>${editPath ? `<a href="${e(editPath)}">${name}</a>` : name}<small>${e(row.sku)}${kind}</small></td>
                    <td>${e(row.category_name || '—')}</td><td>${e(row.stock_quantity)} ${e(row.unit)}</td><td>${e(row.location || '—')}</td>
                    <td>${e(money(row.selling_price))}</td><td>${e(money(stockValue(row)))}</td>
                    <td><span class="inventory-badge inventory-badge--${e(row.stock_status)}">${e(ERP.label(row.stock_status))}</span></td></tr>`;
            }).join('') || '<tr><td class="inventory-empty" colspan="7">No products found.</td></tr>';
            const pages = Number(data.pagination.totalPages);
            if (pages > 1) pager.innerHTML = `<button class="inventory-button inventory-button--quiet" data-page="${page - 1}" ${page <= 1 ? 'disabled' : ''}>Previous</button><span>Page ${page} of ${pages}</span><button class="inventory-button inventory-button--quiet" data-page="${page + 1}" ${page >= pages ? 'disabled' : ''}>Next</button>`;
        } catch (error) {
            if (id === loadId) rows.innerHTML = `<tr><td class="inventory-empty" colspan="7">${e(error.message)}</td></tr>`;
        }
    }

    async function init() {
        try {
            const user = await Admin.getSession();
            if (!Admin.staff.includes(user?.role)) { location.replace('/admin/login.html'); return; }
            setSidebarUser(user);
            writable = Admin.can(user, 'catalogue.edit', management);
            canViewUsedBikes = Admin.can(user, 'used_bikes.view', Admin.finance);
            byId('inventoryProductType').value = ['part', 'motorcycle'].includes(params.get('product_type')) ? params.get('product_type') : '';
            byId('addProduct').hidden = !writable;
            byId('addMotorcycle').hidden = !writable;
            form.addEventListener('submit', event => { event.preventDefault(); page = 1; load(); });
            byId('refreshInventory').addEventListener('click', load);
            pager.addEventListener('click', event => {
                if (event.target.dataset.page) { page = Number(event.target.dataset.page); load(); }
            });
            const { data } = await request(products + '/categories');
            for (const record of data) byId('inventoryCategory').add(new Option(record.name, record.id));
            await load();
        } catch (error) {
            if (error.status === 401) location.replace('/admin/login.html');
            else rows.innerHTML = `<tr><td class="inventory-empty" colspan="7">${e(error.message)}</td></tr>`;
        }
    }

    init();
})();
