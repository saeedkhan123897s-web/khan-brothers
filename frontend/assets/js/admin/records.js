'use strict';

(() => {
    const { pages, management, administrators, finance, field, select, text, integer, search, dates, column,
        currency, day, status, active, customer, action, edit, remove, metrics, details, table, links } = Admin;
    const { request, escape: e } = ERP;
    const required = { required: true, minLength: 2, maxLength: 100 };
    const email = options => field('email', 'Email', { type: 'email', maxLength: 100, ...options });
    const phone = options => field('phone', 'Phone', { type: 'tel', required: true, maxLength: 20, ...options });
    const name = field('name', 'Name', required);
    const notes = text('notes', 'Notes', { keepEmpty: true });
    const address = text('address', 'Address', { keepEmpty: true });
    const city = field('city', 'City', { maxLength: 50, keepEmpty: true });
    const types = ['retail', 'wholesale'];
    const activeChoices = [['1', 'Active'], ['0', 'Inactive']];
    const customerLinks = [['Customers', 'customers/customer-list.html'], ['Add customer', 'customers/add-customer.html'], ['Motorcycles', 'customers/motorcycle.html']];
    const supplierLinks = [['Suppliers', 'suppliers/suppliers-list.html'], ['Add supplier', 'suppliers/add-supplier.html']];
    const linkAction = (title, path) => action(title, row => location.assign(path(row)));
    const customerFields = [name, phone(), email({ emptyAsNull: true }), select('customer_type', 'Type', types, { value: 'retail' }),
        field('cnic', 'CNIC', { maxLength: 20, keepEmpty: true }), city, address, notes];
    const supplierFields = [name, phone({ minLength: 7 }), email({ emptyAsNull: true }),
        field('company_name', 'Company', { maxLength: 100, keepEmpty: true }), city,
        field('payment_terms', 'Payment terms', { maxLength: 50, keepEmpty: true }), address, notes];
    const customers = '/api/customers';
    const suppliers = '/api/suppliers';
    const record = path => row => path + '/' + row.id;

    function recordEditor({ singular, fields, path, back, navigation, roles }) {
        const id = new URLSearchParams(location.search).get('id');
        return {
            title: (id ? 'Edit ' : 'Add ') + singular, links: navigation, roles,
            form: {
                fields, path: id ? path + '/' + encodeURIComponent(id) : path, method: id ? 'PUT' : 'POST',
                values: async () => id ? (await request(path + '/' + encodeURIComponent(id))).data : {},
                saved: () => location.assign('/admin/pages/' + back)
            }
        };
    }

    pages['customer-list'] = {
        title: 'Customers', links: customerLinks, path: customers, paged: true,
        filters: [search, select('customer_type', 'Type', types), select('is_active', 'Show records', [...activeChoices, ['all', 'All customers']])],
        columns: [column('name'), column('phone'), column('email', 'Email'), column('city'), status('customer_type', 'Type'),
            currency('outstanding_balance', 'Outstanding'), active],
        actions: [
            action('Edit', row => location.assign('add-customer.html?id=' + row.id), { permission: 'customers.edit' }),
            linkAction('Motorcycles', row => 'motorcycle.html?customer_id=' + row.id),
            action('Transactions', async (row, context) => {
                const { data } = await request(customers + '/' + row.id + '/transactions');
                context.dialog(row.name + ' — transactions', [
                    ['Sales', data.sales, [column('invoice_number', 'Invoice'), day('sale_date', 'Date'), currency('total_amount', 'Total')]],
                    ['Workshop', data.job_cards || data.jobs, [column('job_number', 'Job'), day('received_date', 'Received'), currency('total_cost', 'Total')]],
                    ['Payments', data.payments, [column('payment_number', 'Payment'), day('payment_date', 'Date'), currency('amount', 'Amount')]]
                ].map(([title, rows, columns]) => `<h3>${title}</h3>` + table(columns, rows || [])).join(''));
            }),
            remove('Deactivate', record(customers), management, 'customers.remove')
        ]
    };
    pages['add-customer'] = recordEditor({ singular: 'customer', fields: customerFields, path: customers,
        back: 'customers/customer-list.html', navigation: customerLinks });

    const customerId = new URLSearchParams(location.search).get('customer_id');
    const bikePath = id => customers + '/' + encodeURIComponent(id) + '/motorcycles';
    const bikeFields = [field('make', 'Make', { required: true, maxLength: 50 }), field('model', 'Model', { required: true, maxLength: 50 }),
        integer('year', 'Year', { min: 1950, max: 2100, emptyAsNull: true }), field('color', 'Color', { maxLength: 30, keepEmpty: true }),
        field('registration_number', 'Registration', { maxLength: 20, keepEmpty: true }),
        field('engine_number', 'Engine number', { maxLength: 50, keepEmpty: true }),
        field('chassis_number', 'Chassis number', { maxLength: 50, keepEmpty: true }), notes];
    const selectedCustomer = customer({ required: true });
    pages.motorcycle = {
        title: 'Customer motorcycles', links: customerLinks, filters: [selectedCustomer],
        path: filters => filters.customer_id ? bikePath(filters.customer_id) : '',
        columns: [column('make'), column('model'), column('year'), column('registration_number', 'Registration'), column('color')],
        form: {
            permission: 'customers.edit', fields: [selectedCustomer, ...bikeFields], values: () => ({ customer_id: customerId }),
            path: (_row, body) => bikePath(body.customer_id), button: 'Add motorcycle',
            saved: (_payload, form) => location.assign('motorcycle.html?customer_id=' + encodeURIComponent(form.elements.customer_id.value))
        },
        actions: [edit('Edit', row => bikePath(row.customer_id) + '/' + row.id, bikeFields, { roles: Admin.staff, permission: 'customers.edit' }),
            remove('Remove', row => bikePath(row.customer_id) + '/' + row.id, Admin.staff, 'customers.edit')]
    };

    pages['suppliers-list'] = {
        title: 'Suppliers', links: supplierLinks, roles: management, path: suppliers, paged: true,
        filters: [search, field('city', 'City', { maxLength: 50 }), select('is_active', 'Show records', [...activeChoices, ['all', 'All suppliers']])],
        columns: [column('name'), column('company_name', 'Company'), column('phone'), column('city'),
            column('payment_terms', 'Terms'), currency('outstanding_balance', 'Outstanding'), active],
        actions: [action('Edit', row => location.assign('add-supplier.html?id=' + row.id), { permission: 'suppliers.edit' }),
            action('Recent purchases', async (row, context) => {
                const { data } = await request(suppliers + '/' + row.id + '/purchases?limit=20');
                context.dialog(row.name + ' — recent purchases', table([column('purchase_number', 'Purchase'),
                    day('purchase_date', 'Date'), currency('total_amount', 'Total'), currency('amount_due', 'Due'), status()], data));
            }), remove('Deactivate', record(suppliers), management, 'suppliers.edit')]
    };
    pages['add-supplier'] = recordEditor({ singular: 'supplier', fields: supplierFields, path: suppliers, roles: management,
        back: 'suppliers/suppliers-list.html', navigation: supplierLinks });

    const userLinks = [['User list', 'users/user-list.html'], ['Permissions', 'users/permissions.html']];
    const roles = ['owner', 'admin', 'manager', 'salesman', 'mechanic', 'accountant', 'customer'];
    const userRole = select('role', 'Role', roles);
    const assignable = (row, user) => row.id !== user.id && row.role !== 'owner' &&
        row.role !== 'customer' && (user.role === 'owner' || row.role !== 'admin');
    const configureAccess = action('Route permissions', async (row, context) => {
        const endpoint = '/api/auth/users/' + row.id + '/permissions';
        const { data } = await request(endpoint);
        const { escape: escapeHTML } = ERP;
        const valueFor = permission => permission.override === null ? 'inherit' : permission.override ? 'allow' : 'deny';
        const host = context.dialog('Route permissions for ' + data.user.name, '<p>Choose Role default, Allow, or Deny for each route group.</p>' +
            '<form id="routePermissionForm"><div class="erp-table-scroll"><table><thead><tr><th scope="col">Area and action</th><th scope="col">Role default</th><th scope="col">Effective</th><th scope="col">Override</th></tr></thead><tbody>' +
            data.permissions.map(permission => {
                const value = valueFor(permission);
                return `<tr><th scope="row">${escapeHTML(permission.group)} · ${escapeHTML(permission.label)}</th>
                    <td>${permission.default_allowed ? 'Allow' : 'Deny'}</td><td>${permission.allowed ? 'Allowed' : 'Denied'}</td>
                    <td><select name="${escapeHTML(permission.key)}" aria-label="${escapeHTML(permission.label)}" ${permission.editable ? '' : 'disabled'}>
                        <option value="inherit"${value === 'inherit' ? ' selected' : ''}>Role default</option>
                        <option value="allow"${value === 'allow' ? ' selected' : ''}>Allow</option>
                        <option value="deny"${value === 'deny' ? ' selected' : ''}>Deny</option>
                    </select></td></tr>`;
            }).join('') + '</tbody></table></div><div class="erp-form-actions"><button type="submit">Save permissions</button><p role="status"></p></div></form>');
        const form = host.querySelector('form');
        const button = form.querySelector('button');
        const output = form.querySelector('[role="status"]');
        form.addEventListener('submit', async event => {
            event.preventDefault();
            const permissions = data.permissions.flatMap(permission => {
                const value = form.elements.namedItem(permission.key).value;
                return permission.editable && value !== valueFor(permission)
                    ? [{ key: permission.key, override: value === 'inherit' ? null : value === 'allow' }]
                    : [];
            });
            if (!permissions.length) {
                Admin.feedback(output, 'Choose a different override to save a change.');
                return;
            }
            button.disabled = true;
            try {
                await request(endpoint, { method: 'PUT', body: { permissions } });
                context.close();
                context.notify('Route permissions saved.');
            } catch (error) {
                Admin.feedback(output, error.message, true);
            } finally {
                button.disabled = false;
            }
        });
    }, { roles: administrators, when: assignable });
    pages['user-list'] = {
        title: 'Users', links: userLinks, roles: management, path: '/api/auth/users', paged: true,
        filters: [search, userRole, select('is_active', 'Status', activeChoices)],
        columns: [column('id', 'ID'), column('name'), column('email', 'Email'), column('phone'), status('role', 'Role'), active, day('last_login', 'Last login')],
        form: { roles: administrators, button: 'Create staff account', path: '/api/auth/register', fields: [
            name, email({ required: true }), phone({ required: false }),
            field('password', 'Initial password', { type: 'password', required: true, minLength: 8, maxLength: 72 }),
            select('role', 'Staff role', ['manager', 'salesman', 'mechanic', 'accountant'], { required: true })
        ] },
        actions: [edit('Edit user', record('/api/auth/users'), [name, email({ required: true }), phone({ required: false, keepEmpty: true }),
            userRole, select('is_active', 'Active', activeChoices), address],
        { roles: administrators, when: (row, user) => user.role === 'owner' || !['owner', 'admin'].includes(row.role) }), configureAccess]
    };
    const access = [
        ['Owner / admin', 'All management modules and user administration. Owner accounts have additional account protections.'],
        ['Manager', 'Purchases, stock changes, suppliers, workshop management, settings, reports and read-only user list.'],
        ['Salesman', 'Point of sale, invoices, customer records and stock availability.'],
        ['Mechanic', 'Assigned job cards, diagnosis and permitted repair status changes.'],
        ['Accountant', 'Reports, profit, audit history, ledgers, payments and expenses.'],
        ['Customer', 'Public storefront, checkout and account profile.']
    ].map(([role, scope]) => ({ role, scope }));
    pages.permissions = {
        title: 'Role permissions', links: userLinks, roles: management,
        intro: table([column('role'), column('scope', 'Typical access')], access) +
            '<p>Routes use the assigned role as the default. Open Users and select Route permissions on a staff account to allow or deny individual route groups.</p>'
    };

    const settingsLinks = [['Business', 'settings/business-setting.html'], ['Payments', 'settings/payment-setting.html'], ['System', 'settings/system-setting.html']];
    const bikeMethods = [['cash', 'Cash'], ['bank_transfer', 'Bank Transfer'], ['jazzcash', 'JazzCash'],
        ['easypaisa', 'EasyPaisa'], ['card', 'Card'], ['qist', 'Qist / Udhar']];
    function settings(title, groups) {
        const fields = groups.map(([spec]) => ({ ...spec, keepEmpty: true }));
        return { title, links: settingsLinks, roles: management, form: { permission: 'settings.edit', readOnly: true,
            path: '/api/settings', method: 'PUT', button: 'Save settings', fields,
            values: async () => {
                const values = Object.fromEntries((await request('/api/settings')).data.map(row => [row.setting_key, row.setting_value]));
                for (const spec of fields.filter(item => item.multiple)) {
                    if (values[spec.name] === undefined) values[spec.name] = spec.value;
                    else {
                        try { values[spec.name] = JSON.parse(values[spec.name]); }
                        catch { values[spec.name] = []; }
                    }
                }
                return values;
            },
            body: data => ({ settings: groups.map(([spec, group]) => ({
                key: spec.name, value: spec.multiple ? JSON.stringify(data[spec.name]) : String(data[spec.name] ?? ''), group
            })) })
        } };
    }
    pages['business-setting'] = settings('Business settings', [
        [field('business_name', 'Business name', required), 'business'],
        [field('business_tagline', 'Tagline', { maxLength: 150 }), 'business'],
        [text('business_address', 'Business address', { maxLength: 500 }), 'business'],
        [field('business_phone', 'Business phone', { type: 'tel', maxLength: 30 }), 'business'],
        [field('business_email', 'Business email', { type: 'email', maxLength: 100 }), 'business']
    ]);
    pages['payment-setting'] = settings('Payment settings', [
        [select('used_bike_payment_methods', 'Motorcycle sale payment methods', bikeMethods,
            { multiple: true, required: true, value: bikeMethods.map(([key]) => key) }), 'payment'],
        [select('default_payment_method', 'Preferred payment method', ['cash', 'bank_transfer', 'card', 'digital_wallet'], { required: true, value: 'cash' }), 'payment'],
        [select('tax_enabled', 'Apply sales tax', [['true', 'Yes'], ['false', 'No']], { required: true, value: 'false' }), 'general'],
        [Admin.amount('tax_rate', 'Tax rate (%)', { required: true, max: 100, value: 0 }), 'general']
    ]);
    pages['system-setting'] = settings('System settings', [
        [field('invoice_prefix', 'Invoice prefix', { required: true, maxLength: 8, value: 'INV', pattern: '[A-Za-z0-9]{1,8}' }), 'general'],
        [field('job_card_prefix', 'Job card prefix', { required: true, maxLength: 8, value: 'JOB', pattern: '[A-Za-z0-9]{1,8}' }), 'general']
    ]);
    pages['system-setting'].intro = '<p>Document numbering applies to newly created invoices and job cards. Currency for this installation is PKR.</p>';

    const accountLinks = [['Ledger', 'accounts/general-ledger.html'], ['Cashbook', 'accounts/cashbook.html'], ['Bank', 'accounts/bank.html'],
        ['Payments', 'accounts/payment.html'], ['Expenses', 'accounts/expenses.html'], ['Trial balance', 'accounts/trial-balance.html'],
        ['Purchases', 'accounts/purchases.html'], ['Workshop', 'accounts/workshop.html'], ['Reports', 'accounts/reports.html']];
    const report = { links: Admin.reportLinks, roles: finance, filters: dates };
    const purchaseReport = {
        ...report, title: 'Purchase accounts', path: '/api/reports/purchases',
        columns: [day('date', 'Date'), column('transactions'), currency('subtotal', 'Subtotal'), currency('discounts', 'Discounts'),
            currency('shipping', 'Shipping'), currency('total', 'Total'), currency('paid', 'Paid'), currency('due', 'Due')]
    };
    const workshopReport = {
        ...report, title: 'Workshop report', path: '/api/reports/workshop',
        columns: [status(), column('jobs'), currency('billed', 'Billed'), currency('paid', 'Paid'), currency('due', 'Due')]
    };
    const reportDate = day('date', 'Date');
    const transactionColumns = (reference, party) => [reportDate, column('reference', reference), column('party', party),
        currency('total_amount', 'Total'), currency('amount_paid', 'Paid'), currency('amount_due', 'Remaining')];
    const ledgerColumns = [reportDate, column('account_code', 'Code'), column('account_name', 'Account'),
        column('description'), currency('debit'), currency('credit')];
    const financialDetails = {
        sales: [currency('sales.revenue', 'Sales revenue'), transactionColumns('Invoice', 'Customer')],
        receivables: [currency('sales.receivables', 'Receivables'), transactionColumns('Invoice', 'Customer')],
        purchases: [currency('purchases.total', 'Purchases'), transactionColumns('Purchase', 'Supplier')],
        payables: [currency('purchases.payables', 'Payables'), transactionColumns('Purchase', 'Supplier')],
        expenses: [currency('expenses', 'Expenses'), [reportDate, column('reference', 'Expense'), column('category'), column('description'), currency('amount')]],
        debits: [currency('ledger.debit', 'Ledger debits'), ledgerColumns],
        credits: [currency('ledger.credit', 'Ledger credits'), ledgerColumns]
    };
    const financialReport = {
        ...report, title: 'Financial report', path: '/api/reports/financial',
        summary: ({ data }) => metrics(Object.entries(financialDetails).map(([detail, [metric]]) => ({ ...metric, detail })), data),
        async summaryDetail(section, { data }, context) {
            const [metric, columns] = financialDetails[section];
            const { start_date, end_date } = data.period;
            const target = context.dialog(metric.title,
                `<p>${e(start_date)} – ${e(end_date)}</p><div class="financial-details" aria-live="polite"></div>`);
            const records = target.querySelector('.financial-details');
            async function load(page) {
                records.textContent = 'Loading…';
                try {
                    const { data: rows, pagination } = await request(ERP.url('/api/reports/financial/' + section, {
                        ...data.period, page
                    }));
                    records.innerHTML = table(columns, rows) + (pagination.totalPages > 1
                        ? `<nav class="erp-pagination" aria-label="Detail pages">
                            <button type="button" data-detail-page="${page - 1}" ${page <= 1 ? 'disabled' : ''}>Previous</button>
                            <span>Page ${page} of ${pagination.totalPages}</span>
                            <button type="button" data-detail-page="${page + 1}" ${page >= pagination.totalPages ? 'disabled' : ''}>Next</button>
                        </nav>` : '');
                } catch (error) {
                    records.textContent = error.message;
                }
            }
            records.addEventListener('click', event => {
                const button = event.target.closest('button[data-detail-page]');
                if (button) load(Number(button.dataset.detailPage));
            });
            await load(1);
        }
    };
    pages['accounts-purchases'] = { ...purchaseReport, links: accountLinks };
    pages['accounts-workshop'] = { ...workshopReport, title: 'Workshop accounts', links: accountLinks };
    pages['accounts-reports'] = { ...financialReport, title: 'Accounting reports', links: accountLinks,
        intro: links([['Trial balance', 'accounts/trial-balance.html'], ['Profit and loss', 'profit/profit-loss.html']]) };
    pages['trial-balance'] = {
        title: 'Trial balance', links: accountLinks, roles: finance, path: '/api/accounts/trial-balance',
        filters: [field('as_of', 'As of', { type: 'date' })],
        columns: [column('account_code', 'Code'), column('name', 'Account'), status('account_type', 'Type'),
            currency('debit', 'Debit'), currency('credit', 'Credit')],
        summary: ({ totals, balanced }) => metrics([currency('debit', 'Debits'), currency('credit', 'Credits'),
            column('balance_status', 'Trial balance')], { ...totals, balance_status: balanced ? 'Balanced' : 'Out of balance' })
    };
    const accounting = { links: accountLinks, roles: finance };
    const accounts = options => Admin.lookup('account_id', 'Account', '/api/accounts/accounts', ['account_code', 'name'], options);
    const bankOptions = options => Admin.lookup('bank_account_id', 'Bank account', '/api/accounts/bank', ['bank_name', 'account_title'], options);
    const paymentMethods = ['cash', 'bank_transfer', 'card', 'digital_wallet', 'cheque'];
    const references = ['sale', 'purchase', 'job_card', 'order', 'expense', 'other', 'used_bike'];
    const paymentColumns = [column('payment_number', 'Payment'), day('payment_date', 'Date'), status('payment_type', 'Direction'),
        status('reference_type', 'Reference'), column('reference_id', 'Record ID'), currency('amount', 'Amount'),
        status('payment_method', 'Method'), column('notes')];
    const journals = new WeakMap();
    pages['general-ledger'] = {
        ...accounting, title: 'General ledger', path: '/api/accounts/ledger', listPermission: 'accounts.view', paged: true, filters: [accounts(), ...dates],
        columns: [day('entry_date', 'Date'), column('account_code', 'Code'), column('account_name', 'Account'), column('description'),
            currency('debit', 'Debit'), currency('credit', 'Credit'), currency('balance', 'Balance')],
        form: {
            roles: management, permission: 'accounts.manage', path: '/api/accounts/journal', button: 'Post journal',
            fields: [field('date', 'Journal date', { type: 'date' }), text('description', 'Description', { required: true, maxLength: 255 })],
            async setup(form) {
                const inputs = Admin.repeat(form, 'Journal entries', [accounts({ required: true }),
                    Admin.amount('debit', 'Debit'), Admin.amount('credit', 'Credit')], { minimum: 2 });
                journals.set(form, inputs);
                await inputs.ready;
            },
            body(data, _record, form) {
                const entries = journals.get(form).read().map(line => ({
                    account_id: Number(line.account_id), debit: line.debit || 0, credit: line.credit || 0
                }));
                return { ...data, entries };
            }
        }
    };
    pages.cashbook = {
        ...accounting, title: 'Cashbook', path: '/api/accounts/cashbook', filters: dates,
        columns: paymentColumns.filter(col => col.key !== 'reference_id'),
        summary: ({ summary }) => metrics([currency('received', 'Receipts'), currency('paid', 'Disbursements'),
            currency('balance', 'Net movement')], summary)
    };
    const bank = '/api/accounts/bank';
    const banks = [field('bank_name', 'Bank name', required), field('account_title', 'Account title', required),
        field('account_number', 'Account number', { maxLength: 30, emptyAsNull: true }),
        field('branch', 'Branch', { maxLength: 100, emptyAsNull: true })];
    pages.bank = {
        ...accounting, title: 'Bank accounts', path: bank, listPermission: 'accounts.view',
        columns: [column('bank_name', 'Bank'), column('account_title', 'Account'), column('branch'),
            column('account_number', 'Account number', value => '•••• ' + value.slice(-4)), currency('balance', 'Recorded balance')],
        form: { roles: management, permission: 'accounts.manage', path: bank, fields: [...banks, Admin.amount('opening_balance', 'Opening balance')], button: 'Add bank account' },
        actions: [
            edit('Edit account', record(bank), banks, { permission: 'accounts.manage' }),
            action('Payments', async (row, context) => {
                const { data } = await request(bank + '/' + row.id + '/transactions');
                context.dialog(row.account_title + ' — payments', table(paymentColumns, data));
            })
        ]
    };
    const payments = '/api/payments';
    pages.payment = {
        ...accounting, title: 'Payments and receipts', path: payments, listPermission: 'payments.view', paged: true, columns: paymentColumns,
        filters: [select('payment_type', 'Direction', ['received', 'made']), select('reference_type', 'Reference', references), ...dates],
        form: {
            path: payments, permission: 'payments.create', button: 'Record payment',
            fields: [select('payment_type', 'Direction', ['received', 'made'], { required: true }),
                select('reference_type', 'Reference type', references.filter(value => !['expense', 'used_bike'].includes(value)), { required: true }),
                integer('reference_id', 'Reference record ID', { min: 1 }),
                Admin.amount('amount', 'Amount', { required: true, min: .01 }), select('payment_method', 'Method', paymentMethods, { value: 'cash' }),
                field('payment_date', 'Date', { type: 'date' }), field('bank_name', 'Bank name', { maxLength: 50 }),
                field('reference_number', 'Bank reference', { maxLength: 50 }), notes]
        }
    };
    const expenses = '/api/accounts/expenses';
    pages.expenses = {
        ...accounting, title: 'Expenses', path: expenses, listPermission: 'accounts.view', paged: true,
        columns: [column('expense_number', 'Expense'), day('expense_date', 'Date'), column('category'), column('description'),
            currency('amount', 'Amount'), status('payment_method', 'Method'),
            column('approved_by_name', 'Approved by')],
        form: {
            path: expenses, permission: 'expenses.create', button: 'Record expense',
            fields: [field('category', 'Expense category', { required: true, maxLength: 50 }), text('description', 'Description', { required: true, maxLength: 255 }),
                Admin.amount('amount', 'Amount', { min: .01, required: true }), field('expense_date', 'Date', { type: 'date' }),
                select('payment_method', 'Payment method', ['cash', 'bank_transfer', 'card'], { value: 'cash' }),
                bankOptions(), notes]
        },
        actions: [action('Approve', async (row, context) => {
            await request(expenses + '/' + row.id + '/approve', { method: 'POST' });
            context.notify('Expense approved.');
            await context.load();
        }, { roles: management, permission: 'accounts.manage', when: row => !row.approved_by })]
    };

    pages['financial-report'] = financialReport;
    pages['workshop-report'] = workshopReport;
    pages['sales-report'] = {
        ...report, title: 'Sales report', path: '/api/reports/sales',
        columns: [day('date', 'Date'), column('transactions'), currency('subtotal', 'Subtotal'), currency('discounts', 'Discounts'),
            currency('tax', 'Tax'), currency('total', 'Total'), currency('paid', 'Paid'), currency('due', 'Due')]
    };
    pages['inventory-report'] = {
        ...report, title: 'Inventory report', filters: [], path: '/api/reports/inventory', listTitle: 'Low stock (up to 100 products)',
        rows: ({ data }) => data.low_stock,
        columns: [column('sku', 'SKU'), column('name', 'Product'), column('stock_quantity', 'On hand'),
            column('min_stock_level', 'Minimum'), currency('cost_price', 'Cost'), currency('selling_price', 'Price')],
        summary: ({ data }) => metrics([column('product_count', 'Active products'), column('units', 'Units on hand'),
            column('low_stock', 'Low stock'), currency('cost_value', 'Cost value'), currency('retail_value', 'Retail value')], data.summary)
    };
})();
