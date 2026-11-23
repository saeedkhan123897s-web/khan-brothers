'use strict';

(() => {
    const { pages, finance, management, staff, field, select, lookup, amount, integer, text, search, dates,
        column, currency, day, status, active, action, edit, details, table, metrics } = Admin;
    const { request, escape: e, money } = ERP;

    const endpoint = '/api/used-bikes';
    const listPage = '/admin/pages/purchases/used-bikes.html';
    const logo = '/assets/icons/image.png';
    const view = 'used_bikes.view';
    const manage = 'used_bikes.manage';
    const sell = 'used_bikes.sell';
    const salesAccess = [view, sell];
    const path = row => endpoint + '/' + row.id;
    const allowedPhoto = /^\/uploads\/[a-z0-9_-]+\.(?:jpg|jpeg|png|webp|gif)$/i;
    const imageTypes = 'image/jpeg,image/png,image/webp,image/gif';
    const bikeStatuses = [['reconditioning', 'Reconditioning'], ['listed', 'Listed'], ['reserved', 'Reserved'], ['sold', 'Sold']];
    const saleMethods = [
        ['cash', 'Cash'], ['bank_transfer', 'Bank Transfer'], ['jazzcash', 'JazzCash'],
        ['easypaisa', 'EasyPaisa'], ['card', 'Card'], ['qist', 'Qist / Udhar']
    ];
    const tender = saleMethods.filter(([method]) => method !== 'qist');
    const methodNames = Object.fromEntries([...saleMethods, ['digital_wallet', 'Digital wallet'], ['cheque', 'Cheque'], ['credit', 'Credit'], ['split', 'Split']]);
    const purchaseMethods = tender.filter(([method]) => !['jazzcash', 'easypaisa'].includes(method)).concat([['digital_wallet', 'Digital wallet'], ['cheque', 'Cheque']]);
    const paidVia = () => select('payment_method', 'Paid via', purchaseMethods, { required: true, value: 'cash' });
    const model = field('model', 'Model', { maxLength: 100 });
    const price = (name, title, options = {}) => amount(name, title, { max: 99999999.99, ...options });
    const cents = value => Math.round(Number(value || 0) * 100);
    function schedule(balance, monthly) {
        const count = balance > 0 && monthly > 0 ? Math.ceil(balance / monthly) : 0;
        return { count, last: count ? (balance - (count - 1) * monthly) / 100 : 0 };
    }
    const withRequestKey = (values, _row, form) => ({
        ...values, request_key: form.dataset.requestKey ||= crypto.randomUUID()
    });
    const thumbnail = {
        key: 'image_url', title: 'Photo',
        render: (source, row) => allowedPhoto.test(source || '')
            ? `<img class="kb-bike-thumb" src="${e(source)}" alt="${e(row.name)}" loading="lazy">`
            : '<span class="kb-photo-empty">—</span>'
    };

    async function uploadPhotos(files) {
        return Promise.all(Array.from(files, async file => {
            const body = new FormData();
            body.append('image', file);
            const response = await fetch('/api/uploads/images', { method: 'POST', body });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || result.message || 'Photo upload failed.');
            return result.data.url;
        }));
    }

    const costs = [
        currency('purchase_price', 'Purchase'), currency('repair_cost', 'Repair'), currency('other_cost', 'Other cost'),
        currency('total_cost', 'Total Cost'), currency('asking_price', 'Sell Price'), currency('expected_margin', 'Expected Profit')
    ];
    const saleColumns = [
        column('name', 'Bike'), column('model', 'Model'), column('customer_name', 'Customer'), day('resale_date', 'Date'),
        column('payment_method', 'Payment', value => methodNames[value] || ERP.label(value)),
        currency('sale_amount', 'Sold Price'), currency('total_cost', 'Total Cost'), currency('actual_margin', 'Real Profit')
    ];
    const expenseColumns = [day('expense_date', 'Date'), column('category'), column('description'), currency('amount', 'Expense')];

    function matchingFilters(statusOptions = bikeStatuses, customerStatus = false) {
        return [{ ...search, label: 'Search bike, customer or chassis' }, field('bike', 'Bike', { maxLength: 100 }),
            model, amount('min_price', 'Minimum price'), amount('max_price', 'Maximum price'),
            select(customerStatus ? 'customer_status' : 'status', 'Status', statusOptions),
            select('payment_method', 'Payment method', [...saleMethods, ['digital_wallet', 'Digital wallet'], ['cheque', 'Cheque'], ['credit', 'Credit'], ['split', 'Split']])];
    }

    function photoGallery(data) {
        const sources = [...new Set((data.photos || []).map(photo => photo.image_url).concat(data.image_url || []))].filter(source => allowedPhoto.test(source));
        return sources.length ? `<div class="kb-bike-gallery">${sources.map(source => `<img src="${e(source)}" alt="${e(data.name)}">`).join('')}</div>` : '';
    }

    const viewRecord = action('Details', async (row, context) => {
        const { data } = await request(path(row));
        context.dialog(data.name + ' · ' + data.sku, photoGallery(data) +
            details([
                column('model'), status(), column('seller_name', 'Seller'), column('seller_phone', 'Seller phone'),
                column('chassis_number', 'Chassis'), column('registration_number', 'Plate'),
                column('engine_condition', 'Engine'), column('tyre_condition', 'Tyres'), column('body_condition', 'Body'),
                day('acquired_on', 'Acquired'), column('intake_notes', 'Intake notes'), ...costs,
                currency('sale_amount', 'Sold Price'), currency('actual_margin', 'Real Profit')
            ], data) + '<h3>Repair and other costs</h3>' +
            table([day('worked_on', 'Date'), status('cost_type', 'Cost type'), column('description'), currency('amount', 'Paid')], data.work));
    });

    const recondition = edit('Record work or cost', row => path(row) + '/work', [
        field('worked_on', 'Date', { type: 'date' }),
        select('cost_type', 'Cost type', [['repair', 'Repair'], ['other', 'Paperwork, transport or other']], { required: true, value: 'repair' }),
        text('description', 'Work or cost details', { required: true, minLength: 2, maxLength: 255 }),
        price('amount', 'Amount paid (PKR)', { required: true, value: 0 }), paidVia()
    ], { method: 'POST', permission: manage, body: withRequestKey, when: row => row.status === 'reconditioning' });

    function listingAction(title, matchingStatus) {
        return action(title, (row, context) => edit(title, item => path(item) + '/listing', [
            price('selling_price', 'Public selling price (PKR)', { required: true, min: 0.01 }),
            text('description', 'Public description', { maxLength: 2000, keepEmpty: true })
        ], {
            values: item => ({ ...item, selling_price: item.asking_price ?? '' }),
            body: values => ({ ...values, listed: true })
        }).run(row, context), { roles: management, permission: manage, when: row => row.status === matchingStatus });
    }

    const pause = action('Send to maintenance', async (row, context) => {
        const response = await request(path(row) + '/listing', { method: 'PUT', body: { listed: false } });
        context.notify(response.message);
        await context.load();
    }, { roles: management, permission: manage, when: row => row.status === 'listed' });

    pages['used-bikes'] = {
        title: 'Stock', roles: finance, permission: view,
        path: endpoint, query: { scope: 'stock' }, paged: true, listTitle: 'Motorcycle inventory',
        liveFilters: true, filters: matchingFilters(bikeStatuses.slice(0, 2)),
        exportPath: endpoint + '/export/stock',
        summary: payload => metrics([
            column('stock_count', 'Total Stock Bikes'), currency('stock_capital', 'Total Capital'), currency('expected_profit', 'Total Expected Profit')
        ], payload.summary || {}),
        columns: [thumbnail, column('name', 'Bike'), column('model'), status(), ...costs],
        actions: [viewRecord, recondition, listingAction('List for sale', 'reconditioning'), listingAction('Edit listing', 'listed'), pause]
    };

    pages['buy-used-bike'] = {
        title: 'Purchase Bike', roles: management, permission: manage,
        form: {
            path: endpoint, button: 'Record purchase',
            fields: [
                field('name', 'Bike Name', { required: true, minLength: 2, maxLength: 200 }),
                { ...model, required: true }, lookup('brand_id', 'Brand', '/api/products/brands', ['name'], { emptyAsNull: true }),
                integer('model_year', 'Model year', { min: 1900, max: 2100, emptyAsNull: true }),
                integer('engine_cc', 'Engine size (cc)', { min: 1, max: 10000, emptyAsNull: true }),
                field('chassis_number', 'Chassis No', { maxLength: 50 }),
                field('registration_number', 'Plate No', { maxLength: 30 }),
                field('engine_condition', 'Engine condition', { maxLength: 120 }),
                field('tyre_condition', 'Tyre condition', { maxLength: 120 }),
                field('body_condition', 'Body condition', { maxLength: 120 }),
                field('photos', 'Bike photos (2–3)', { type: 'file', accept: imageTypes, multiple: true, required: true }),
                field('seller_name', 'Seller name', { required: true, minLength: 2, maxLength: 100 }),
                field('seller_phone', 'Seller phone', { type: 'tel', maxLength: 20 }),
                field('acquired_on', 'Purchase date', { type: 'date' }),
                price('purchase_price', 'Purchase Price (PKR)', { required: true }),
                price('repair_cost', 'Repair Cost (PKR)', { value: 0 }),
                price('other_cost', 'Other Cost (PKR)', { value: 0 }),
                price('selling_price', 'Expected Sell Price (PKR)', { min: 0.01 }), paidVia(),
                text('intake_notes', 'Private intake and inspection notes', { maxLength: 2000 })
            ],
            setup(form) {
                const totals = document.createElement('div');
                totals.className = 'erp-wide kb-calculation';
                totals.setAttribute('aria-live', 'polite');
                form.querySelector('.erp-form-actions').before(totals);
                const update = () => {
                    const total = ['purchase_price', 'repair_cost', 'other_cost']
                        .reduce((cost, key) => cost + Math.round(Number(form.elements[key].value || 0) * 100), 0) / 100;
                    const sellPrice = form.elements.selling_price.value;
                    totals.textContent = 'Total Capital ' + money(total) + ' · Expected Profit ' +
                        (sellPrice ? money(Number(sellPrice) - total) : '—');
                };
                form.addEventListener('input', update);
                form.addEventListener('reset', () => setTimeout(update));
                update();
            },
            async body(values, row, form) {
                const files = form.elements.photos.files;
                if (files.length < 2 || files.length > 3) throw new Error('Choose two or three motorcycle photos.');
                const selected = Array.from(files, file => [file.name, file.size, file.lastModified].join(':')).join('|');
                if (form.uploadedPhotos?.selected !== selected) {
                    form.uploadedPhotos = { selected, paths: await uploadPhotos(files) };
                }
                return withRequestKey({ ...values, photos: form.uploadedPhotos.paths }, row, form);
            },
            saved: (_payload, form, { user }) => {
                if (Admin.can(user, view, finance)) location.assign(listPage);
                else {
                    form.reset();
                    delete form.dataset.requestKey;
                    delete form.uploadedPhotos;
                }
            }
        }
    };

    async function receipt(id, context) {
        const { data } = await request(endpoint + '/receipts/' + id);
        const title = 'Receipt ' + data.invoice_number;
        const qist = data.payment_method === 'qist';
        const plan = schedule(cents(data.selling_price) - cents(data.initial_payment), cents(data.monthly_installment));
        const share = [
            'Khan Brothers · ' + title, 'Date: ' + ERP.date(data.sale_date),
            'Bike: ' + [data.product_name, data.model].filter(Boolean).join(' · '), 'Chassis: ' + (data.chassis_number || '—'),
            'Customer: ' + data.customer_name,
            ...(qist ? ['Bike price: ' + money(data.bike_price), 'Interest: ' + money(data.interest_amount) + ' (' + Number(data.interest_rate) + '%)',
                'Total payable: ' + money(data.selling_price), 'Advance: ' + money(data.initial_payment),
                'Monthly Qist: ' + money(data.monthly_installment), 'Last scheduled Qist: ' + money(plan.last),
                'Next due: ' + ERP.date(data.next_due_date)] : ['Sold price: ' + money(data.selling_price)]),
            'Payment: ' + (methodNames[data.payment_method] || ERP.label(data.payment_method)),
            'Paid: ' + money(data.amount_paid), 'Remaining: ' + money(data.amount_due)
        ].join('\n');
        const target = context.dialog(title, `<article class="kb-receipt"><div class="kb-receipt-header"><img src="${logo}" alt="KB"><strong>Khan Brothers</strong></div>
            ${details([
                column('invoice_number', 'Receipt No'), day('sale_date', 'Date'), column('product_name', 'Bike'), column('model'),
                column('product_sku', 'SKU'), column('chassis_number', 'Chassis No'), column('registration_number', 'Plate No'),
                column('customer_name', 'Customer'), column('customer_phone', 'Phone'), column('buyer_cnic', 'CNIC'),
                ...(qist ? [
                    currency('bike_price', 'Bike price'), column('interest_amount', 'Interest', value => money(value) + ' (' + Number(data.interest_rate) + '%)'),
                    currency('selling_price', 'Total payable'), currency('initial_payment', 'Advance'),
                    currency('monthly_installment', 'Monthly Qist'), column(() => plan.count, 'Scheduled qists'),
                    currency(() => plan.last, 'Last scheduled Qist'), day('next_due_date', 'Next due date')
                ] : [currency('selling_price', 'Sold Price')]),
                column('payment_method', 'Payment', value => methodNames[value] || ERP.label(value)),
                currency('amount_paid', 'Paid'), currency('amount_due', 'Remaining'), status('payment_status', 'Payment status')
            ], data)}</article>
            <div class="erp-form-actions erp-no-print"><button type="button" data-print-receipt>Print</button>
                <a class="kb-action-link" href="https://wa.me/?text=${e(encodeURIComponent(share))}" target="_blank" rel="noopener noreferrer">WhatsApp Share</a></div>`);
        target.querySelector('[data-print-receipt]').addEventListener('click', () => window.print());
    }

    const sellBike = action('Sell bike', async (row, context) => {
        const { data: enabled } = await request(endpoint + '/payment-methods');
        if (!enabled.length) throw new Error('Enable at least one payment method in Settings → Payment.');
        const options = enabled.map(({ key, label }) => [key, label]);
        const fields = [
            field('customer_name', 'Customer Name', { required: true, minLength: 2, maxLength: 100 }),
            field('customer_phone', 'Phone', { type: 'tel', required: true, minLength: 7, maxLength: 20 }),
            field('customer_cnic', 'CNIC', { maxLength: 15, minLength: 13 }),
            price('selling_price', 'Sell Price (PKR)', { required: true, min: 0.01 }),
            select('payment_method', 'Payment Method', options, { required: true, value: options[0][0] }),
            amount('interest_rate', 'Flat interest on bike price (%)', { value: 0, max: 999.99 }),
            price('advance', 'Advance (PKR)', { value: 0 }),
            select('advance_method', 'Advance payment method', options.filter(([key]) => key !== 'qist')),
            price('monthly_installment', 'Monthly Qist (PKR)', { min: 0.01 }),
            field('next_due_date', 'Next payment date', { type: 'date' })
        ];
        return edit('Sell ' + row.name, item => path(item) + '/sell', fields, {
            method: 'POST', values: item => ({ selling_price: item.asking_price }),
            setup(form) {
                const remaining = document.createElement('p');
                remaining.className = 'erp-wide kb-calculation';
                remaining.setAttribute('aria-live', 'polite');
                form.querySelector('.erp-form-actions').before(remaining);
                const update = () => {
                    const qist = form.elements.payment_method.value === 'qist';
                    for (const key of ['interest_rate', 'advance', 'advance_method', 'monthly_installment', 'next_due_date']) {
                        const input = form.elements[key];
                        input.disabled = !qist;
                        input.closest('.erp-field').hidden = !qist;
                        input.required = qist && (['monthly_installment', 'next_due_date'].includes(key) ||
                            (key === 'advance_method' && Number(form.elements.advance.value) > 0));
                    }
                    remaining.hidden = !qist;
                    const bikePrice = cents(form.elements.selling_price.value);
                    const interest = Math.round(bikePrice * cents(form.elements.interest_rate.value) / 10000);
                    const total = bikePrice + interest;
                    const advance = cents(form.elements.advance.value);
                    const balance = total - advance;
                    const monthly = cents(form.elements.monthly_installment.value);
                    const plan = schedule(balance, monthly);
                    remaining.textContent = [
                        'Bike price ' + money(bikePrice / 100), 'Interest ' + money(interest / 100),
                        'Total payable ' + money(total / 100), 'Advance ' + money(advance / 100),
                        'Remaining ' + money(balance / 100),
                        ...(plan.count ? [plan.count + ' qists · Monthly ' + money(monthly / 100) + ' · Last qist ' + money(plan.last)] : [])
                    ].join(' · ');
                };
                form.addEventListener('input', update);
                form.addEventListener('change', update);
                update();
            },
            body: withRequestKey, saved: ({ data }, ctx) => receipt(data.id, ctx)
        }).run(row, context);
    }, { roles: staff, permission: sell });

    const receiptAction = action('Receipt', (row, context) => receipt(row.receipt_id || row.id, context));
    pages['sell-used-bike'] = {
        title: 'Sell Bike', roles: staff, permission: sell,
        path: endpoint + '/sellable', paged: true, liveFilters: true, filters: matchingFilters(bikeStatuses.slice(0, 2)),
        columns: [thumbnail, column('name', 'Bike'), column('model'), column('chassis_number', 'Chassis'), status(), currency('asking_price', 'Sell Price')],
        actions: [sellBike]
    };
    pages['sold-used-bikes'] = {
        title: 'Sold Bikes', roles: staff, permission: salesAccess, path: endpoint + '/sold-list', paged: true,
        liveFilters: true, filters: matchingFilters([['sold', 'Sold']]), exportPath: endpoint + '/export/sold', exportPermission: view,
        columns: [...saleColumns, column('sale_reference', 'Sale or order')],
        actions: [{ ...receiptAction, when: row => Boolean(row.receipt_id) }]
    };

    pages['used-bike-qist'] = {
        title: 'Qist / Udhar', roles: staff, permission: salesAccess, path: endpoint + '/qist', paged: true,
        liveFilters: true, filters: [search, select('status', 'Status', [['pending', 'Pending'], ['paid', 'Paid']])],
        columns: [column('invoice_number', 'Receipt'), column('customer_name', 'Customer'), column('motorcycle', 'Bike'),
            currency('bike_price', 'Bike price'), column('interest_amount', 'Interest', (value, row) => money(value) + ' (' + Number(row.interest_rate) + '%)'),
            currency('total_amount', 'Total payable'), currency('initial_payment', 'Advance'), currency('amount_due', 'Remaining'),
            currency('monthly_installment', 'Monthly Qist'), day('next_due_date', 'Next Date'), status()],
        actions: [receiptAction, edit('Record Qist payment', row => endpoint + '/qist/' + row.id + '/pay', [
            price('amount', 'Amount collected (PKR)', { required: true, min: 0.01 }),
            select('payment_method', 'Payment method', tender, { required: true, value: 'cash' }),
            field('next_due_date', 'Updated next due date (optional)', { type: 'date' })
        ], { method: 'POST', roles: staff, permission: sell, when: row => row.status === 'pending',
            values: row => ({ amount: Math.min(Number(row.amount_due), Number(row.monthly_installment)) }), body: withRequestKey })]
    };

    pages['used-bike-profit'] = {
        title: 'Profit Report', roles: finance, permission: view, path: endpoint + '/report', paged: true,
        liveFilters: true, filters: [...matchingFilters([['sold', 'Sold']]), ...dates], exportPath: endpoint + '/export/profit',
        columns: saleColumns, listTitle: 'Resale margins and operating expenses',
        summary: ({ data }) => metrics([column('bikes_sold', 'Bikes sold'), currency('revenue', 'Total Sales'),
            currency('gross_profit', 'Total Sale Profit'), currency('expenses', 'Total Expenses'), currency('net_profit', 'Net Profit')], data.summary) +
            '<h3>Operating expenses</h3>' + table(expenseColumns, data.expenses) + '<h3>Sold motorcycles</h3>'
    };
    pages['used-bike-expenses'] = {
        title: 'Expenses', roles: finance, permission: ['accounts.view', 'expenses.create'], listPermission: 'accounts.view',
        path: '/api/accounts/expenses', query: { business_area: 'used_bikes' }, paged: true, filters: dates, columns: expenseColumns,
        form: {
            permission: 'expenses.create', path: '/api/accounts/expenses', button: 'Record expense',
            fields: [select('category', 'Category', ['Kiraya', 'Chai', 'Petrol', 'Mechanic', 'Other'], { required: true }),
                price('amount', 'Amount (PKR)', { required: true, min: 0.01 }),
                field('expense_date', 'Date', { type: 'date' }), text('description', 'Description', { required: true, maxLength: 255 })],
            body: data => ({ ...data, business_area: 'used_bikes' })
        }
    };
    pages['used-bike-customers'] = {
        title: 'Customers', roles: staff, permission: 'customers.view', path: endpoint + '/customers', paged: true,
        liveFilters: true, filters: matchingFilters([['active', 'Active'], ['inactive', 'Inactive'], ['balance_due', 'Balance due']], true),
        exportPath: endpoint + '/export/customers',
        columns: [column('name'), column('phone'), column('cnic', 'CNIC'), column('motorcycles', 'Motorcycles'),
            currency('outstanding_balance', 'Outstanding'), currency('total_purchases', 'Total Purchases'), active],
        actions: [action('View purchases', async (row, context) => {
            const { data } = await request(endpoint + '/customers/' + row.id + '/purchases');
            context.dialog(row.name, metrics([currency('qist_balance', 'Qist remaining')], data) +
                table([column('name', 'Bike'), column('model'), day('resale_date', 'Date'),
                    column('sale_reference', 'Sale or order'), currency('sale_amount', 'Price'),
                    column('payment_method', 'Payment', value => methodNames[value] || ERP.label(value)),
                    currency('qist_due', 'Qist remaining')], data.purchases));
        })]
    };

})();
