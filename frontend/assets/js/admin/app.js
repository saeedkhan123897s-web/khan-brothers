'use strict';

window.Admin = (() => {
    const { escape: e, label, money, date, url, request } = ERP;
    const pages = {};
    const management = ['owner', 'admin', 'manager'];
    const finance = [...management, 'accountant'];
    const administrators = ['owner', 'admin'];
    const staff = [...finance, 'salesman', 'mechanic'];
    const base = '/admin/pages/';
    const bikeSections = [
        { title: 'Stock', icon: '▦', pages: [['Stock', 'purchases/used-bikes.html'], ['Purchase Bike', 'purchases/buy-used-bike.html']] },
        { title: 'Sales', icon: '⇄', pages: [['Sell Bike', 'purchases/sell-used-bike.html'], ['Sold Bikes', 'purchases/sold-used-bikes.html'], ['Qist / Udhar', 'purchases/used-bike-qist.html']] },
        { title: 'Hisaab', icon: '▥', pages: [['Profit Report', 'purchases/used-bike-profit.html'], ['Expenses', 'purchases/used-bike-expenses.html']] },
        { title: 'Customers', icon: '◎', pages: [['Customers', 'purchases/used-bike-customers.html']] }
    ];
    const currentBikeSection = path => bikeSections.find(section => section.pages.some(([, page]) => base + page === path));
    const sections = [
        ['Main menu', [
            ['Dashboard', '/admin/dashboard.html', finance, '🏠'],
            ['Inventory', 'inventory/products.html', staff, '📦'],
            ['Sales & POS', 'sales/pos.html', [...finance, 'salesman'], '🛒'],
            ['Online orders', 'sales/online-orders.html', management, '📬'],
            ['Purchases', 'purchases/purchase-list.html', management, '🛍️'],
            ['Workshop', 'workshop/job-cards.html', staff, '🔧']
        ]],
        ['Business management', [
            ['Customers', 'customers/customer-list.html', staff, '👥'],
            ['Suppliers', 'suppliers/suppliers-list.html', management, '🚚'],
            ['Accounts & Ledgers', 'accounts/general-ledger.html', finance, '📒'],
            ['Profit management', 'profit/profit-loss.html', finance, '💰']
        ]],
        ['Control & reports', [
            ['Audit', 'audit/audit-trail.html', finance, '🛡️'],
            ['Reports', 'reports/financial-report.html', finance, '📊'],
            ['Settings', 'settings/business-setting.html', management, '⚙️'],
            ['Users', 'users/user-list.html', management, '👤']
        ]]
    ];
    const reportLinks = [
        ['Financial', 'reports/financial-report.html'], ['Sales', 'reports/sales-report.html'],
        ['Purchases', 'reports/purchase-report.html'], ['Inventory', 'reports/inventory-report.html'],
        ['Workshop', 'reports/workshop-report.html']
    ];
    const auditLinks = [
        ['Audit trail', 'audit/audit-trail.html'], ['Employee activity', 'audit/employee-activity.html'],
        ['Inventory reconciliation', 'audit/inventory-audit.html'], ['Financial audit', 'audit/financial-audit.html']
    ];
    const purchaseLinks = [
        ['Purchase orders', 'purchases/purchase-list.html'], ['New purchase', 'purchases/new-purchase.html'],
        ['Buy motorcycles', 'purchases/new-purchase.html?product_type=motorcycle'],
        ['Purchase returns', 'purchases/purchase-returns.html'], ['Purchase report', 'reports/purchase-report.html'],
        ['Used motorcycles', 'purchases/used-bikes.html', finance],
        ['Buy used motorcycle', 'purchases/buy-used-bike.html', management]
    ];
    const pagePermissions = Object.fromEntries(Object.entries({
        'dashboard.view': ['reports/workshop-overview'],
        'inventory.view': ['inventory/products', 'inventory/stock', 'inventory/stock-audit', 'audit/inventory-audit'],
        'inventory.adjust': ['inventory/stock-adjustment'],
        'catalogue.edit': ['inventory/add-product'],
        'customers.view': ['customers/customer-list'],
        'customers.edit': ['customers/add-customer'],
        'suppliers.view': ['suppliers/suppliers-list'],
        'suppliers.edit': ['suppliers/add-supplier'],
        'purchases.view': ['purchases/purchase-list', 'purchases/purchase-returns'],
        'purchases.create': ['purchases/new-purchase'],
        'used_bikes.view': ['purchases/used-bikes', 'purchases/used-bike-profit'],
        'used_bikes.manage': ['purchases/buy-used-bike'],
        'sales.view': ['sales/sales-list', 'sales/invoices', 'sales/sales-returns'],
        'orders.view': ['sales/online-orders'],
        'workshop.view': ['workshop/job-cards', 'workshop/repair-history', 'workshop/mechanics', 'workshop/services'],
        'workshop.manage': ['workshop/new-jobs'],
        'accounts.view': ['accounts/general-ledger', 'accounts/cashbook', 'accounts/bank', 'accounts/expenses', 'accounts/trial-balance'],
        'payments.view': ['accounts/payment'],
        'reports.view': ['reports/financial-report', 'reports/sales-report', 'reports/purchase-report', 'reports/inventory-report', 'reports/workshop-report',
            'accounts/purchases', 'accounts/workshop', 'accounts/reports'],
        'profit.view': ['profit/profit-loss', 'profit/net-profit', 'profit/spare-part-profit', 'profit/workshop-profit'],
        'audit.view': ['audit/audit-trail', 'audit/employee-activity', 'audit/financial-audit'],
        'settings.view': ['settings/business-setting', 'settings/payment-setting', 'settings/system-setting']
    }).flatMap(([permission, paths]) => paths.map(path => [path + '.html', permission])));
    Object.assign(pagePermissions, {
        'sales/pos.html': ['sales.create', 'sales.view'],
        'sales/sales-returns.html': ['sales.view', 'sales.return'],
        'purchases/purchase-returns.html': ['purchases.view', 'purchases.manage'],
        'customers/motorcycle.html': ['customers.view', 'customers.edit'],
        'accounts/payment.html': ['payments.view', 'payments.create'],
        'accounts/expenses.html': ['accounts.view', 'expenses.create'],
        'accounts/general-ledger.html': ['accounts.view', 'accounts.manage'],
        'accounts/bank.html': ['accounts.view', 'accounts.manage'],
        'workshop/mechanics.html': ['workshop.view', 'workshop.manage'],
        'workshop/services.html': ['workshop.view', 'workshop.manage'],
        'inventory/categories.html': null,
        'inventory/brands.html': null,
        'purchases/sell-used-bike.html': 'used_bikes.sell',
        'purchases/used-bike-qist.html': ['used_bikes.sell', 'used_bikes.view'],
        'purchases/used-bike-expenses.html': ['accounts.view', 'expenses.create'],
        'purchases/used-bike-customers.html': 'customers.view',
        'purchases/sold-used-bikes.html': ['used_bikes.sell', 'used_bikes.view'],
        '/admin/dashboard.html': 'dashboard.view'
    });

    const field = (name, labelText, options = {}) => ({ name, label: labelText, ...options });
    const select = (name, title, choices, options) => field(name, title, { choices, ...options });
    const lookup = (name, title, path, keys, options) => field(name, title, { lookup: { path, keys }, ...options });
    const amount = (name, title, options) => field(name, title, { type: 'number', min: 0, step: '0.01', ...options });
    const integer = (name, title, options) => field(name, title, { type: 'number', min: 0, step: 1, ...options });
    const text = (name, title, options) => field(name, title, { type: 'textarea', ...options });
    const search = field('search', 'Search', { type: 'search', maxLength: 100 });
    const dates = [field('start_date', 'From', { type: 'date' }), field('end_date', 'To', { type: 'date' })];
    const column = (key, title = label(key), format) => ({ key, title, format });
    const currency = (key, title) => column(key, title, money);
    const day = (key, title) => column(key, title, date);
    const status = (key = 'status', title = 'Status') => column(key, title, label);
    const active = column('is_active', 'Active', value => Number(value) ? 'Yes' : 'No');
    const can = (user, permission, roles) => {
        if (permission && Array.isArray(user?.permissions)) {
            return [].concat(permission).some(key => user.permissions.includes(key));
        }
        return !roles || roles.includes(user?.role);
    };
    const pagePermission = path => pagePermissions[path.replace(base, '').split('?')[0]];
    const canOpenPage = (user, path, roles) => can(user, pagePermission(path),
        roles || (path.replace(base, '').startsWith('users/') ? management : undefined));
    const byKey = (row, key) => typeof key === 'function' ? key(row) : key.split('.').reduce((value, part) => value?.[part], row);
    const listData = payload => Array.isArray(payload.data) ? payload.data : payload.data?.items || payload.data?.data || [];
    const getSession = () => request('/api/auth/me').then(payload => payload.data?.user || payload.data);
    const customer = (options = {}) => lookup('customer_id', 'Customer', '/api/customers', ['name', 'phone'], { search: true, ...options });
    const product = ({ productType, ...options } = {}) => lookup('product_id', 'Product',
        productType ? '/api/products?product_type=' + encodeURIComponent(productType) : '/api/products',
        ['sku', 'name'], { search: true, ...options });

    function control(spec, value = spec.value ?? '') {
        const { name, label: title, type = 'text', required, min, max, step, minLength, maxLength, pattern, choices, multiple, accept, lookup: source } = spec;
        if (type === 'date' && /^\d{4}-\d{2}-\d{2}T/.test(value)) value = value.slice(0, 10);
        const attrs = [
            `name="${e(name)}"`, required ? 'required' : '', multiple ? 'multiple' : '', accept ? `accept="${e(accept)}"` : '',
            min != null ? `min="${e(min)}"` : '', max != null ? `max="${e(max)}"` : '',
            pattern ? `pattern="${e(pattern)}"` : '', step != null ? `step="${e(step)}"` : '', minLength != null ? `minlength="${e(minLength)}"` : '',
            maxLength != null ? `maxlength="${e(maxLength)}"` : ''
        ].join(' ');
        const options = choices?.map(choice => {
            const [id, name] = Array.isArray(choice) ? choice : [choice, label(choice)];
            const selected = multiple ? Array.isArray(value) && value.includes(id) : String(id) === String(value);
            return `<option value="${e(id)}"${selected ? ' selected' : ''}>${e(name)}</option>`;
        }).join('') || '';
        const blank = `<option value="">${e(spec.placeholder || (required ? 'Select…' : '—'))}</option>`;
        let input = `<input type="${e(type)}" ${attrs} value="${e(value)}">`;
        if (type === 'textarea') input = `<textarea ${attrs} rows="3">${e(value)}</textarea>`;
        if (choices || source) input = `<select ${attrs}>${multiple ? '' : blank}${options}</select>`;
        const lookupSearch = source && spec.search
            ? `<div class="erp-lookup"><input type="search" aria-label="Search ${e(title.toLowerCase())}" maxlength="100"><button type="button" class="erp-quiet">Find</button><small role="status"></small></div>`
            : '';
        return `<div class="erp-field${type === 'textarea' ? ' erp-wide' : ''}"><label><span>${e(title)}</span>${input}</label>${lookupSearch}</div>`;
    }

    function formMarkup(fields, values = {}, button = 'Save') {
        return `<form class="erp-form">${fields.map(spec => control(spec, values[spec.name] ?? (values[spec.name] === null ? '' : undefined))).join('')}
            <div class="erp-form-actions erp-wide"><button type="submit">${e(button)}</button><p role="status"></p></div></form>`;
    }

    function read(form, fields) {
        const values = new FormData(form);
        return Object.fromEntries(fields.flatMap(spec => {
            if (spec.type === 'file' || form.elements.namedItem(spec.name)?.disabled) return [];
            if (spec.multiple) return [[spec.name, values.getAll(spec.name)]];
            const value = String(values.get(spec.name) ?? '').trim();
            if (value === '' && !spec.keepEmpty) return spec.emptyAsNull ? [[spec.name, null]] : [];
            return [[spec.name, spec.type === 'number' || spec.numeric ? Number(value) : value]];
        }));
    }

    async function fillLookups(form, fields, values = {}) {
        await Promise.all(fields.filter(spec => spec.lookup).map(async spec => {
            const select = form.elements[spec.name];
            const { path, keys } = spec.lookup;
            const searchBox = select.closest('.erp-field').querySelector('.erp-lookup');
            const load = async (term, current) => {
                select.disabled = true;
                const output = searchBox?.querySelector('small');
                if (output) output.textContent = '';
                try {
                    const payload = await request(url(path, term ? { search: term, limit: 100 } : { limit: 100 }));
                    const items = listData(payload);
                    const first = select.options[0].cloneNode(true);
                    select.replaceChildren(first);
                    for (const item of items) {
                        select.add(new Option(keys.map(key => byKey(item, key)).filter(Boolean).join(' · '), item.id));
                    }
                    if (current && !items.some(item => String(item.id) === String(current))) {
                        select.add(new Option(`Current record #${current}`, current));
                    }
                    select.value = current ?? '';
                    if (output && !items.length) output.textContent = 'No matching records.';
                } catch (error) {
                    if (output && term) output.textContent = error.message;
                    else throw error;
                } finally {
                    select.disabled = false;
                }
            };
            if (searchBox) {
                const input = searchBox.querySelector('input');
                const button = searchBox.querySelector('button');
                const find = async () => {
                    button.disabled = true;
                    try {
                        await load(input.value.trim(), '');
                        select.dispatchEvent(new Event('change'));
                    } catch (error) {
                        searchBox.querySelector('small').textContent = error.message;
                    } finally {
                        button.disabled = false;
                    }
                };
                button.addEventListener('click', find);
                input.addEventListener('keydown', event => {
                    if (event.key === 'Enter') { event.preventDefault(); button.click(); }
                });
            }
            await load('', values[spec.name]);
        }));
    }

    async function mountForm(target, spec, values, onSaved, context) {
        const { fields } = spec;
        target.innerHTML = formMarkup(fields, values, spec.button);
        const form = target.querySelector('form');
        const button = form.querySelector('[type="submit"]');
        const output = form.querySelector('[role="status"]');
        button.disabled = true;
        try {
            await fillLookups(form, fields, values);
            await spec.setup?.(form, values, context);
            button.disabled = false;
        } catch (error) {
            feedback(output, error.message, true);
        }
        form.addEventListener('submit', async event => {
            event.preventDefault();
            if (button.disabled) return;
            button.disabled = true;
            feedback(output, 'Saving…');
            try {
                const data = read(form, fields);
                const body = spec.body ? await spec.body(data, values, form) : data;
                const path = typeof spec.path === 'function' ? spec.path(values, body) : spec.path;
                const payload = await request(path, { method: spec.method || 'POST', body });
                feedback(output, spec.success?.(payload) || payload.message || 'Saved successfully.');
                await onSaved?.(payload, form);
            } catch (error) {
                feedback(output, error.message, true);
            } finally {
                button.disabled = false;
            }
        });
        return form;
    }

    function repeat(form, title, fields, { minimum = 0, maximum = 50 } = {}) {
        const group = document.createElement('fieldset');
        group.className = 'erp-lines erp-wide';
        group.innerHTML = `<legend>${e(title)}</legend><div></div><button class="erp-quiet" type="button">Add line</button>`;
        form.querySelector('.erp-form-actions').before(group);
        const rows = group.querySelector('div');
        const button = group.querySelector('button');
        let serial = 0;
        const sync = () => {
            button.disabled = rows.children.length >= maximum;
            for (const child of rows.children) child.querySelector('[data-remove-line]').disabled = rows.children.length <= minimum;
        };
        async function add() {
            const row = document.createElement('div');
            row.className = 'erp-form erp-line';
            const suffixed = fields.map(spec => ({ ...spec, name: spec.name + '_' + serial }));
            serial += 1;
            row.specs = suffixed;
            row.innerHTML = suffixed.map(spec => control(spec)).join('') + '<button type="button" class="erp-quiet" data-remove-line>Remove line</button>';
            rows.append(row);
            row.querySelector('[data-remove-line]').addEventListener('click', () => { row.remove(); sync(); });
            sync();
            if (suffixed.some(spec => spec.lookup)) {
                button.disabled = true;
                try { await fillLookups(form, suffixed); }
                catch (error) { row.remove(); throw error; }
                finally { sync(); }
            }
        }
        button.addEventListener('click', () => add().catch(error => feedback(form.querySelector('.erp-form-actions p'), error.message, true)));
        return {
            ready: Promise.all(Array.from({ length: minimum }, add)),
            read() {
                if (rows.children.length < minimum) throw new Error(`${title} requires at least ${minimum} line(s).`);
                return Array.from(rows.children, row => {
                    const data = read(form, row.specs);
                    return Object.fromEntries(fields.map((spec, index) => [spec.name, data[row.specs[index].name]]));
                });
            }
        };
    }

    function feedback(element, message, error = false) {
        element.textContent = message;
        element.classList.toggle('erp-error', error);
    }

    function table(columns, rows, actions) {
        return `<div class="erp-table-scroll"><table><thead><tr>${columns.map(col => `<th scope="col">${e(col.title)}</th>`).join('')}${actions ? '<th scope="col">Actions</th>' : ''}</tr></thead><tbody>
            ${rows.map((row, index) => `<tr>${columns.map(col => {
                const value = byKey(row, col.key);
                return `<td>${col.render ? col.render(value, row) : e(value == null || value === '' ? '—' : col.format ? col.format(value, row) : value)}</td>`;
            }).join('')}${actions ? `<td class="erp-row-actions">${actions(row, index)}</td>` : ''}</tr>`).join('') || `<tr><td class="erp-empty" colspan="${columns.length + Number(Boolean(actions))}">No records found.</td></tr>`}
            </tbody></table></div>`;
    }

    function metrics(columns, row) {
        return `<dl class="erp-metrics">${columns.map(col => {
            const value = byKey(row, col.key);
            const title = col.detail
                ? `<button type="button" class="erp-metric-button" data-summary-detail="${e(col.detail)}" aria-label="View ${e(col.title)} details">${e(col.title)}</button>`
                : e(col.title);
            return `<div><dt>${title}</dt><dd>${e(value == null ? '—' : col.format ? col.format(value, row) : value)}</dd></div>`;
        }).join('')}</dl>`;
    }

    function details(columns, row) {
        return `<dl class="erp-details">${columns.map(col => {
            const value = byKey(row, col.key);
            return `<div><dt>${e(col.title)}</dt><dd>${e(value == null || value === '' ? '—' : col.format ? col.format(value, row) : value)}</dd></div>`;
        }).join('')}</dl>`;
    }

    async function showPage(root, config, user) {
        const main = root.querySelector('main');
        const notice = root.querySelector('#erpNotice');
        const dialog = root.querySelector('dialog');
        const dialogBody = dialog.querySelector('.erp-dialog-body');
        const context = {
            user, notice,
            dialog(title, content = '') {
                dialog.querySelector('h2').textContent = title;
                dialogBody.innerHTML = content;
                if (!dialog.open) dialog.showModal();
                return dialogBody;
            },
            close: () => dialog.close(),
            notify: (message, error) => feedback(notice, message, error)
        };
        const params = new URLSearchParams(location.search);
        if (!can(user, config.permission ?? pagePermission(location.pathname), config.roles)) {
            context.notify('Your role does not have access to this page.', true);
            return;
        }
        const showForm = config.form && can(user, config.form.permission, config.form.roles);
        const showReadOnly = config.form?.readOnly && !showForm;
        const showList = config.path && can(user, config.listPermission);
        const actions = (config.actions || []).filter(action => can(user, action.permission, action.roles));
        const bikeSection = currentBikeSection(location.pathname);
        const sectionLinks = bikeSection?.pages.filter(([, path]) => canOpenPage(user, base + path)) || [];
        main.insertAdjacentHTML('beforeend', `
            ${sectionLinks.length > 1 ? `<nav class="kb-section-links" aria-label="${e(bikeSection.title)} pages">${sectionLinks.map(([title, path]) => navLink(title, path)).join('')}</nav>` : ''}
            ${config.intro ? `<div class="erp-panel">${config.intro}</div>` : ''}
            ${showForm || showReadOnly ? '<section class="erp-panel" id="erpFormPanel"></section>' : ''}
            ${showList ? `<section class="erp-panel" id="erpRecords">
                ${config.listTitle ? `<h2 class="admin-panel-title">${e(config.listTitle)}</h2>` : ''}
                ${config.filters?.length ? `<form class="erp-form erp-filters">${config.filters.map(spec => {
                    const input = control(spec, params.get(spec.name) ?? undefined);
                    return config.liveFilters ? `<div class="erp-filter-item">${input}<button class="erp-quiet erp-clear-filter" type="button" aria-label="Clear ${e(spec.label)}" data-clear-filter="${e(spec.name)}">×</button></div>` : input;
                }).join('')}<div>${config.liveFilters ? '<button class="erp-quiet" type="button" data-reset-filters>Reset all filters</button>' : '<button type="submit">Apply</button>'}</div></form>` : ''}
                ${config.exportPath && can(user, config.exportPermission) ? '<div class="erp-export" aria-label="Export records"><a data-export="csv">Export CSV</a><a data-export="excel">Export Excel</a></div>' : ''}
                <div class="erp-results" aria-live="polite">Loading…</div><nav class="erp-pagination" aria-label="Pages"></nav>
            </section>` : ''}`);
        const panel = main.querySelector('#erpRecords');
        const filter = panel?.querySelector('form');
        const results = panel?.querySelector('.erp-results');
        const pager = panel?.querySelector('.erp-pagination');
        let page = 1;
        let rows = [];
        let loadNumber = 0;
        let summaryPayload;

        async function load() {
            if (!panel) return;
            const id = ++loadNumber;
            const filters = filter ? read(filter, config.filters) : {};
            for (const link of panel.querySelectorAll('[data-export]')) {
                link.href = url(config.exportPath, { ...filters, format: link.dataset.export });
            }
            const path = typeof config.path === 'function' ? config.path(filters) : config.path;
            if (!path) {
                results.textContent = config.prompt || 'Select a record to continue.';
                pager.replaceChildren();
                return;
            }
            results.textContent = 'Loading…';
            pager.replaceChildren();
            try {
                const payload = await request(url(path, { ...filters, ...config.query, ...(config.paged ? { page, limit: 20 } : {}) }));
                if (id !== loadNumber) return;
                summaryPayload = payload;
                rows = config.rows ? config.rows(payload) : listData(payload);
                const buttons = actions.length && ((row, index) => actions.map((action, number) =>
                    !action.when || action.when(row, user) ? `<button class="erp-quiet" type="button" data-action="${number}" data-row="${index}">${e(action.title)}</button>` : ''
                ).join(''));
                const summary = config.summary?.(payload) || '';
                results.innerHTML = summary + (config.columns ? table(config.columns, rows, buttons) : '');
                const pagination = payload.pagination || payload.data?.pagination;
                if (config.paged && pagination?.totalPages > 1) {
                    pager.innerHTML = `<button type="button" class="erp-quiet" data-page="${page - 1}" ${page <= 1 ? 'disabled' : ''}>Previous</button><span>Page ${page} of ${Number(pagination.totalPages)}</span><button type="button" class="erp-quiet" data-page="${page + 1}" ${page >= pagination.totalPages ? 'disabled' : ''}>Next</button>`;
                }
            } catch (error) {
                if (id === loadNumber) feedback(results, error.message, true);
            }
        }
        context.load = load;
        results?.addEventListener('click', async event => {
            const detail = event.target.closest('[data-summary-detail]');
            if (detail && config.summaryDetail) {
                await config.summaryDetail(detail.dataset.summaryDetail, summaryPayload, context);
                return;
            }
            const button = event.target.closest('button[data-action]');
            if (!button) return;
            button.disabled = true;
            try {
                await actions[Number(button.dataset.action)].run(rows[Number(button.dataset.row)], context);
            } catch (error) {
                context.notify(error.message, true);
            } finally {
                button.disabled = false;
            }
        });
        pager?.addEventListener('click', event => {
            const button = event.target.closest('button[data-page]');
            if (button) { page = Number(button.dataset.page); load(); }
        });
        filter?.addEventListener('submit', event => {
            event.preventDefault();
            page = 1;
            load();
        });
        if (filter && config.liveFilters) {
            let timer;
            const refresh = () => {
                clearTimeout(timer);
                page = 1;
                timer = setTimeout(load, 160);
            };
            filter.addEventListener('input', refresh);
            filter.addEventListener('change', refresh);
            filter.addEventListener('click', event => {
                const button = event.target.closest('[data-clear-filter], [data-reset-filters]');
                if (!button) return;
                const names = button.hasAttribute('data-reset-filters') ? config.filters.map(spec => spec.name) : [button.dataset.clearFilter];
                for (const name of names) filter.elements.namedItem(name).value = '';
                refresh();
            });
        }
        if (filter) {
            try {
                await fillLookups(filter, config.filters, Object.fromEntries(params));
            } catch (error) {
                context.notify(error.message, true);
            }
        }
        load();
        if (showForm || showReadOnly) {
            const target = main.querySelector('#erpFormPanel');
            try {
                const values = await config.form.values?.(params) || {};
                if (showReadOnly) {
                    target.innerHTML = details(config.form.fields.map(spec => column(spec.name, spec.label)), values);
                    return;
                }
                await mountForm(target, config.form, values, async (payload, form) => {
                    if (config.form.saved) await config.form.saved(payload, form, context);
                    else if (panel) { form.reset(); await load(); }
                }, context);
            } catch (error) {
                feedback(target, error.message, true);
            }
        }
    }

    function edit(title, path, fields, options = {}) {
        return {
            title, roles: options.roles || management, permission: options.permission, when: options.when,
            async run(row, context) {
                const target = context.dialog(title);
                const values = options.values ? await options.values(row) : row;
                await mountForm(target, { fields, path: path(row), method: options.method || 'PUT', body: options.body, setup: options.setup }, values, async payload => {
                    context.close();
                    context.notify(payload.message || 'Changes saved.');
                    await context.load();
                    await options.saved?.(payload, context);
                }, context);
            }
        };
    }

    function action(title, run, options = {}) {
        return { title, run, ...options };
    }

    function remove(title, path, roles = management, permission) {
        return action(title, async (row, context) => {
            if (!window.confirm(`${title} ${row.name || 'this record'}?`)) return;
            const payload = await request(path(row), { method: 'DELETE' });
            context.notify(payload.message || 'Record removed.');
            await context.load();
        }, { roles, permission });
    }

    function navLabel(title, icon) {
        return icon ? `<span class="admin-nav-icon" aria-hidden="true">${e(icon)}</span>${e(title)}` : e(title);
    }

    function navLink(title, path, icon, selected) {
        const href = path.startsWith('/') ? path : base + path;
        const [pathname, queryString] = href.split('?');
        const currentType = new URLSearchParams(location.search).get('product_type');
        const current = location.pathname === pathname &&
            (queryString ? location.search === '?' + queryString :
                !currentType || !['/add-product.html', '/new-purchase.html'].some(suffix => pathname.endsWith(suffix)));
        return `<a href="${e(href)}"${(selected ?? current) ? ' aria-current="page"' : ''}>${navLabel(title, icon)}</a>`;
    }

    function links(items) {
        return `<nav class="erp-links" aria-label="Related pages">${items.map(([title, path]) => navLink(title, path)).join('')}</nav>`;
    }

    function mountSidebar(items = [], overview = false) {
        const body = document.body;
        const dashboard = '/admin/dashboard.html';
        const section = location.pathname.slice(base.length).split('/')[0];
        const modules = sections.flatMap(([, entries]) => entries);
        const activeBikeSection = currentBikeSection(location.pathname);
        const currentModule = location.pathname === dashboard ? null : modules.find(([, path]) => base + path === location.pathname) ||
            modules.find(([, path]) => path.startsWith(section + '/'));
        body.classList.add('admin-layout');
        body.insertAdjacentHTML('afterbegin', `
            <header class="admin-topbar admin-page-topbar">
                <button type="button" class="admin-menu-button" aria-label="Open menu" aria-controls="admin-sidebar" aria-expanded="false">☰</button>
                <button type="button" class="kb-collapse" aria-controls="admin-sidebar" aria-expanded="true">Collapse sidebar</button>
                ${overview ? `<div class="dashboard-heading"><small>Business overview</small><h1>Dashboard</h1></div>
                    <div class="dashboard-toolbar"><button type="button" class="refresh-button" id="refreshDashboard" aria-label="Refresh dashboard">⟳</button>
                    <button type="button" id="dashboardSignOut" aria-label="Sign out">↪</button></div>` : `<nav class="admin-breadcrumb" aria-label="Breadcrumb">
                    ${navLink('Dashboard', dashboard)}
                    ${activeBikeSection ? `<span aria-hidden="true">›</span><span>${e(activeBikeSection.title)}</span>` :
                        currentModule ? `<span aria-hidden="true">›</span>${navLink(currentModule[0], currentModule[1])}` : ''}
                </nav>`}
            </header>
            <div class="admin-sidebar-scrim" hidden></div>
            <aside class="admin-sidebar" id="admin-sidebar" aria-label="Admin sidebar">
                <div class="admin-sidebar-heading">
                    <a class="admin-sidebar-brand admin-wordmark" href="${dashboard}"><img src="/assets/icons/image.png" alt=""><strong>Khan Brothers</strong></a>
                    <button type="button" class="admin-menu-close" aria-label="Close menu">×</button>
                </div>
                <nav aria-label="Admin navigation">${navLink('Dashboard', dashboard, '🏠')}</nav>
                <div class="admin-sidebar-profile" hidden>
                    <span class="admin-sidebar-avatar" aria-hidden="true"></span>
                    <div><strong></strong><small></small></div>
                </div>
                <p class="admin-sidebar-status" role="status" hidden></p>
                <button type="button" class="admin-sidebar-logout" hidden>Sign out</button>
                <div class="kb-resize" role="separator" aria-label="Resize sidebar" aria-orientation="vertical"
                    aria-valuemin="190" aria-valuemax="420" aria-valuenow="275" tabindex="0"></div>
            </aside>`);

        const sidebar = body.querySelector('.admin-sidebar');
        const nav = sidebar.querySelector('nav');
        const topbar = body.querySelector('.admin-page-topbar');
        const toggle = topbar.querySelector('.admin-menu-button');
        const collapse = topbar.querySelector('.kb-collapse');
        const handle = sidebar.querySelector('.kb-resize');
        const closeButton = sidebar.querySelector('.admin-menu-close');
        const scrim = body.querySelector('.admin-sidebar-scrim');
        const profile = sidebar.querySelector('.admin-sidebar-profile');
        const logout = sidebar.querySelector('.admin-sidebar-logout');
        const status = sidebar.querySelector('.admin-sidebar-status');
        const mobile = matchMedia('(max-width: 800px)');
        const pageContent = body.querySelectorAll('main, footer');
        const storage = {
            get(key) { try { return localStorage.getItem(key); } catch { return null; } },
            set(key, value) { try { localStorage.setItem(key, value); } catch {} }
        };
        const widthKey = 'kb-sidebar-width';
        const collapsedKey = 'kb-sidebar-collapsed';
        let preferredWidth = Number(storage.get(widthKey)) || 275;
        let collapsed = storage.get(collapsedKey) === 'true';
        let dragPointer = null;

        function sizeSidebar(width, save = false) {
            const maximum = Math.min(420, Math.floor(innerWidth * .48));
            const chosen = Math.round(Math.max(190, Math.min(maximum, width)));
            body.style.setProperty('--kb-sidebar-width', chosen + 'px');
            handle.setAttribute('aria-valuenow', chosen);
            handle.setAttribute('aria-valuemax', maximum);
            if (save) {
                preferredWidth = chosen;
                storage.set(widthKey, String(chosen));
            }
        }

        function syncCollapse() {
            body.classList.toggle('kb-sidebar-collapsed', collapsed && !mobile.matches);
            collapse.setAttribute('aria-expanded', String(!collapsed));
            collapse.textContent = collapsed ? 'Expand sidebar' : 'Collapse sidebar';
        }

        sizeSidebar(preferredWidth);
        syncCollapse();
        window.addEventListener('resize', () => sizeSidebar(preferredWidth));
        collapse.addEventListener('click', () => {
            collapsed = !collapsed;
            storage.set(collapsedKey, String(collapsed));
            syncCollapse();
            if (!collapsed) showCurrentPage();
        });
        handle.addEventListener('pointerdown', event => {
            if (event.button !== 0 || dragPointer !== null) return;
            event.preventDefault();
            dragPointer = event.pointerId;
            handle.focus({ preventScroll: true });
            body.classList.add('kb-side-drag');
        });
        window.addEventListener('pointermove', event => {
            if (dragPointer === event.pointerId) {
                if (event.buttons & 1) sizeSidebar(event.clientX);
                else cancelDrag();
            }
        });
        window.addEventListener('pointerup', event => {
            if (dragPointer !== event.pointerId) return;
            sizeSidebar(event.clientX, true);
            cancelDrag();
        });
        function cancelDrag() {
            if (dragPointer === null) return;
            dragPointer = null;
            body.classList.remove('kb-side-drag');
            sizeSidebar(preferredWidth);
        }
        window.addEventListener('pointercancel', cancelDrag);
        window.addEventListener('blur', cancelDrag);
        handle.addEventListener('keydown', event => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault();
            const current = Number(handle.getAttribute('aria-valuenow'));
            sizeSidebar(event.key === 'Home' ? 190 : event.key === 'End' ? 420 :
                current + (event.key === 'ArrowLeft' ? -16 : 16), true);
        });

        function showCurrentPage() {
            const current = nav.querySelector('[aria-current="page"]');
            if (!current || (mobile.matches && scrim.hidden)) return;
            const navBounds = nav.getBoundingClientRect();
            const linkBounds = current.getBoundingClientRect();
            if (linkBounds.bottom > navBounds.bottom) nav.scrollTop += linkBounds.bottom - navBounds.bottom + 8;
        }

        function setMenu(open) {
            body.classList.toggle('admin-menu-open', open);
            toggle.setAttribute('aria-expanded', String(open));
            scrim.hidden = !open;
            topbar.inert = open;
            for (const element of pageContent) element.inert = open;
            if (open) {
                closeButton.focus({ preventScroll: true });
                showCurrentPage();
            } else if (mobile.matches) {
                toggle.focus({ preventScroll: true });
            } else if (document.activeElement === closeButton) {
                sidebar.querySelector('.admin-sidebar-brand').focus({ preventScroll: true });
            }
        }

        toggle.addEventListener('click', () => setMenu(scrim.hidden));
        closeButton.addEventListener('click', () => setMenu(false));
        scrim.addEventListener('click', () => setMenu(false));
        mobile.addEventListener('change', () => {
            if (!scrim.hidden) setMenu(false);
            syncCollapse();
            if (!mobile.matches) showCurrentPage();
        });
        body.addEventListener('keydown', event => {
            if (event.key === 'Escape' && !scrim.hidden) setMenu(false);
        });
        topbar.querySelector('#dashboardSignOut')?.addEventListener('click', () => logout.click());
        logout.addEventListener('click', async () => {
            logout.disabled = true;
            status.hidden = true;
            try {
                await request('/api/auth/logout', { method: 'POST' });
                location.replace('/admin/login.html');
            } catch (error) {
                status.textContent = error.message;
                status.hidden = false;
                logout.disabled = false;
            }
        });

        function renderNavigation(user) {
            const currentLinks = items.filter(([, path, roles]) => canOpenPage(user, path, roles));
            nav.innerHTML = sections.map(([group, modules]) => {
                const content = modules.flatMap(([title, home, roles, icon]) => {
                    if (home.startsWith('/') || home === 'sales/online-orders.html') return !user || canOpenPage(user, home, roles) ? navLink(title, home, icon) : [];
                    const folder = home.split('/')[0];
                    const path = !user || canOpenPage(user, home, roles) ? home :
                        Object.keys(pagePermissions).find(candidate => candidate.startsWith(folder + '/') &&
                            pagePermission(candidate) && can(user, pagePermission(candidate)));
                    if (!path) return [];
                    if (activeBikeSection || !path.startsWith(section + '/') || !currentLinks.length) return navLink(title, path, icon);
                    const heading = currentLinks.some(([, link]) => link === path)
                        ? `<span class="admin-sidebar-section">${navLabel(title, icon)}</span>`
                        : navLink(title, path, icon);
                    return `${heading}<div class="admin-sidebar-subpages">${currentLinks.map(([name, link]) => navLink(name, link)).join('')}</div>`;
                }).join('');
                return content ? `<div class="admin-nav-group"><p>${e(group)}</p>${content}</div>` : '';
            }).join('');
            const bikes = bikeSections.map(item => {
                const first = item.pages.find(([, path]) => !user || canOpenPage(user, base + path));
                return first ? navLink(item.title, first[1], item.icon, activeBikeSection === item) : '';
            }).join('');
            if (bikes) nav.insertAdjacentHTML('beforeend', '<div class="admin-nav-group"><p>Bike business</p>' + bikes + '</div>');
            if (!nav.hasChildNodes()) nav.innerHTML = navLink('Dashboard', dashboard, '🏠');
            showCurrentPage();
        }

        renderNavigation();
        return user => {
            const staffMember = staff.includes(user?.role);
            if (staffMember) {
                const name = user.name?.trim() || label(user.role);
                const initials = name.split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase();
                profile.querySelector('.admin-sidebar-avatar').textContent = initials;
                profile.querySelector('strong').textContent = name;
                profile.querySelector('small').textContent = label(user.role);
            }
            profile.hidden = !staffMember;
            logout.hidden = !staffMember;
            renderNavigation(user);
        };
    }

    async function start() {
        const container = document.querySelector('[data-erp-page]');
        if (!container) return;
        const config = pages[container.dataset.erpPage];
        if (!config) return;
        container.insertAdjacentHTML('beforeend', `<main class="erp-main"><header class="erp-page-heading admin-hero"><h1>${e(config.title)}</h1></header><p id="erpNotice" role="status"></p></main>
            <dialog aria-labelledby="erpDialogTitle"><header class="erp-dialog-header"><h2 id="erpDialogTitle"></h2><form method="dialog"><button type="submit" class="erp-quiet">Close</button></form></header><div class="erp-dialog-body"></div></dialog>`);
        const setSidebarUser = mountSidebar(config.links);
        const notice = container.querySelector('#erpNotice');
        try {
            const user = await getSession();
            if (!staff.includes(user?.role)) {
                location.replace('/admin/login.html');
                return;
            }
            setSidebarUser(user);
            await showPage(container, config, user);
        } catch (error) {
            if (error.status === 401) location.replace('/admin/login.html');
            else feedback(notice, error.message, true);
        }
    }

    document.addEventListener('DOMContentLoaded', start);
    return { pages, management, finance, administrators, staff, field, select, lookup, amount, integer, text, search,
        dates, column, currency, day, status, active, customer, product, action, edit, remove, table, details, metrics, links,
        getSession, feedback, repeat, mountSidebar, reportLinks, auditLinks, purchaseLinks, can, canOpenPage };
})();
