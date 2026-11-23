'use strict';

(() => {
    const { pages, management, finance, field, select, integer, text, amount, customer, product, search, dates,
        column, currency, day, status, action, edit, details, table, repeat } = Admin;
    const { request } = ERP;
    const roles = [...finance, 'salesman'];
    const links = [['Point of sale', 'sales/pos.html'], ['Sales', 'sales/sales-list.html'], ['Invoices', 'sales/invoices.html'], ['Returns', 'sales/sales-returns.html'], ['Online orders', 'sales/online-orders.html']];
    const conditions = ['good', 'damaged', 'defective'];
    const returns = '/api/sales/returns';

    const tenders = ['cash', 'bank_transfer', 'card', 'digital_wallet', 'credit', 'split'];
    const invoiceColumns = [column('invoice_number', 'Invoice'), day('sale_date', 'Date'), column('customer_name', 'Customer'),
        currency('total_amount', 'Total'), currency('amount_paid', 'Paid'), currency('amount_due', 'Due'), status('payment_status', 'Payment'), status()];
    const invoicePath = row => '/api/sales/' + row.id;
    function invoice(data, context) {
        const target = context.dialog(data.invoice_number, details(invoiceColumns, data) +
            table([column('product_sku', 'SKU'), column('product_name', 'Product'), column('quantity'),
                currency('unit_price', 'Unit price'), currency('subtotal', 'Subtotal')], data.items) +
            details([currency('subtotal', 'Subtotal'), currency('discount_amount', 'Discount'), currency('tax_amount', 'Tax'),
                currency('total_amount', 'Total'), currency('change_return', 'Change')], data) +
            '<button class="erp-quiet erp-no-print" type="button">Print invoice</button>');
        target.querySelector('.erp-no-print').addEventListener('click', () => window.print());
    }
    const view = action('View invoice', async (row, context) => {
        const { data } = await request(invoicePath(row));
        invoice(data, context);
    });
    const salesList = {
        links, roles, path: '/api/sales', paged: true, filters: [search, ...dates, select('status', 'Status', ['completed', 'returned', 'cancelled']),
            select('payment_status', 'Payment', ['pending', 'partial', 'paid', 'refunded', 'overdue'])],
        columns: invoiceColumns, actions: [view]
    };
    pages['sales-list'] = { ...salesList, title: 'Sales history' };
    pages.invoices = { ...salesList, title: 'Invoices' };
    const forms = new WeakMap();
    const payment = select('payment_method', 'Payment method', tenders, { value: 'cash', required: true });
    pages.pos = {
        ...salesList, title: 'Point of sale', listTitle: 'Recent sales', listPermission: 'sales.view', filters: [],
        form: {
            path: '/api/sales', permission: 'sales.create', button: 'Complete sale',
            fields: [customer(), field('customer_name', 'Walk-in customer', { maxLength: 100 }),
                select('customer_type', 'Customer type', ['retail', 'wholesale'], { value: 'retail' }), payment,
                amount('amount_paid', 'Amount received', { value: 0, required: true }),
                select('discount_type', 'Discount type', ['none', 'percentage', 'fixed'], { value: 'none' }),
                amount('discount_value', 'Discount value'), text('notes', 'Notes')],
            async setup(form, _row, context) {
                for (const key of ['discount_type', 'discount_value']) {
                    form.elements[key].disabled = !Admin.can(context.user, 'sales.discount', management);
                    form.elements[key].closest('.erp-field').hidden = form.elements[key].disabled;
                }
                if (Admin.can(context.user, 'settings.view', management)) {
                    const { data } = await request('/api/settings');
                    const preferred = data.find(item => item.setting_key === 'default_payment_method')?.setting_value;
                    if (tenders.includes(preferred)) {
                        const option = [...form.elements.payment_method.options].find(item => item.value === preferred);
                        for (const item of form.elements.payment_method.options) item.defaultSelected = item === option;
                        form.elements.payment_method.value = preferred;
                    }
                }
                const lines = repeat(form, 'Sale items', [product({ required: true }), integer('quantity', 'Quantity', { min: 1, required: true, value: 1 })], { minimum: 1 });
                const splits = repeat(form, 'Split payment', [
                    select('method', 'Tender', ['cash', 'bank_transfer', 'card', 'digital_wallet', 'cheque'], { required: true }),
                    amount('amount', 'Amount', { min: 0.01, required: true })
                ]);
                const splitGroup = form.querySelectorAll('.erp-lines')[1];
                const update = () => {
                    splitGroup.hidden = form.elements.payment_method.value !== 'split';
                    splitGroup.disabled = splitGroup.hidden;
                };
                form.elements.payment_method.addEventListener('change', update);
                update();
                forms.set(form, { lines, splits });
                await lines.ready;
            },
            body(values, _row, form) {
                const { lines, splits } = forms.get(form);
                const items = lines.read().map(({ product_id, quantity }) => ({ product_id: Number(product_id), quantity }));
                if (new Set(items.map(item => item.product_id)).size !== items.length) throw new Error('Combine quantities for the same product on one line.');
                if (values.payment_method === 'credit' && !values.customer_id) throw new Error('Select a customer for a credit sale.');
                return { ...values, items, ...(values.payment_method === 'split' ? { payment_breakdown: splits.read() } : {}) };
            },
            async saved({ data }, form, context) {
                form.querySelectorAll('.erp-lines').forEach(group => { while (group.querySelectorAll('.erp-line').length > 1) group.querySelector('[data-remove-line]').click(); });
                form.reset();
                form.elements.payment_method.dispatchEvent(new Event('change'));
                context.notify('Sale recorded. Invoice ' + data.invoice_number + '.');
                await context.load();
                if (Admin.can(context.user, 'sales.view', roles)) await view.run(data, context);
            }
        }
    };

    const orderStatuses = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'];
    const orderTransitions = { pending: ['confirmed', 'cancelled'], confirmed: ['processing', 'cancelled'],
        processing: ['shipped', 'cancelled'], shipped: ['delivered'] };
    const orderPath = row => '/api/orders/' + row.id;
    pages['online-orders'] = {
        title: 'Online orders', links,
        path: '/api/orders', paged: true, filters: [search, select('status', 'Order status', [['open', 'Open orders'], ...orderStatuses])],
        columns: [column('id', 'ID'), column('order_number', 'Order'), day('created_at', 'Placed'), column('customer_name', 'Customer'),
            currency('total_amount', 'Total'), status('payment_status', 'Payment'), status(), column('tracking_number', 'Tracking')],
        actions: [
            action('View order', async (row, context) => {
                const { data } = await request(orderPath(row));
                context.dialog(data.order_number, details([column('customer_name', 'Customer'), column('customer_email', 'Email'),
                    column('customer_phone', 'Phone'), column('shipping_address', 'Shipping address'), column('notes'),
                    status('payment_method', 'Preferred payment'), currency('total_amount', 'Total'), status()], data) +
                    table([column('product_name', 'Product'), column('quantity'), currency('unit_price', 'Unit price'),
                        currency('subtotal', 'Subtotal')], data.items));
            }),
            action('Update status', (row, context) => edit('Update order status', item => orderPath(item) + '/status', [
                select('status', 'Next status', orderTransitions[row.status], { required: true }),
                field('tracking_number', 'Tracking number', { maxLength: 50 })
            ], { method: 'PATCH' }).run(row, context), { roles: management, permission: 'orders.manage', when: row => Boolean(orderTransitions[row.status]) })
        ]
    };

    pages['sales-returns'] = {
        title: 'Sales returns', links, roles, path: returns, listPermission: 'sales.view', paged: true,
        columns: [column('return_number', 'Return'), column('invoice_number', 'Invoice'), day('return_date', 'Date'),
            currency('total_amount', 'Refund'), status('refund_method', 'Refund method'), column('reason'), status()],
        form: {
            roles: management, permission: 'sales.return', path: returns, button: 'Record return',
            fields: [field('invoice_number', 'Invoice number', { required: true, maxLength: 30 }), select('product_id', 'Invoice item', [], { required: true }),
                integer('quantity', 'Return quantity', { min: 1, required: true, value: 1 }), select('condition_status', 'Condition', conditions, { value: 'good' }),
                select('refund_method', 'Refund method', ['cash', 'bank_transfer', 'credit_note'], { value: 'cash' }), text('reason', 'Reason', { required: true })],
            setup(form) {
                const invoice = form.elements.invoice_number;
                const products = form.elements.product_id;
                const find = document.createElement('button');
                find.type = 'button';
                find.className = 'erp-quiet';
                find.textContent = 'Find invoice';
                invoice.closest('.erp-field').append(find);
                invoice.addEventListener('input', () => { delete form.dataset.saleId; products.length = 1; });
                find.addEventListener('click', async () => {
                    const number = invoice.value.trim();
                    if (!number) { invoice.reportValidity(); return; }
                    const output = form.querySelector('.erp-form-actions p');
                    find.disabled = true;
                    products.length = 1;
                    delete form.dataset.saleId;
                    try {
                        const { data } = await request('/api/sales/invoice/' + encodeURIComponent(number));
                        if (invoice.value.trim() !== number) return;
                        const items = new Map();
                        for (const row of data.items) items.set(row.product_id, row.product_name);
                        for (const [id, name] of items) products.add(new Option(name, id));
                        form.dataset.saleId = data.id;
                        Admin.feedback(output, items.size ? 'Invoice loaded.' : 'The invoice has no returnable items.');
                    } catch (error) {
                        Admin.feedback(output, error.message, true);
                    } finally {
                        find.disabled = false;
                    }
                });
            },
            body({ product_id, quantity, condition_status, ...values }, _record, form) {
                if (!form.dataset.saleId) throw new Error('Find the invoice and select an item first.');
                return { sale_id: Number(form.dataset.saleId), items: [{ product_id: Number(product_id), quantity, condition_status }], refund_method: values.refund_method, reason: values.reason };
            }
        }
    };
})();
