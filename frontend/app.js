'use strict';

(() => {
    const $ = selector => document.querySelector(selector);
    const view = $('#view');
    const workspace = $('#workspace');
    const receiptDialog = $('#receipt');
    const payment = { cash: 'Cash', bank: 'Bank Transfer', jazzcash: 'JazzCash', easypaisa: 'EasyPaisa', card: 'Card', qist: 'Qist / Udhar' };
    const categories = ['Kiraya','Chai','Petrol','Mechanic','Other'];
    const nav = {
        dashboard: ['Dashboard','⌂'], purchase: ['Purchase','＋'], stock: ['Stock','▦'], sell: ['Sell','⇄'],
        profit: ['Profit','▥'], expenses: ['Expenses','−'], customers: ['Customers','◎'], qist: ['Qist','◷']
    };
    const pageNames = { ...Object.fromEntries(Object.entries(nav).map(([key, value]) => [key, value[0]])), sold: 'Sold Bikes' };
    const titles = { purchase: 'Purchase Bike', sell: 'Sell Bike', profit: 'Profit Report', qist: 'Qist / Udhar' };
    const esc = value => String(value ?? '').replace(/[&<>"']/g, letter =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[letter]);
    const cents = value => Math.round(Number(value || 0) * 100);
    const money = new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR', maximumFractionDigits: 2 });
    const format = value => value == null || value === '' ? '—' : money.format(Number(value));
    const sum = (rows, field) => rows.reduce((total, row) => total + cents(row[field]), 0) / 100;
    const statusText = { stock: 'In stock', sold: 'Sold', paid: 'Paid', pending: 'Pending' };
    const photoPath = /^(?:https:\/\/[^\s]+|\/api\/bikes\/photos\/[0-9a-f-]{36}\.(?:jpg|png|webp))$/i;
    let data;
    let dataRevision = 0;
    let lastPage = '';
    let filterState = new Map();

    async function request(path, options = {}) {
        const init = { ...options, headers: { Accept: 'application/json', ...options.headers } };
        if (init.body && !(init.body instanceof FormData)) {
            init.headers['Content-Type'] = 'application/json';
            init.body = JSON.stringify(init.body);
        }
        const response = await fetch('/api' + path, init);
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw Object.assign(new Error(body.error || 'The request failed.'), { status: response.status });
        return body;
    }

    function signInView() {
        workspace.hidden = true;
        $('#signIn').hidden = false;
        if (receiptDialog.open) receiptDialog.close();
        data = undefined;
        lastPage = '';
        filterState = new Map();
    }

    function notice(message, error = false, target = $('#status')) {
        target.textContent = message;
        target.classList.toggle('error', error);
    }

    async function refresh({ render = true, announce = false } = {}) {
        const revision = ++dataRevision;
        try {
            const snapshot = await request('/state');
            if (revision !== dataRevision) return;
            data = snapshot;
            workspace.hidden = false;
            $('#signIn').hidden = true;
            if (render) renderPage();
            if (announce) notice('Data refreshed.');
        } catch (error) {
            if (revision !== dataRevision) return;
            if (error.status === 401) {
                signInView();
                return;
            }
            if (workspace.hidden) {
                signInView();
                notice(error.message, true, $('#loginStatus'));
            } else notice(error.message, true);
            if (!render) throw error;
        }
    }

    const label = (title, control) => `<label>${esc(title)}${control}</label>`;
    const input = (name, title, { type = 'text', required = false, max = 150, value = '', min = 0, extra = '' } = {}) =>
        label(title, `<input name="${name}" type="${type}" value="${esc(value)}" ${required ? 'required' : ''}
            ${type === 'number' ? `step="0.01" min="${min}" max="${max}"` : `maxlength="${max}"`} ${extra}>`);
    const amount = (name, title, { initial = '', required = false, min = 0, max = 9999999999.99 } = {}) =>
        input(name, title, { type: 'number', value: initial, required, min, max });
    function select(name, title, options, current = '', placeholder = 'Any') {
        return label(title, `<select name="${name}"><option value="">${esc(placeholder)}</option>${options.map(([key, text]) =>
            `<option value="${esc(key)}"${String(key) === String(current) ? ' selected' : ''}>${esc(text)}</option>`).join('')}</select>`);
    }
    const panel = (title, body, actions = '') =>
        `<section class="panel"><div class="panel-heading"><h2>${esc(title)}</h2>${actions}</div>${body}</section>`;
    const button = (text, route, primary = false) => `<a class="button${primary ? ' primary' : ''}" href="#${route}">${esc(text)}</a>`;
    const heading = (page, actions = '') => `<header class="page-heading"><h1>${esc(titles[page] || pageNames[page])}</h1><div class="actions">${actions}</div></header>`;
    const formStatus = '<p class="notice wide" role="status"></p>';
    const submit = text => `<div class="actions wide"><button class="primary" type="submit">${esc(text)}</button></div>${formStatus}`;
    const columns = {
        expenses: [['Date','date'],['Category','type'],['Description','description'],['Amount','amount','money']],
        sold: [['Bike','bike_name'],['Model','model'],['Chassis','chassis_no'],['Customer','customer_name'],['Date','date'],
            ['Payment',row => esc(payment[row.payment_method])],['Sold price','sell_price','money'],['Total cost','cost_at_sale','money'],
            ['Real profit','profit','money'],['Receipt',row => `<button type="button" data-receipt="${esc(row.id)}">Receipt</button>`]],
        stock: [['Photo',row => photoPath.test(row.photo_url || '') ? `<img src="${esc(row.photo_url)}" alt="${esc(row.bike_name)}" loading="lazy">` : '—'],
            ['Bike','bike_name'],['Model','model'],['Chassis','chassis_no'],['Status',row => esc(statusText[row.status])],
            ['Purchase','purchase_price','money'],['Repair','repair_cost','money'],['Other','other_cost','money'],
            ['Total cost','total_cost','money'],['Sell price','sell_price','money'],['Expected profit','expected_profit','money'],
            ['Details',row => `<button type="button" data-bike="${esc(row.id)}">View bike</button>`]]
    };

    function table(rows, columns) {
        if (!rows.length) return '<p class="empty">No matching records.</p>';
        return `<div class="table-wrap"><table><thead><tr>${columns.map(([title]) => `<th scope="col">${esc(title)}</th>`).join('')}</tr></thead>
            <tbody>${rows.map(row => '<tr>' + columns.map(([, key, type]) => `<td${type === 'money' ? ' class="money"' : ''}>${
                typeof key === 'function' ? key(row) : esc(type === 'money' ? format(row[key]) : row[key] ?? '—')
            }</td>`).join('') + '</tr>').join('')}</tbody></table></div>`;
    }

    function metrics(entries) {
        return '<div class="metrics">' + entries.map(([title, value, target]) => {
            const content = `<span>${esc(title)}</span><strong>${esc(value)}</strong>`;
            return target ? `<a class="metric" href="#${target}">${content}</a>` : `<div class="metric">${content}</div>`;
        }).join('') + '</div>';
    }

    function exportLinks(section) {
        return `<div class="actions"><a class="button" href="/api/export/${section}?format=csv">Export CSV</a>
            <a class="button" href="/api/export/${section}?format=excel">Export Excel</a></div>`;
    }

    function saleTabs(page) {
        return '<nav class="tabs" aria-label="Sales pages">' + [['sell','Sell Bike'],['sold','Sold Bikes'],['qist','Qist / Udhar']].map(
            ([key, title]) => `<a class="button" href="#${key}" ${key === page ? 'aria-current="page"' : ''}>${title}</a>`
        ).join('') + '</nav>';
    }

    const lower = value => String(value ?? '').trim().toLocaleLowerCase();
    const contains = (value, term) => lower(value).includes(lower(term));
    const compact = value => lower(value).replace(/[^a-z0-9]/g, '');
    function matches(row, query) {
        const term = lower(query.search);
        if (term && ![row.bike_name,row.customer_name,row.name,row.chassis_no,row.phone].some(value => contains(value, term)) &&
            !(compact(term) && compact(row.chassis_no).includes(compact(term)))) return false;
        if (!contains(row.bike_name, query.bike) || !contains(row.model, query.model)) return false;
        const price = row.sell_price;
        if ((query.min_price || query.max_price) && price == null) return false;
        if (query.min_price && Number(price) < Number(query.min_price)) return false;
        if (query.max_price && Number(price) > Number(query.max_price)) return false;
        if (query.status && query.status !== row.filter_status) return false;
        return !query.payment || query.payment === row.payment_method;
    }

    function filterForm(page, statuses) {
        const previous = filterState.get(page) || {};
        const filter = (name, html) => `<div class="filter-box${name === 'search' ? ' search-slot' : ''}">${html}
            <button type="button" data-clear="${name}" aria-label="Clear ${name.replaceAll('_',' ')}">×</button></div>`;
        return `<form id="filters" class="filters" role="search">
            ${filter('search', input('search', 'Search by bike, customer or chassis', { type: 'search', value: previous.search, extra: 'placeholder="Name or chassis number"' }))}
            ${filter('bike', input('bike','Bike', { value: previous.bike }))}
            ${filter('model', input('model','Model', { value: previous.model }))}
            ${filter('min_price', amount('min_price','Minimum price', { initial: previous.min_price }))}
            ${filter('max_price', amount('max_price','Maximum price', { initial: previous.max_price }))}
            ${filter('status', select('status','Status', statuses, previous.status))}
            ${filter('payment', select('payment','Payment', Object.entries(payment), previous.payment))}
            <div class="actions"><button type="button" data-reset>Reset All Filters</button></div>
        </form><div id="filteredRecords" aria-live="polite"></div>`;
    }

    function filterRecords(page, render) {
        const form = $('#filters');
        const target = $('#filteredRecords');
        const update = () => {
            const filters = Object.fromEntries(new FormData(form));
            filterState.set(page, filters);
            target.innerHTML = render(filters);
        };
        form.addEventListener('submit', event => { event.preventDefault(); update(); });
        form.addEventListener('input', update);
        form.addEventListener('change', update);
        form.addEventListener('click', event => {
            const clear = event.target.closest('[data-clear]');
            if (clear) form.elements[clear.dataset.clear].value = '';
            else if (event.target.closest('[data-reset]')) {
                for (const control of form.elements) if (control.name) control.value = '';
            } else return;
            update();
        });
        update();
    }

    function dashboard() {
        const todaySales = data.sold.filter(row => row.date === data.today);
        const todayExpenses = data.expenses.filter(row => row.date === data.today);
        const gross = sum(data.sold, 'profit');
        const expenses = sum(data.expenses, 'amount');
        const stock = data.bikes.filter(row => row.status === 'stock');
        const reminderThrough = new Date(Date.parse(data.today) + 7 * 86400000).toISOString().slice(0,10);
        const reminders = data.qist.filter(row => row.status === 'pending' && row.next_date <= reminderThrough);
        return `<section class="hero"><div><h1>Khan Brothers</h1>${button('Purchase Bike','purchase',true)}</div><img src="/kb.png" alt="" width="140" height="140"></section>` +
            metrics([['Today Sale',format(sum(todaySales,'sell_price')),'sold'],['Today Expense',format(sum(todayExpenses,'amount')),'expenses'],
                ['Today Profit',format((cents(sum(todaySales,'profit')) - cents(sum(todayExpenses,'amount'))) / 100),'profit'],
                ['Total Profit',format(gross),'profit'],['Total Capital',format(sum(stock,'total_cost')),'stock']]) +
            panel('Qist reminders', reminders.length ? table(reminders, [['Customer','customer_name'],['Bike','bike_name'],['Due date','next_date'],
                ['Monthly Qist','monthly_qist','money'],['Remaining','remaining','money']]) : '<p class="empty">No payments due in the next 7 days.</p>', button('View Qist','qist')) +
            panel('Daily hisaab', metrics([['Net Profit',format((cents(gross) - cents(expenses)) / 100),'profit'],
                ['Stock Bikes',String(stock.length),'stock'],['Sold Bikes',String(data.sold.length),'sold']]));
    }

    function purchase() {
        return heading('purchase', button('View Stock','stock')) + panel('Bike details', `<form id="purchaseForm" class="form-grid">
            ${input('bike_name','Bike Name',{required:true})}${input('model','Model',{required:true,max:100})}
            ${input('chassis_no','Chassis No',{max:80})}${input('plate_no','Plate No',{max:40})}
            ${input('condition_engine','Engine condition',{max:120})}${input('condition_tyre','Tyre condition',{max:120})}
            ${input('condition_body','Body condition',{max:120})}
            ${input('purchased_on','Purchase date',{type:'date',value:data.today})}
            ${label('Bike photo','<input name="photo" type="file" accept="image/jpeg,image/png,image/webp">')}
            ${input('photo_url','Photo URL (optional)',{type:'url',max:2048})}
            ${amount('purchase_price','Purchase Price',{required:true})}${amount('repair_cost','Repair Cost',{initial:0})}
            ${amount('other_cost','Other Cost',{initial:0})}${amount('sell_price','Expected Sell Price',{min:.01})}
            ${select('purchase_method','Purchase Payment',Object.entries(payment).filter(([key]) => key !== 'qist'),'cash')}
            <p class="calculation wide" aria-live="polite"></p>${submit('Save to Stock')}</form>`);
    }

    function sale() {
        const stock = data.bikes.filter(row => row.status === 'stock');
        const selected = stock.find(bike => String(bike.id) === (sessionStorage.getItem('kb-spa-sell-bike') || ''));
        return heading('sell') + saleTabs('sell') + (stock.length ? panel('Sale details', `<form id="saleForm" class="form-grid">
            ${select('bike_id','Bike',stock.map(row => [row.id,[row.bike_name,row.model,row.chassis_no].filter(Boolean).join(' · ')]),selected?.id,'Choose a bike')}
            ${input('customer_name','Customer name',{required:true,max:100})}${input('customer_phone','Phone',{required:true,type:'tel',max:24})}
            ${input('customer_cnic','CNIC',{max:15})}${amount('sell_price','Bike Price',{required:true,min:.01,initial:selected?.sell_price ?? ''})}
            ${select('payment_method','Payment Method',Object.entries(payment),'cash','Choose a method')}
            ${amount('interest_rate','Flat interest (%)',{initial:0,max:999.99})}
            ${amount('advance','Advance',{initial:0})}${amount('monthly_qist','Monthly Qist',{min:.01})}
            ${input('next_date','Next Date',{type:'date',extra:`min="${data.today}"`})}
            <p class="calculation wide" aria-live="polite"></p>${submit('Record Sale')}</form>`) +
            panel('Find a stock bike',filterForm('sell',[['stock','In stock']])) :
            panel('No bikes in stock', button('Purchase Bike','purchase',true)));
    }

    function expensePage() {
        return heading('expenses') + panel('Add expense', `<form id="expenseForm" class="form-grid">
            ${select('type','Category',categories.map(category => [category,category]),'','Choose a category')}
            ${amount('amount','Amount',{required:true,min:.01})}${input('date','Date',{type:'date',required:true,value:data.today})}
            ${input('description','Description',{max:250})}${submit('Save Expense')}</form>`) +
            panel('Expense history', table(data.expenses, columns.expenses));
    }

    function qistPage() {
        return heading('qist') + saleTabs('qist') + panel('Payment plans', table(data.qist, [
            ['Bike','bike_name'],['Customer','customer_name'],['Total','total','money'],['Advance','advance','money'],
            ['Remaining','remaining','money'],['Monthly Qist','monthly_qist','money'],['Next Date','next_date'],
            ['Status',row => esc(statusText[row.status])], ['Actions',row => `<div class="actions"><button type="button" data-receipt="${esc(row.sale_id)}">Receipt</button>
                ${row.status === 'pending' ? `<button type="button" data-collect="${esc(row.id)}">Record Payment</button>` : ''}</div>`]]
        ));
    }

    function renderPage() {
        if (!data) return;
        const hash = location.hash.slice(1);
        const page = Object.hasOwn(pageNames, hash) ? hash : 'dashboard';
        if (lastPage && lastPage !== page) window.showKBLoader?.();
        lastPage = page;
        $('#breadcrumb').textContent = titles[page] || pageNames[page];
        $('#navigation').innerHTML = Object.entries(nav).map(([key,[title,icon]]) =>
            `<a href="#${key}" ${key === page || (key === 'sell' && page === 'sold') ? 'aria-current="page"' : ''}><span aria-hidden="true">${icon}</span>${title}</a>`
        ).join('');
        if (page === 'dashboard') view.innerHTML = dashboard();
        else if (page === 'purchase') { view.innerHTML = purchase(); bindPurchase(); }
        else if (page === 'sell') {
            view.innerHTML = sale();
            if ($('#saleForm')) {
                bindSale();
                filterRecords('sell', filters => table(data.bikes.filter(row => row.status === 'stock' &&
                    matches({ ...row, filter_status: 'stock' }, filters)), [
                    ['Bike','bike_name'],['Model','model'],['Chassis','chassis_no'],['Sell price','sell_price','money'],
                    ['Action',row => `<button type="button" data-sell-bike="${esc(row.id)}">Select Bike</button>`]]));
            }
        }
        else if (page === 'expenses') { view.innerHTML = expensePage(); bindExpense(); }
        else if (page === 'qist') view.innerHTML = qistPage();
        else renderRecords(page);
    }

    function renderRecords(page) {
        const paidStatuses = [['paid','Paid'],['pending','Balance due']];
        const sold = data.sold.map(row => ({ ...row, filter_status: Number(row.amount_due) > 0 ? 'pending' : 'paid' }));
        if (page === 'stock') {
            const stock = data.bikes.filter(row => row.status === 'stock');
            view.innerHTML = heading('stock',button('Purchase Bike','purchase',true)) +
                metrics([['Total Stock Bikes',String(stock.length)],['Total Capital',format(sum(stock,'total_cost'))],['Expected Profit',format(sum(stock,'expected_profit'))]]) +
                panel('Inventory',filterForm(page,[['stock','In stock'],['sold','Sold']]),exportLinks('stock'));
            filterRecords(page, filters => table(data.bikes.filter(row => (filters.status || 'stock') === row.status &&
                matches({ ...row, filter_status: row.status }, filters)),columns.stock));
        } else if (page === 'customers') {
            const customerColumns = [['Name','name'],['Phone','phone'],['CNIC','cnic'],['Qist balance','qist_balance','money'],
                ['Purchases',row => `<button type="button" data-customer="${esc(row.id)}">View purchases</button>`]];
            view.innerHTML = heading('customers') + panel('Customer records',filterForm(page,paidStatuses),exportLinks('customers'));
            filterRecords(page, filters => table(data.customers.filter(row => {
                const { bike, model, payment: method, min_price, max_price, search, status } = filters;
                const purchases = sold.filter(sale => String(sale.customer_id) === String(row.id));
                const customerStatus = Number(row.qist_balance) > 0 ? 'pending' : 'paid';
                if (status && customerStatus !== status) return false;
                const personalMatch = search && [row.name,row.phone].some(value => contains(value, search));
                if (!bike && !model && !method && !min_price && !max_price && (!search || personalMatch)) return true;
                return purchases.some(sale => matches({ ...sale, phone: row.phone }, { ...filters, status: '', search: personalMatch ? '' : search }));
            }),customerColumns));
        } else {
            const isProfit = page === 'profit';
            const expenses = sum(data.expenses, 'amount');
            const gross = sum(sold,'profit');
            view.innerHTML = heading(page) + (isProfit ? metrics([
                ['Total Sale Profit',format(gross)],['Total Expenses',format(expenses),'expenses'],
                ['Net Profit',format((cents(gross) - cents(expenses)) / 100)]
            ]) : saleTabs('sold')) + panel('Sold motorcycles',filterForm(page,paidStatuses),exportLinks(page)) +
                (isProfit ? panel('Operating expenses',table(data.expenses,columns.expenses)) : '');
            filterRecords(page, filters => table(sold.filter(row => matches(row, filters)),columns.sold));
        }
    }

    function values(form) { return Object.fromEntries(new FormData(form)); }
    function saveForm(form, handler) {
        form.addEventListener('submit', async event => {
            event.preventDefault();
            const button = form.querySelector('button[type=submit]');
            const output = form.querySelector('.notice');
            button.disabled = true;
            notice('Saving…', false, output);
            try {
                await handler(values(form), form.dataset.requestKey ||= crypto.randomUUID());
                delete form.dataset.requestKey;
            } catch (error) {
                if (error.status === 401) signInView();
                notice(error.message, true, output);
            } finally { button.disabled = false; }
        });
    }

    function bindPurchase() {
        const form = $('#purchaseForm');
        const update = () => {
            const total = ['purchase_price','repair_cost','other_cost'].reduce((cost,key) => cost + cents(form.elements[key].value),0);
            const price = form.elements.sell_price.value;
            form.querySelector('.calculation').textContent = 'Total Cost ' + format(total / 100) + ' · Expected Profit ' +
                (price ? format((cents(price) - total) / 100) : '—');
        };
        form.addEventListener('input', update);
        update();
        saveForm(form, async (fields, key) => {
            const photo = fields.photo;
            delete fields.photo;
            if (photo?.size) {
                if (photo.size > 2 * 1024 * 1024) throw new Error('Photos must be at most 2 MB.');
                const signature = [photo.name, photo.size, photo.lastModified].join(':');
                if (form.uploadedPhoto?.signature !== signature) {
                    const body = new FormData();
                    body.append('photo', photo);
                    const result = await request('/bikes/photos', { method:'POST',body });
                    form.uploadedPhoto = { signature, url: result.photo_url };
                }
                fields.photo_url = form.uploadedPhoto.url;
            }
            await request('/bikes', { method:'POST', body:{ ...fields, request_key:key } });
            await refresh({ render:false });
            location.hash = 'stock';
        });
    }

    function bindSale() {
        const form = $('#saleForm');
        const selectBike = form.elements.bike_id;
        selectBike.required = true;
        form.elements.payment_method.required = true;
        const update = () => {
            const qist = form.elements.payment_method.value === 'qist';
            for (const key of ['interest_rate','advance','monthly_qist','next_date']) {
                const control = form.elements[key];
                control.disabled = !qist;
                control.closest('label').hidden = !qist;
                control.required = qist && ['monthly_qist','next_date'].includes(key);
            }
            const remaining = form.querySelector('.calculation');
            remaining.hidden = !qist;
            if (!qist) return;
            const base = cents(form.elements.sell_price.value);
            const interest = Math.round(base * cents(form.elements.interest_rate.value) / 10000);
            const balance = base + interest - cents(form.elements.advance.value);
            const monthly = cents(form.elements.monthly_qist.value);
            const count = monthly > 0 && balance > 0 ? Math.ceil(balance / monthly) : 0;
            remaining.textContent = 'Interest ' + format(interest / 100) + ' · Total payable ' + format((base + interest) / 100) +
                ' · Remaining ' + format(balance / 100) + (count ? ' · ' + count + ' qists · Last Qist ' + format((balance - (count - 1) * monthly) / 100) : '');
        };
        selectBike.addEventListener('change', () => {
            form.elements.sell_price.value = data.bikes.find(row => String(row.id) === selectBike.value)?.sell_price ?? '';
            update();
        });
        form.addEventListener('input', update);
        form.addEventListener('change', update);
        update();
        saveForm(form, async (fields, key) => {
            const result = await request('/sales', { method:'POST', body:{ ...fields, request_key:key } });
            sessionStorage.removeItem('kb-spa-sell-bike');
            await refresh({ render:false });
            location.hash = 'sold';
            receipt(result.id);
        });
    }

    function bindExpense() {
        const form = $('#expenseForm');
        form.elements.type.required = true;
        saveForm(form, async (fields, key) => {
            await request('/expenses', { method:'POST', body:{ ...fields, request_key:key } });
            await refresh();
        });
    }

    function showDialog(title, body) {
        $('#receiptTitle').textContent = title;
        $('#receiptBody').innerHTML = body;
        if (!receiptDialog.open) receiptDialog.showModal();
    }

    const details = entries => '<dl class="receipt-data">' + entries.map(([label, value]) =>
        `<div><dt>${esc(label)}</dt><dd>${esc(value ?? '—')}</dd></div>`).join('') + '</dl>';

    function receipt(id) {
        const row = data.sold.find(record => String(record.id) === String(id));
        if (!row) return;
        const plan = data.qist.find(record => String(record.sale_id) === String(row.id));
        const fields = [
            ['Receipt','KB-' + row.id],['Date',row.date],['Bike',[row.bike_name,row.model].filter(Boolean).join(' · ')],
            ['Chassis',row.chassis_no],['Plate',row.plate_no],['Customer',row.customer_name],['Phone',row.customer_phone],
            ['CNIC',row.customer_cnic],['Payment',payment[row.payment_method]],['Bike price',format(row.bike_price)],
            ...(plan ? [['Interest',format(row.interest_amount) + ' (' + Number(row.interest_rate) + '%)'],['Advance',format(plan.advance)],
                ['Monthly Qist',format(plan.monthly_qist)],['Next date',plan.next_date],['Remaining',format(plan.remaining)]] : []),
            ['Total price',format(row.sell_price)]
        ];
        const share = ['Khan Brothers', ...fields.filter(([label]) => label !== 'CNIC').map(([label,value]) => label + ' ' + (value ?? '—'))].join('\n');
        showDialog('Sale receipt', `<div class="receipt-brand"><img src="/kb.png" alt="" width="46" height="46"><h2>Khan Brothers</h2></div>
            ${details(fields)}<div class="actions"><button type="button" data-print>Print</button>
            <a class="button" href="https://wa.me/?text=${esc(encodeURIComponent(share))}" target="_blank" rel="noopener noreferrer">WhatsApp Share</a></div>`);
    }

    function collect(id) {
        const plan = data.qist.find(row => String(row.id) === id);
        if (!plan || plan.status !== 'pending') return;
        showDialog('Record Qist Payment', `<form id="collectForm" class="form-grid">
            ${amount('amount','Amount collected',{initial:Math.min(Number(plan.monthly_qist),Number(plan.remaining)),required:true,min:.01,max:plan.remaining})}
            ${input('next_date','Updated next date (optional)',{type:'date',extra:`min="${data.today}"`})}${submit('Save Payment')}</form>`);
        saveForm($('#collectForm'), async (fields, key) => {
            await request('/qist/' + id + '/payments', { method:'POST', body:{ ...fields, request_key:key } });
            receiptDialog.close();
            await refresh();
        });
    }

    function bikeDetails(id) {
        const bike = data.bikes.find(row => String(row.id) === id);
        if (!bike) return;
        showDialog(bike.bike_name, details([['Model',bike.model],['Chassis',bike.chassis_no],['Plate',bike.plate_no],
            ['Engine',bike.condition_engine],['Tyres',bike.condition_tyre],['Body',bike.condition_body],['Purchased',bike.purchased_on],
            ['Total cost',format(bike.total_cost)],['Expected sell price',format(bike.sell_price)]]) +
            (bike.status === 'stock' ? `<button type="button" class="primary" data-sell-bike="${esc(bike.id)}">Sell Bike</button>` : ''));
    }

    function customerDetails(id) {
        const customer = data.customers.find(row => String(row.id) === id);
        if (!customer) return;
        showDialog(customer.name, details([['Phone',customer.phone],['CNIC',customer.cnic],['Qist balance',format(customer.qist_balance)]]) +
            table(data.sold.filter(row => String(row.customer_id) === id),columns.sold));
    }

    document.addEventListener('click', event => {
        const action = event.target.closest('button');
        if (!action) return;
        if (action.hasAttribute('data-receipt')) receipt(action.dataset.receipt);
        else if (action.hasAttribute('data-collect')) collect(action.dataset.collect);
        else if (action.hasAttribute('data-bike')) bikeDetails(action.dataset.bike);
        else if (action.hasAttribute('data-customer')) customerDetails(action.dataset.customer);
        else if (action.hasAttribute('data-print')) window.print();
        else if (action.hasAttribute('data-sell-bike')) {
            const form = $('#saleForm');
            if (receiptDialog.open) receiptDialog.close();
            if (form) {
                form.elements.bike_id.value = action.dataset.sellBike;
                form.elements.bike_id.dispatchEvent(new Event('change'));
                form.elements.bike_id.focus();
            } else {
                sessionStorage.setItem('kb-spa-sell-bike', action.dataset.sellBike);
                location.hash = 'sell';
            }
        }
    });

    $('#loginForm').addEventListener('submit', async event => {
        event.preventDefault();
        const form = event.currentTarget;
        const button = form.querySelector('button');
        button.disabled = true;
        const output = $('#loginStatus');
        try {
            await request('/login', { method:'POST', body:values(form) });
            form.reset();
            notice('', false, output);
            await refresh();
        } catch (error) { notice(error.message, true, output); }
        finally { button.disabled = false; }
    });
    $('#signOut').addEventListener('click', async () => {
        try {
            await request('/logout',{method:'POST'});
            dataRevision++;
            setDrawer(false);
            signInView();
        } catch (error) { notice(error.message,true); }
    });
    $('#refresh').addEventListener('click', () => refresh({ announce:true }));

    const storage = {
        read: key => { try { return localStorage.getItem(key); } catch { return null; } },
        write: (key,value) => { try { localStorage.setItem(key,value); } catch {} }
    };
    const mobile = matchMedia('(max-width: 760px)');
    const resize = $('.resize');
    const collapse = $('#collapse');
    const backdrop = $('#drawerBackdrop');
    const pageRegion = $('#pageRegion');
    const drawerOpen = $('.drawer-open');
    const drawerClose = $('.drawer-close');
    let width = Number(storage.read('kb-spa-sidebar-width')) || 232;
    let collapsed = storage.read('kb-spa-sidebar-collapsed') === 'true';
    let pointer = null;

    function size(size, persist = false) {
        const max = Math.min(392, Math.floor(innerWidth * .49));
        const value = Math.round(Math.max(178, Math.min(max, size)));
        workspace.style.setProperty('--sidebar-width',value + 'px');
        resize.setAttribute('aria-valuenow',value);
        resize.setAttribute('aria-valuemax',Math.max(max,178));
        if (persist) { width = value; storage.write('kb-spa-sidebar-width',String(value)); }
    }
    function setDrawer(open) {
        workspace.classList.toggle('drawer',open);
        backdrop.hidden = !open;
        drawerOpen.setAttribute('aria-expanded',String(open));
        pageRegion.inert = open;
        if (open) drawerClose.focus();
        else if (mobile.matches && !workspace.hidden) drawerOpen.focus();
    }
    function updateCollapse() {
        workspace.classList.toggle('collapsed',collapsed);
        collapse.textContent = collapsed ? 'Expand sidebar' : 'Collapse sidebar';
        collapse.setAttribute('aria-expanded',String(!collapsed));
    }
    size(width);
    updateCollapse();
    addEventListener('resize',() => size(width));
    mobile.addEventListener('change', () => setDrawer(false));
    drawerOpen.addEventListener('click',() => setDrawer(true));
    drawerClose.addEventListener('click',() => setDrawer(false));
    backdrop.addEventListener('click',() => setDrawer(false));
    document.addEventListener('keydown',event => { if (event.key === 'Escape' && !backdrop.hidden) setDrawer(false); });
    $('#navigation').addEventListener('click',event => { if (event.target.closest('a') && mobile.matches) setDrawer(false); });
    collapse.addEventListener('click',() => {
        collapsed = !collapsed;
        storage.write('kb-spa-sidebar-collapsed',String(collapsed));
        updateCollapse();
    });
    resize.addEventListener('pointerdown',event => {
        if (event.button !== 0 || pointer !== null) return;
        event.preventDefault();
        pointer = event.pointerId;
        workspace.classList.add('resizing');
    });
    addEventListener('pointermove',event => { if (pointer === event.pointerId && (event.buttons & 1)) size(event.clientX); });
    function endResize() { pointer = null; workspace.classList.remove('resizing'); size(width); }
    addEventListener('pointerup',event => { if (pointer === event.pointerId) { size(event.clientX,true); endResize(); } });
    addEventListener('pointercancel',endResize);
    addEventListener('blur',endResize);
    resize.addEventListener('keydown',event => {
        if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
        event.preventDefault();
        size(event.key === 'Home' ? 178 : event.key === 'End' ? 392 : width + (event.key === 'ArrowLeft' ? -16 : 16), true);
    });
    addEventListener('hashchange',() => { notice(''); renderPage(); });
    refresh().then(async () => {
        if ($('#signIn').hidden) return;
        const setup = await request('/health').catch(() => null);
        if (setup && !setup.databaseConfigured) notice('Connect Supabase to start saving records.', false, $('#loginStatus'));
        else if (setup && !setup.signInConfigured) notice('Configure a staff password to sign in.', false, $('#loginStatus'));
    });
})();

