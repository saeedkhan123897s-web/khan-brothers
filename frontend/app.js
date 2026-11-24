'use strict';

(() => {
    const $ = selector => document.querySelector(selector);
    const view = $('#view');
    const workspace = $('#workspace');
    const receiptDialog = $('#receipt');
    const refreshButton = $('#refresh');
    const { t } = window.kbLanguage;
    const payment = { cash: 'Cash', bank: 'Bank Transfer', jazzcash: 'JazzCash', easypaisa: 'EasyPaisa', card: 'Card', qist: 'Qist / Udhar' };
    const categories = ['Kiraya','Chai','Petrol','Mechanic','Other'];
    const pageNames = {
    dashboard:'Dashboard', 'daily-report':'Daily Report', 'day-closings':'Day Closing History',
    purchase:'Purchase', stock:'Stock', 'bike-expenses':'Bike Expenses',
    sell:'Sell Bike', sold:'Sold Bikes', customers:'Customers',
    suppliers:'Suppliers', 'supplier-ledger':'Supplier Payables', 'supplier-payments':'Supplier Payments',
    'spare-parts':'Spare Parts', 'part-sales':'Parts Sales',
    workshop:'Workshop', 'workshop-new':'New Job', 'workshop-history':'Repair History',
    'job-parts':'Job Parts', 'workshop-payments':'Workshop Payments', 'workshop-cancellations':'Workshop Cancellations',
    'part-returns':'Returned Parts', mechanics:'Mechanic Ledger', 'workshop-ledger':'Workshop Ledger',
    'commission-payments':'Commission Payments', qist:'Qist / Udhar', 'qist-dues':'Paise Lene Wale',
    'qist-payments':'Qist Payments', expenses:'Expenses', profit:'Profit',
    cashbook:'Cash / Bank Ledger', 'cash-openings':'Account Openings',
    bank:'Bank', 'general-ledger':'General Ledger', payment:'Payments', purchases:'Purchases',
    'trial-balance':'Trial Balance', reports:'Reports', 'account-test':'Account Test',
    staff:'Staff', settings:'Settings', users:'Users', rules:'Rules Router', capital:'Capital / Investment',
    'activity-log':'Activity Log', security:'Admin Security'
};
    
    const navigationSections = [['Dashboard','⌂',['dashboard']],
['Inventory','▦',['stock','purchase','bike-expenses']],
['Sales','⇄',['sell','sold']],
['Customers','◎',['customers']],
['Qist / Udhar','◷',['qist','qist-dues','qist-payments']],
['Spare Parts','⚙',['spare-parts','part-sales','suppliers','supplier-ledger','supplier-payments']],
['Workshop','🔧',['workshop','workshop-new','workshop-history','job-parts','workshop-payments','workshop-cancellations','part-returns']],
['Commission','◇',['mechanics','workshop-ledger','commission-payments']],
['Accounts','▤',['daily-report','day-closings','expenses','profit','cashbook','cash-openings','bank','general-ledger','payment','purchases','trial-balance','reports','account-test']],
['Settings','⚙',['settings','staff','users','rules','capital','security','activity-log']]
    ];
    const titles = { purchase: 'Purchase Bike', sell: 'Sell Bike', profit: 'Profit Report', qist: 'Qist / Udhar' };
    const esc = value => String(value ?? '').replace(/[&<>"']/g, letter =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[letter]);
    const message = value => `<span data-message>${esc(value)}</span>`;
    const cents = value => Math.round(Number(value || 0) * 100);
    const money = new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR', maximumFractionDigits: 2 });
    const format = value => value == null || value === '' ? '—' : money.format(Number(value));
    const sum = (rows, field) => rows.reduce((total, row) => total + cents(row[field]), 0) / 100;
    const signedProfit = value => `<bdi class="${value < 0 ? 'profit-loss' : value > 0 ? 'profit-gain' : 'profit-zero'}">${esc(format(value))}</bdi>`;
    const statusText = { stock: 'In stock', sold: 'Sold', paid: 'Paid', pending: 'Pending' };
    const profitSources = { bike:'Bike Sell Profit', parts:'Spare Parts Profit', labour:'Handwork / Labour Profit' };
    const profitTitles = { ...profitSources, net:'Total Net Profit', leading:'Highest Profit Source' };
    const photoPath = /^(?:https:\/\/[^\s]+|\/api\/bikes\/photos\/[0-9a-f-]{36}\.(?:jpg|png|webp))$/i;
    let data;
    let dataRevision = 0;
    let lastPage = '';
    let filterState = new Map();
    const openNavigation = new Map();
    let lastUpdated = 0;
    let viewHasDraft = false;
    const usesDailyReport = page => page === 'dashboard' || page === 'daily-report';
    const pagePermissions = {
        'daily-report':'daily','day-closings':'daily',expenses:'daily',purchase:'buy','bike-expenses':'stock',sold:'sell',
        'qist-dues':'qist','qist-payments':'qist',suppliers:'parts','spare-parts':'parts','part-sales':'parts',
        'supplier-ledger':'parts','supplier-payments':'parts',mechanics:'commission','workshop-ledger':'commission',
        'commission-payments':'commission','workshop-new':'workshop','workshop-history':'workshop',
        'job-parts':'workshop','workshop-payments':'workshop','workshop-cancellations':'workshop','part-returns':'workshop',staff:'settings'
    };
    const adminPages = ['capital','rules','cashbook','cash-openings','security','activity-log'];
    const workshopPages = {workshop:'active','workshop-new':'new','workshop-history':'history'};
    const can = key => Boolean(data?.user?.admin || (key !== 'capital' && data?.user?.permissions?.includes(key)));
    function allowedPage(page) {
        if (adminPages.includes(page)) return Boolean(data?.user?.admin);
        if (page === 'users') return can('settings') && (can('users') || can('delete'));
        return can(pagePermissions[page] || page);
    }

    async function request(path, options = {}) {
        const init = { ...options, headers: { Accept: 'application/json', ...options.headers } };
        if (init.body && !(init.body instanceof FormData)) {
            init.headers['Content-Type'] = 'application/json';
            init.body = JSON.stringify(init.body);
        }
        const response = await fetch('/api' + path, init).catch(() => {
            throw new Error('Network unavailable. Try again.');
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw Object.assign(new Error(body.error || 'The request failed.'), { status: response.status });
        return body;
    }

    function signInView() {
        window.kbNotifications?.stop();
        setDrawer(false);
        workspace.hidden = true;
        $('#signIn').hidden = false;
        $('#loginCode').hidden = true;
        $('#loginForm').elements.code.value = '';
        if (receiptDialog.open) receiptDialog.close();
        data = undefined;
        lastPage = '';
        lastUpdated = 0;
        updateRefreshLabel();
        setRefreshing(false);
        filterState = new Map();
    }

    function notice(message, error = false, target = $('#status')) {
        target.textContent = message;
        target.classList.toggle('error', error);
    }

    function updateRefreshLabel() {
        const minutes = Math.max(0, Math.floor((Date.now() - lastUpdated) / 60000));
        $('#lastUpdated').textContent = lastUpdated
            ? t('Last updated: {time}', { time:minutes ? t('{count} min ago', {count:minutes}) : t('just now') })
            : t('Never refreshed');
    }

    function setRefreshing(active) {
        refreshButton.disabled = active;
        refreshButton.setAttribute('aria-busy', String(active));
        refreshButton.setAttribute('aria-label', active ? 'Refreshing…' : 'Refresh data');
    }

    async function refresh({ render = true, announce = false, pageOpen = false } = {}) {
        const revision = ++dataRevision;
        setRefreshing(true);
        try {
            const snapshot = await request(usesDailyReport(currentPage()) ? '/state?daily=1' : '/state');
            if (revision !== dataRevision) return;
            if (JSON.stringify(data?.user) !== JSON.stringify(snapshot.user)) lastPage = '';
            data = snapshot;
            workspace.hidden = false;
            $('#signIn').hidden = true;
            window.kbNotifications?.start(data.user);
            if (render && (!viewHasDraft || (!pageOpen && !announce)) && (!pageOpen || !hasSeparateRecords(lastPage))) {
                await renderPage();
            }
            if (revision !== dataRevision) return;
            lastUpdated = Date.now();
            updateRefreshLabel();
            if (announce) {
                notice('Data refreshed.');
                window.kbNotifications?.check();
            }
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
        } finally {
            if (revision === dataRevision) setRefreshing(false);
        }
    }

    const label = (title, control) => `<label>${esc(title)}${control}</label>`;
    const input = (name, title, { type = 'text', required = false, max = 150, value = '', min = 0, extra = '' } = {}) =>
        label(title, `<input name="${name}" type="${type}" value="${esc(value)}" ${required ? 'required' : ''}
            ${type === 'number' ? `step="0.01" min="${min}" max="${max}"` : `maxlength="${max}"`} ${extra}>`);
    const amount = (name, title, { initial = '', required = false, min = 0, max = 9999999999.99 } = {}) =>
        input(name, title, { type: 'number', value: initial, required, min, max });
    const accountField = (name = 'account',title = 'Payment account') =>
        select(name,title,[['cash','Cash'],['bank','Bank'],['wallet','Mobile Wallet']],'cash','Choose an account',false,true);
    const salesmanInput = (value = '') => input('salesman','Salesman',{ value, max:100, required:true });
    function select(name, title, options, current = '', placeholder = 'Any', verbatim = false, required = false) {
        return label(title, `<select name="${name}"${required?' required':''}><option value="">${esc(placeholder)}</option>${options.map(([key, text]) =>
            `<option value="${esc(key)}"${String(key) === String(current) ? ' selected' : ''}${verbatim ? ' data-verbatim' : ''}>${esc(text)}</option>`).join('')}</select>`);
    }
    const panel = (title, body, actions = '') =>
        `<section class="panel"><div class="panel-heading"><h2>${esc(title)}</h2>${actions}</div>${body}</section>`;
    const button = (text, route, primary = false) => allowedPage(route)
        ? `<a class="button${primary ? ' primary' : ''}" href="#${route}">${esc(text)}</a>` : '';
    const heading = (page, actions = '') => `<header class="page-heading"><h1>${esc(titles[page] || pageNames[page])}</h1><div class="actions">${actions}</div></header>`;
    const formStatus = '<p class="notice wide" role="status"></p>';
    const submit = text => `<div class="actions wide"><button class="primary" type="submit">${esc(text)}</button></div>${formStatus}`;
    const columns = {
        expenses: [['Date','date'],['Category',row => message(row.type)],['Description','description'],['Amount','amount','money']],
        sold: [['Bike','bike_name'],['Model','model'],['Chassis','chassis_no'],['Customer','customer_name'],['Salesman','salesman'],['Date','date'],
            ['Payment',row => message(payment[row.payment_method])],['Sold price','sell_price','money'],['Total cost','cost_at_sale','money'],
            ['Real profit','profit','money'],['Receipt',row => `<button type="button" data-receipt="${esc(row.id)}">Receipt</button>`]],
        stock: [['Photo',row => photoPath.test(row.photo_url || '') ? `<img src="${esc(row.photo_url)}" alt="${esc(row.bike_name)}" loading="lazy">` : '—'],
            ['Bike',row => esc(row.bike_name) + operations.overallLine(row)],['Model','model'],['Chassis','chassis_no'],['Status',row => message(statusText[row.status])],
            ['Purchase','purchase_price','money'],['Repair','repair_cost','money'],['Other','other_cost','money'],
            ['Total cost','total_cost','money'],['Best Sell Price','sell_price','money'],['Expected profit',row=>signedProfit(row.expected_profit),'money'],
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
            if (target && !allowedPage(target)) return '';
            const content = `<span>${esc(title)}</span><strong>${esc(value)}</strong>`;
            return target ? `<a class="metric" href="#${target}">${content}</a>` : `<div class="metric">${content}</div>`;
        }).join('') + '</div>';
    }

    function exportLinks(section) {
        if (!can('download')) return '';
        return `<details class="download-menu"><summary>Download Report</summary><div class="actions">
            <a class="button" href="/api/export/${section}?format=pdf">PDF</a>
            <a class="button" href="/api/export/${section}?format=excel">Excel</a>
            <a class="button" href="/api/export/${section}?format=csv">CSV</a></div></details>`;
    }

    function saleTabs(page) {
        const pages = [['sell','Sell Bike'],['sold','Sold Bikes'],['qist','Qist / Udhar']];
        if (page === 'qist' || page === 'qist-dues') pages.push(['qist-dues',pageNames['qist-dues']]);
        return '<nav class="tabs" aria-label="Sales pages">' + pages.filter(([key])=>allowedPage(key)).map(
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
        const gross = data.profit?.net ?? sum(data.sold, 'profit');
        const expenses = sum(data.expenses, 'amount');
        const stock = data.bikes.filter(row => row.status === 'stock');
        const reminderThrough = new Date(Date.parse(data.today) + 7 * 86400000).toISOString().slice(0,10);
        const reminders = data.qist.filter(row => row.status === 'pending' && row.next_date <= reminderThrough);
        return `<section class="hero"><div><h1>${businessName()}</h1></div><img src="/kb.png" alt="" width="140" height="140"></section>` +
            (data.daily ? dashboardComparison() + operations.dashboardCharts() + (can('parts') ? repurchasePanel() : '') : '<p class="empty" role="status">Loading…</p>') +
            (can('qist') ? panel('Qist reminders', reminders.length ? table(reminders, [['Customer','customer_name'],['Bike','bike_name'],['Due date','next_date'],
                ['Monthly Qist','monthly_qist','money'],['Remaining','remaining','money']]) : '<p class="empty">No payments due in the next 7 days.</p>', button('View Qist','qist')) : '') +
            panel('Daily hisaab', metrics([['Net Profit',format((cents(gross) - cents(expenses)) / 100),'profit'],
                ['Total Profit',format(gross),'profit'],['Stock Bikes',String(stock.length),'stock'],['Sold Bikes',String(data.sold.length),'sold']])) +
            (can('capital') ? `<a class="metric capital-dashboard-card" href="#capital">${message('Total Investment')}<strong id="dashboardInvestment">—</strong></a>` : '');
    }

    function dashboardComparison() {
        const [yesterday,today] = data.daily.days.slice(-2);
        const percent = new Intl.NumberFormat(document.documentElement.lang, {style:'percent',maximumFractionDigits:1});
        const cards = [['Today Sale','sale','sold'],['Today Profit','profit','profit'],['Today Expense','expense','expenses']];
        return '<div class="metrics daily-comparisons">' + cards.filter(([,field])=>field!=='profit'||can('profit')).map(([label,field,route]) => {
            const difference = cents(today[field]) - cents(yesterday[field]);
            const previous = Math.abs(cents(yesterday[field]));
            const change = !difference ? '→ ' + percent.format(0)
                : (difference > 0 ? '↑ ' : '↓ ') + (previous ? percent.format(Math.abs(difference) / previous) : '—');
            const direction = difference === 0 ? 'No change' : difference > 0 ? 'Up' : 'Down';
            const beneficial = field === 'expense' ? difference < 0 : difference > 0;
            const color = !difference ? '' : beneficial ? 'profit-gain' : 'profit-loss';
            const linked=allowedPage(route);
            return `<${linked?'a':'div'} class="metric daily-comparison"${linked?` href="#${route}"`:''}>
                ${message(label)}<strong>${esc(format(today[field]))}</strong>
                <small>${message('Yesterday')} <bdi>${esc(format(yesterday[field]))}</bdi></small>
                <bdi class="${color}" aria-label="${direction}" title="${previous || !difference ? direction : 'Yesterday was zero'}">${esc(change)}</bdi></${linked?'a':'div'}>`;
        }).join('') + '</div>';
    }

    function repurchasePanel() {
        const rows = data.daily.repurchase;
        return panel('Bazaar Se Ye Lena Hai - Repurchase List', rows.length ? table(rows, [
            ['Part Name','name'],['Current Stock','quantity'],['Need Quantity','needed'],['Supplier Name','supplier'],
            ['Le Liya',row => `<label class="repurchase-check"><input type="checkbox" data-repurchase="${esc(row.id)}"
                data-quantity="${esc(row.quantity)}"><span>Le Liya</span></label>`]
        ]) : '<p class="empty">No parts on the repurchase list.</p>');
    }

    const previousDate = day => new Date(Date.parse(day)-86400000).toISOString().slice(0,10);
    const nextDate = day => new Date(Date.parse(day)+86400000).toISOString().slice(0,10);

    function dailyReportPage() {
        if (!data.daily) return heading('daily-report') + '<p class="empty" role="status">Loading…</p>';
        const {report,history} = data.daily;
        const action = report.closed_at ? '<p class="balance-paid" data-message>Day Closed</p>'
            : '<button type="button" id="dayClose" class="primary">Day Close Karo</button>';
        const values = metrics([
            ['Opening Balance',format(report.opening_balance)],['Today Sale',format(report.sale_income)],
            ['Today Qist Collected',format(report.qist_collected)],['Today Workshop Income',format(report.workshop_income)],
            ['Total Income',format(report.total_income)],['Today Expense',format(report.expense)],['Closing Balance',format(report.closing_balance)]
        ]);
        const canCloseEarlier = data.user.admin && (!history.length || history[0].date<previousDate(report.date));
        const earlier = canCloseEarlier ? '<button type="button" id="earlierClose">Close an Earlier Day</button>' : '';
        return heading('daily-report',action+earlier+exportLinks('daily')) + panel('Daily balances', `<p class="daily-report-date"><bdi>${esc(report.date)}</bdi></p>
            ${values}<p class="daily-report-note" data-message>Sale income includes Qist advances. Qist collections and workshop income use recorded payments.</p>`) +
            (can('parts') ? repurchasePanel() : '') + panel('Last 10 Day Closings', table(history,[
                ['Date','date'],['Opening Balance','opening_balance','money'],['Total Income','total_income','money'],
                ['Expense','expense','money'],['Closing Balance','closing_balance','money']
            ]));
    }

    function earlierDayClose() {
        const report = data.daily.report;
        const latest = data.daily.history[0]?.date;
        const latestAllowed = previousDate(report.date);
        const firstAllowed = latest ? nextDate(latest) : '1900-01-01';
        showDialog('Close an Earlier Day',`<form id="earlierCloseForm" class="form-grid">
            ${input('date','Date',{type:'date',required:true,value:latestAllowed,extra:`min="${firstAllowed}" max="${latestAllowed}"`})}
            <p class="wide" data-message>Choose a date after the last closing. Closing also locks earlier transactions.</p>
            ${latest ? details([['Last Closed Day',latest]]) : ''}${submit('Confirm Day Close')}</form>`);
        const form = $('#earlierCloseForm');
        saveForm(form,async fields=>{
            await request('/daily-report/close',{method:'POST',body:fields});
            receiptDialog.close();
            await refresh();
            notice('Saved.');
        });
    }

    function confirmDayClose() {
        const report = data?.daily?.report;
        if (!report || report.closed_at) return;
        showDialog('Day Close Karo', details([['Date',report.date],['Closing Balance',format(report.closing_balance)]]) +
            `<form id="closeDayForm" class="form-grid"><p class="wide daily-report-note" data-message>Closing locks this date for new transactions.</p>
                ${submit('Confirm Day Close')}</form>`);
        const form = $('#closeDayForm');
        saveForm(form, async () => {
            const closed = await request('/daily-report/close',{method:'POST',body:{date:report.date}});
            if (data?.daily?.report.date === closed.date) {
                data.daily.report = closed;
                data.daily.history = [closed,...data.daily.history.filter(row => row.date !== closed.date)].slice(0,10);
            }
            if (form.isConnected && receiptDialog.open) receiptDialog.close();
            if (currentPage() === 'daily-report') {
                await renderPage();
                await refresh();
            }
        });
    }

    function purchase() {
        return heading('purchase', button('View Stock','stock')) + panel('Bike details', `<form id="purchaseForm" class="form-grid">
            ${input('bike_name','Bike Name',{required:true})}${input('model','Model',{required:true,max:100})}
            ${input('chassis_no','Chassis No',{max:80})}${input('plate_no','Plate No',{max:40})}
            ${operations.conditionFields()}
            ${input('purchased_on','Purchase date',{type:'date',value:data.today})}
            ${label('Bike photo',`<span class="file-picker"><input name="photo" type="file" accept="image/jpeg,image/png,image/webp">
                ${message('Choose photo')}<span id="photoName" data-message>No photo chosen</span></span>`)}
            ${input('photo_url','Photo URL (optional)',{type:'url',max:2048})}
            ${amount('purchase_price','Purchase Price',{required:true})}${amount('repair_cost','Repair Cost',{initial:0})}
            ${amount('other_cost','Other Cost',{initial:0})}${amount('sell_price','Best Sell Price',{min:.01})}
            ${select('purchase_method','Purchase Payment',Object.entries(payment).filter(([key]) => key !== 'qist'),'cash')}
            <p class="calculation wide" aria-live="polite"></p>${submit('Save to Stock')}</form>`);
    }

    function sale() {
        const stock = data.bikes.filter(row => row.status === 'stock');
        const selected = stock.find(bike => String(bike.id) === (sessionStorage.getItem('kb-spa-sell-bike') || ''));
        return heading('sell',exportLinks('sold')) + saleTabs('sell') + (stock.length ? panel('Sale details', `<form id="saleForm" class="form-grid">
            ${select('bike_id','Bike',stock.map(row => [row.id,[row.bike_name,row.model,row.chassis_no].filter(Boolean).join(' · ')]),selected?.id,'Choose a bike',true)}
            <div id="saleCondition" class="wide"></div>
            ${input('customer_name','Customer name',{required:true,max:100})}${input('customer_phone','Phone',{required:true,type:'tel',max:24})}
            ${salesmanInput()}
            ${input('customer_cnic','CNIC',{max:15})}${amount('sell_price','Bike Price',{required:true,min:.01,initial:selected?.sell_price ?? ''})}
            ${select('payment_method','Payment Method',Object.entries(payment),'cash','Choose a method')}
            ${amount('interest_rate','Flat interest (%)',{initial:0,max:999.99})}
            ${amount('advance','Advance',{initial:0})}${accountField('advance_account','Advance account')}${amount('monthly_qist','Monthly Qist',{min:.01})}
            ${input('next_date','Next Date',{type:'date',extra:`min="${data.today}"`})}
            <p id="saleLoss" class="notice error wide" role="status"></p>
            <p class="calculation wide" aria-live="polite"></p>${submit('Record Sale')}</form>`) +
            panel('Find a stock bike',filterForm('sell',[['stock','In stock']])) :
            panel('No bikes in stock', button('Purchase Bike','purchase',true)));
    }

    function expensePage() {
        return heading('expenses') + panel('Add expense', `<form id="expenseForm" class="form-grid">
            ${select('type','Category',categories.map(category => [category,category]),'','Choose a category')}
            ${amount('amount','Amount',{required:true,min:.01})}${input('date','Date',{type:'date',required:true,value:data.today})}
            ${input('description','Description',{max:250})}${accountField()}${submit('Save Expense')}</form>`) +
            panel('Expense history', table(data.expenses, columns.expenses));
    }

    function paymentBalance(value) {
        if (value == null) return '—';
        const due = cents(value) > 0;
        return `<span class="${due ? 'balance-due' : 'balance-paid'}"><bdi>${esc(format(value))}</bdi>
            ${due ? '' : message('Fully Paid')}</span>`;
    }

    function qistPage(page) {
        const duesOnly = page === 'qist-dues';
        const rows = duesOnly ? data.qist.filter(row => cents(row.remaining) > 0) : data.qist;
        const plans = table(rows, [
            ['Customer name',row => `<span>${esc(row.customer_name ?? '—')}</span>${row.customer_phone
                ? `<bdi class="qist-phone">${esc(row.customer_phone)}</bdi>` : ''}`],
            ['Bike Name','bike_name'],['Total price','total','money'],['Paid','paid','money'],
            ['Remaining',row => paymentBalance(row.remaining),'money'],
            ['Next Date',row => `<bdi>${esc(row.next_date ?? '—')}</bdi>${row.next_date && row.next_date < data.today
                ? `<span class="balance-due qist-overdue">${message('Overdue')}</span>` : ''}`],
            ['Actions',row => `<div class="actions qist-actions">
                ${cents(row.remaining) > 0 && can('qist_collect') ? `<button type="button" class="primary" data-collect="${esc(row.id)}">Collect Payment</button>` : ''}
                <button type="button" data-receipt="${esc(row.sale_id)}">Receipt</button>
                <button type="button" data-qist-history="${esc(row.id)}">Payment history</button></div>`]
        ]);
        const content = duesOnly && !rows.length ? '<p class="empty">No outstanding dues.</p>' : plans;
        return heading('qist',exportLinks('qist')) + saleTabs(page) + panel(duesOnly ? pageNames[page] : 'Payment plans', content);
    }

    const jobTransitions = {
        received: ['in_progress','diagnosing','cancelled'], diagnosing: ['waiting_parts','in_progress','cancelled'],
        waiting_parts: ['in_progress','cancelled'], in_progress: ['completed','waiting_parts','cancelled'],
        completed: ['delivered'], delivered: [], cancelled: []
    };
    const completedJob = job => ['completed','delivered','cancelled'].includes(job.status);
    const jobLabel = status => ({ completed:'Ready', in_progress:'In Progress' })[status] ||
        status.replaceAll('_',' ').replace(/^./, c => c.toUpperCase());
    const jobOptions = statuses => statuses.map(status => [status,jobLabel(status)]);
    const jobBalance = job => job.total_bill == null ? null : (cents(job.total_bill) - cents(job.paid_amount)) / 100;
    let workshopJobs = [];
    let workshopQuery = '';
    let workshopTab = 'active';

    function billFields(job = {}) {
        return amount('parts_cost','Parts Cost',{initial:job.parts_cost ?? ''}) +
            amount('labour_charge','Labour Charge',{initial:job.labour_charge ?? ''}) +
            amount('labour_cost','Labour cost',{initial:job.labour_cost ?? ''});
    }

    function workshopCard(job) {
        const balance = job.status==='cancelled' ? 0 : jobBalance(job);
        const field = (title, value, extra = '') => `<div ${extra}><dt>${title}</dt><dd>${value}</dd></div>`;
        return `<article class="workshop-card">
            <header><div><h3>${esc(job.bike_name)}</h3>${job.registration_number ? `<bdi>${esc(job.registration_number)}</bdi>` : ''}</div>
                <span class="workshop-status">${message(jobLabel(job.status))}</span></header>
            <div class="workshop-contact">
                <p>${esc(job.customer_name)}${job.customer_phone ? ` · <bdi>${esc(job.customer_phone)}</bdi>` : ''}</p>
                ${job.mechanic ? `<p>${message('Staff name')} <bdi>${esc(job.mechanic)}</bdi></p>` : ''}
            </div>
            <dl class="workshop-amounts">
                ${field('Parts Cost',esc(format(job.parts_cost)))}
                ${field('Labour Charge',esc(format(job.labour_charge)))}
                ${field('Total Bill',esc(format(job.total_bill)),'class="workshop-card-total"')}
                ${field('Paid',esc(format(job.paid_amount)))}
                ${field('Remaining',paymentBalance(balance))}
            </dl>
            <div class="actions">
                <button type="button" data-job="${esc(job.id)}">Details</button>
                ${balance > 0 ? `<button type="button" class="primary" data-job-payment="${esc(job.id)}">Collect Payment</button>` : ''}
            </div>
        </article>`;
    }

    async function showWorkshop({ reload = true } = {}) {
        view.innerHTML = heading('workshop',button('Mechanic Ledger','mechanics')+button('Workshop Ledger','workshop-ledger')+exportLinks('workshop')) + `<section class="panel">
            <nav id="workshopTabs" class="tabs" aria-label="Workshop pages">
                <button type="button" data-workshop-tab="active">Job Cards</button>
                <button type="button" data-workshop-tab="new">New Job</button>
                <button type="button" data-workshop-tab="history">Repair History</button>
            </nav><div id="workshopContent"></div></section>`;
        const content = $('#workshopContent');
        let loaded = !reload;
        let pending;

        function renderList() {
            content.innerHTML = `<div class="workshop-search">${input('workshop-search','Search by Bike Number or Mobile Number',{
                type:'search',value:workshopQuery,extra:'placeholder="Enter a bike or mobile number"'
            })}</div><div id="workshopRecords" aria-live="polite"></div>`;
            const search = content.querySelector('input[type="search"]');
            const target = $('#workshopRecords');
            const plateKey = value => lower(value).replace(/[^\p{L}\p{N}]/gu,'');
            const phoneKey = value => String(value ?? '').replace(/\D/g,'');
            const jobs = workshopJobs.filter(job => completedJob(job) === (workshopTab === 'history'));
            function update() {
                workshopQuery = search.value;
                const plate = plateKey(workshopQuery);
                const phone = /^[\d+().\s-]+$/.test(workshopQuery) ? phoneKey(workshopQuery) : '';
                const results = jobs.filter(job => (!plate && !phone) ||
                    (plate && plateKey(job.registration_number).includes(plate)) ||
                    (phone && phoneKey(job.customer_phone).includes(phone)));
                target.innerHTML = results.length
                    ? '<div class="workshop-cards">' + results.map(workshopCard).join('') + '</div>'
                    : '<p class="empty">No matching records.</p>';
            }
            search.addEventListener('input',update);
            update();
        }

        async function renderTab() {
            viewHasDraft = false;
            view.querySelectorAll('[data-workshop-tab]').forEach(button => {
                button.setAttribute('aria-current', button.dataset.workshopTab === workshopTab ? 'page' : 'false');
            });
            if (workshopTab === 'new') {
                content.innerHTML = '<p class="empty" role="status">Loading…</p>';
                const options = await request('/commission/options');
                if (!content.isConnected || workshopTab !== 'new') return;
                if (!options.mechanics.length) {
                    content.innerHTML = '<p class="empty">Add a mechanic before creating a job.</p>'+button('Mechanic Ledger','mechanics');
                    return;
                }
                content.innerHTML = `<form id="workshopForm" class="form-grid">
                    ${input('customer_name','Customer name',{required:true,max:100})}
                    ${input('customer_phone','Phone',{type:'tel',max:24,required:true})}
                    ${input('registration_number','Bike Number',{max:40})}
                    ${input('bike_name','Bike Model',{required:true})}
                    ${operations.partnerOptions(options)}
                    ${select('status','Status',jobOptions(can('workshop_status')?['in_progress','completed','delivered']:['in_progress']),
                        'in_progress','Choose a status')}
                    <div class="wide">${label('Work Description','<textarea name="complaints" maxlength="2000" required></textarea>')}</div>
                    ${billFields()}
                    ${label('Mileage (km)','<input name="mileage" type="number" min="0" max="2147483647" step="1">')}
                    ${input('oil_change_on','Last oil change',{type:'date'})}
                    ${input('next_oil_change_on','Next oil change',{type:'date'})}
                    ${amount('estimated_cost','Estimated cost')}${submit('Create Job Card')}</form>`;
                const form = $('#workshopForm');
                form.elements.status.required = true;
                form.elements.mechanic_id.required = true;
                saveForm(form, async (fields, key) => {
                    const job = await request('/workshop', {method:'POST',body:{...fields,request_key:key}});
                    if (!form.isConnected) return;
                    workshopTab = completedJob(job) ? 'history' : 'active';
                    workshopQuery = '';
                    workshopJobs = [job, ...workshopJobs.filter(row => String(row.id) !== String(job.id))];
                    if (!loaded) pending = null;
                    await renderTab();
                });
                return;
            }
            if (!loaded) {
                content.innerHTML = '<p class="empty" role="status">Loading…</p>';
                try {
                    pending ||= request('/workshop');
                    const jobs = await pending;
                    if (!content.isConnected) return;
                    workshopJobs = jobs;
                    loaded = true;
                } catch (error) {
                    pending = null;
                    if (!content.isConnected || workshopTab === 'new') return;
                    content.textContent = '';
                    throw error;
                }
            }
            if (workshopTab !== 'new') renderList();
        }

        $('#workshopTabs').addEventListener('click', event => {
            const chosen = event.target.closest('[data-workshop-tab]');
            if (!chosen || chosen.dataset.workshopTab === workshopTab) return;
            workshopTab = chosen.dataset.workshopTab;
            renderTab().catch(showPageError);
        });
        await renderTab();
    }

    async function saveWorkshopView(job, form, followStatus = false) {
        workshopJobs = workshopJobs.map(row => String(row.id) === String(job.id) ? job : row);
        if (form.isConnected && receiptDialog.open) receiptDialog.close();
        if (!Object.hasOwn(workshopPages,currentPage()) || workshopTab === 'new' || !data) return;
        if (followStatus) workshopTab = completedJob(job) ? 'history' : 'active';
        await showWorkshop({ reload:false });
        notice('Saved.');
    }

    function workshopDetails(id) {
        const job = workshopJobs.find(item => String(item.id) === id);
        if (!job) return;
        const options = (jobTransitions[job.status] || []).filter(status=>status!=='cancelled');
        const cancellable = !job.cancelled_on && !['completed','delivered'].includes(job.status) && can('workshop_status');
        const isCancelled = job.status==='cancelled';
        showDialog('Workshop job #' + job.id, details([
            ['Customer name',job.customer_name],['Phone',job.customer_phone],['Bike Model',job.bike_name],
            ['Bike Number',job.registration_number],['Staff name',job.mechanic],['Status',jobLabel(job.status),true],
            ['Work Description',job.complaints],['Job date',job.created_on],['Mileage',job.mileage],
            ['Last oil change',job.oil_change_on],['Next oil change',job.next_oil_change_on],['Estimated cost',format(job.estimated_cost)],
            ['Total Bill',format(job.total_bill)],['Paid',format(job.paid_amount)],['Remaining',isCancelled ? 0 : jobBalance(job),paymentBalance]
        ]) + '<div id="jobPartsView"></div>' + (isCancelled ? '' : `<form id="labourForm" class="form-grid">${billFields(job)}${submit('Save Bill')}</form>`) +
            (cancellable ? `<div class="actions"><button id="cancelWorkshop" type="button">${isCancelled ? 'Record Cancellation Adjustment' : 'Cancel Job'}</button></div>` : '') +
            (options.length && can('workshop_status') ? `<form id="jobStatusForm" class="form-grid">
                ${select('status','Next status',jobOptions(options),'','Choose a status')}${submit('Update status')}</form>` : ''));
        operations.workshopExtras(job,saveWorkshopView).catch(showPageError);
        $('#cancelWorkshop')?.addEventListener('click',()=>businessPages.cancelJob(job,saveWorkshopView).catch(showPageError));
        const billForm = $('#labourForm');
        if (billForm) saveForm(billForm, async fields => {
            const updated = await request('/workshop/' + id + '/bill', {method:'PATCH',body:fields});
            await saveWorkshopView(updated,billForm);
        });
        const statusForm = $('#jobStatusForm');
        if (!statusForm) return;
        statusForm.elements.status.required = true;
        saveForm(statusForm, async fields => {
            const updated = await request('/workshop/' + id + '/status', {method:'POST',body:{expected:job.status,status:fields.status}});
            if (updated.status === 'completed') window.kbNotifications?.check();
            await saveWorkshopView(updated,statusForm,true);
        });
    }

    function collectWorkshopPayment(id) {
        const job = workshopJobs.find(item => String(item.id) === id);
        if (!job) return;
        const balance = jobBalance(job);
        if (!(balance > 0)) return;
        showDialog('Collect Payment', details([
            ['Customer name',job.customer_name],['Bike Model',job.bike_name],
            ['Remaining',balance,paymentBalance]
        ]) + `<form id="workshopPaymentForm" class="form-grid">
            ${amount('amount','Amount collected',{required:true,min:.01,max:balance})}
            ${paymentPreview()}${accountField()}${submit('Save Payment')}</form>`);
        const form = $('#workshopPaymentForm');
        bindPaymentPreview(form,balance);
        saveForm(form, async (fields, key) => {
            const result = await request('/workshop/' + id + '/payments', {
                method:'POST',body:{...fields,amount:Number(fields.amount),request_key:key}
            });
            await saveWorkshopView(result.job,form);
        });
    }

    const roleLabels = { manager:'Manager', sales:'Sales', mechanic:'Mechanic', helper:'Helper' };
    const staffStatuses = { active:'Active', inactive:'Inactive' };
    const directoryPages = {
        suppliers: {
            add:'Add supplier', edit:'Edit supplier', save:'Save supplier', list:'Supplier records',
            columns:[['Supplier name','name'],['Company','company'],['Phone','phone'],['Address','address']],
            fields:row => input('name','Supplier name',{value:row.name,max:100,required:true}) +
                input('company','Company',{value:row.company,max:100}) +
                input('phone','Phone',{value:row.phone,type:'tel',max:24}) +
                input('address','Address',{value:row.address,max:250})
        },
        'spare-parts': {
            add:'Add spare part', edit:'Edit spare part', save:'Save spare part', list:'Parts stock',
            columns:[['Part name','name'],['SKU','sku'],['Supplier','supplier_name'],['Quantity','quantity'],
                ['Unit cost','unit_cost','money'],['Sell price','sell_price','money']],
            fields:(row, suppliers) => input('name','Part name',{value:row.name,max:100,required:true}) +
                input('sku','SKU',{value:row.sku,max:60,required:true}) +
                select('supplier_id','Supplier',suppliers.map(supplier => [supplier.id,supplier.name]),row.supplier_id,'No supplier',true) +
                label('Quantity',`<input type="number" name="quantity" value="${esc(row.quantity ?? 0)}" min="0" max="2147483647" step="1" required>`) +
                amount('unit_cost','Unit cost',{initial:row.unit_cost ?? 0,required:true}) +
                amount('sell_price','Sell price',{initial:row.sell_price ?? 0,required:true})
        },
        staff: {
            add:'Add staff member', edit:'Edit staff member', save:'Save staff member', list:'Staff directory',
            columns:[['Name','name'],['Role',row => message(roleLabels[row.role])],
                ['Phone','phone'],['Status',row => message(staffStatuses[row.status])]],
            fields:row => input('name','Staff name',{value:row.name,max:100,required:true}) +
                input('phone','Phone',{value:row.phone,type:'tel',max:24}) +
                select('role','Role',Object.entries(roleLabels),row.role,'Choose a role') +
                select('status','Status',Object.entries(staffStatuses),row.status ?? 'active','Choose a status')
        }
    };

    function hasSeparateRecords(page) {
        return Object.hasOwn(workshopPages,page) || businessPages.hasPage(page) || ['mechanics','workshop-ledger','users','rules','capital'].includes(page) || Object.hasOwn(directoryPages, page);
    }

    async function showDirectory(page) {
        const config = directoryPages[page];
        view.innerHTML = heading(page) + '<p class="empty" id="directoryLoading" role="status">Loading…</p>';
        const loading = $('#directoryLoading');
        const path = '/' + page;
        const [records, suppliers] = await Promise.all([
            request(path), page === 'spare-parts' ? request('/suppliers') : []
        ]);
        if (!loading.isConnected) return;
        const supplierNames = new Map(suppliers.map(row => [String(row.id),row.name]));
        const formContent = (row, title) => config.fields(row, suppliers) + submit(title);
        view.innerHTML = heading(page) + panel(config.add, `<form class="form-grid" id="directoryForm">${formContent({},config.save)}</form>`) +
            panel(config.list,'<div id="directoryRecords"></div>');
        const content = $('#directoryRecords');
        let rows = records;
        const isParts = page === 'spare-parts';

        function displayRows() {
            content.innerHTML = table(rows.map(row => ({...row, supplier_name:supplierNames.get(String(row.supplier_id))})),
                [...config.columns, ['Actions',row => `<div class="actions"><button type="button" data-edit-record="${esc(row.id)}">Edit</button>
                    ${isParts && Number(row.quantity) > 0 ? `<button type="button" data-sell-part="${esc(row.id)}">Sell part</button>` : ''}</div>`]]);
        }

        function replaceRow(updated) {
            rows = rows.map(record => String(record.id) === String(updated.id) ? updated : record);
            displayRows();
            receiptDialog.close();
        }

        function sellPart(row) {
            showDialog('Record spare part sale', details([['Part name',row.name],['Available stock',row.quantity]]) +
                `<form id="partSaleForm" class="form-grid">
                ${label('Quantity',`<input type="number" name="quantity" value="1" min="1" max="${esc(row.quantity)}" step="1" required>`)}
                ${amount('unit_price','Unit sale price',{initial:Number(row.sell_price) > 0 ? row.sell_price : '',min:.01,required:true})}
                ${salesmanInput()}${accountField()}
                ${submit('Record Sale')}</form>`);
            saveForm($('#partSaleForm'), async (fields, key) => {
                const { part } = await request(path + '/' + row.id + '/sales', {
                    method:'POST', body:{...fields, request_key:key}
                });
                window.kbNotifications?.check();
                if (content.isConnected) replaceRow(part);
                notice('Saved.');
            });
        }

        function bindRecord(form, row) {
            for (const name of ['role','status']) if (form.elements[name]) form.elements[name].required = true;
            saveForm(form, async (fields, key) => {
                if (row && isParts) fields.expected_quantity = row.quantity;
                const updated = await request(row ? path + '/' + row.id : path, {
                    method:row ? 'PATCH' : 'POST', body:{...fields, request_key:key}
                });
                if (isParts && Number(row?.quantity) !== Number(updated.quantity)) window.kbNotifications?.check();
                if (!content.isConnected) return;
                if (row) replaceRow(updated);
                else {
                    rows = [updated, ...rows.filter(record => String(record.id) !== String(updated.id))];
                    form.reset();
                    viewHasDraft = false;
                    displayRows();
                }
                notice('Saved.');
            });
        }

        content.addEventListener('click', event => {
            const sale = event.target.closest('[data-sell-part]');
            const id = sale?.dataset.sellPart || event.target.closest('[data-edit-record]')?.dataset.editRecord;
            const row = rows.find(record => String(record.id) === id);
            if (!row) return;
            if (sale) return sellPart(row);
            showDialog(config.edit, `<form class="form-grid" id="editRecordForm">${formContent(row,'Save changes')}</form>`);
            bindRecord($('#editRecordForm'),row);
        });
        bindRecord($('#directoryForm'));
        displayRows();
    }

    function businessName() {
        const name = data.settings?.business_name;
        return name && name !== 'Khan Brothers' ? `<span data-verbatim>${esc(name)}</span>` : 'Khan Brothers';
    }

    function showSettings() {
        const settings = data.settings || {};
        view.innerHTML = heading('settings',operations.settingsLinks()) + panel('Business profile', `<form id="settingsForm" class="form-grid">
            ${input('business_name','Business name',{value:settings.business_name || 'Khan Brothers',max:100,required:true})}
            ${input('phone','Phone',{value:settings.phone,type:'tel',max:24})}
            ${input('address','Address',{value:settings.address,max:250})}
            ${submit('Save settings')}</form>`);
        saveForm($('#settingsForm'), async fields => {
            const updated = await request('/settings',{method:'PATCH',body:fields});
            data.settings = updated;
            viewHasDraft = false;
            notice('Saved.');
        });
    }

    function currentPage() {
        const hash = location.hash.slice(1);
        if (hash === 'buy') return 'purchase';
        return Object.hasOwn(pageNames, hash) ? hash : 'dashboard';
    }

    function showPageError(error) {
        if (error.status === 401) signInView();
        else notice(error.message,true);
    }

    function renderNavigation(page) {
        const navigation = $('#navigation');
        const link = (key,icon = '') => {
            const name = key==='purchase' ? 'Buy' : key==='workshop' ? 'Job Cards' : key==='settings' ? 'Business Settings' : pageNames[key];
            return `<a href="#${key}" ${key===page ? 'aria-current="page"' : ''}>${icon ? `<span aria-hidden="true">${icon}</span>` : ''}${esc(name)}</a>`;
        };
        navigation.innerHTML = navigationSections.map(([title,icon,pages]) => {
            const visible = pages.filter(allowedPage);
            if (!visible.length) return '';
            if (pages.length===1) return link(visible[0],icon);
            const active = visible.includes(page);
            return `<details class="inventory-menu" data-nav-section="${esc(title)}" ${active || openNavigation.get(title) ? 'open' : ''}>
                <summary><span aria-hidden="true">${icon}</span>${esc(title)}</summary>
                <div class="inventory-submenu">${visible.map(key=>link(key)).join('')}</div>
            </details>`;
        }).join('');
        navigation.querySelectorAll('[data-nav-section]').forEach(group=>group.addEventListener('toggle',()=>{
            if (group.isConnected) openNavigation.set(group.dataset.navSection,group.open);
        }));
    }

    async function renderPage() {
        if (!data) return;
        const page = currentPage();
        if (page !== lastPage) {
            if (lastPage) window.showKBLoader?.();
            lastPage = page;
            $('#breadcrumb').textContent = titles[page] || pageNames[page];
            renderNavigation(page);
        }
        viewHasDraft = false;
        if (!allowedPage(page)) {
            view.innerHTML = heading(page) + '<p class="notice error" role="status">Aapko iski permission nahi hai</p>';
            return;
        }
        if (page === 'dashboard') { view.innerHTML = dashboard(); operations.bindDashboardCharts(); }
        else if (page === 'daily-report') view.innerHTML = dailyReportPage();
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
        else if (page === 'qist' || page === 'qist-dues') view.innerHTML = qistPage(page);
        else if (page === 'profit') view.innerHTML = profitPage();
        else if (Object.hasOwn(workshopPages,page)) {
            workshopTab = workshopPages[page];
            await showWorkshop();
        }
        else if (businessPages.hasPage(page)) await businessPages.open(page);
        else if (page === 'mechanics' || page === 'workshop-ledger') await operations.openLedger(page);
        else if (page === 'users') await operations.openUsers();
        else if (page === 'rules') await operations.openRules();
        else if (page === 'capital') await operations.openCapital();
        else if (Object.hasOwn(directoryPages, page)) await showDirectory(page);
        else if (page === 'settings') showSettings();
        else renderRecords(page);
    }

    function renderRecords(page) {
        const paidStatuses = [['paid','Paid'],['pending','Balance due']];
        const sold = data.sold.map(row => ({ ...row, filter_status: Number(row.amount_due) > 0 ? 'pending' : 'paid' }));
        if (page === 'stock') {
            const stock = data.bikes.filter(row => row.status === 'stock');
            view.innerHTML = heading('stock',button('Purchase Bike','purchase',true)) +
                metrics([['Total Stock Bikes',String(stock.length)],...(can('capital')?[['Total Capital',format(sum(stock,'total_cost'))]]:[]),
                    ...(can('profit')?[['Expected Profit',format(sum(stock,'expected_profit'))]]:[])]) +
                panel('Inventory',filterForm(page,[['stock','In stock'],['sold','Sold']]),exportLinks('stock'));
            filterRecords(page, filters => table(data.bikes.filter(row => (filters.status || 'stock') === row.status &&
                matches({ ...row, filter_status: row.status }, filters)),columns.stock.filter(([title])=>title!=='Expected profit'||can('profit'))));
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
            view.innerHTML = heading(page) + saleTabs('sold') + panel('Sold motorcycles',filterForm(page,paidStatuses),exportLinks(page));
            filterRecords(page, filters => table(sold.filter(row => matches(row, filters)),columns.sold));
        }
    }

    function profitPage() {
        const profit = data.profit;
        if (!profit) return heading('profit') + '<p class="notice error" role="status">Profit data is unavailable.</p>';
        const box = (source, content) => `<button type="button" class="metric profit-card" data-profit-source="${source}" aria-haspopup="dialog">
            <span>${esc(profitTitles[source])}</span><strong>${content}</strong><span class="profit-card-arrow" aria-hidden="true">›</span></button>`;
        const leading = profit.leading.length ? profit.leading.map(source => message(profitSources[source])).join(' · ')
            : message('No profitable source');
        const soldTable = table(data.sold, [
            ['Bike Name',row => `<button type="button" class="profit-record-link" data-profit-bike="${esc(row.id)}" data-verbatim>${esc(row.bike_name)}</button>`],
            ['Buy Price','purchase_price','money'],['Sell Price','sell_price','money'],
            ['Profit',row => signedProfit(row.profit),'money']
        ]);
        return heading('profit',exportLinks('profit')) +
            '<div class="metrics profit-sources">' + Object.keys(profitSources).map(key => box(key,signedProfit(profit[key]))).join('') + '</div>' +
            '<div class="metrics profit-totals">' + box('net',signedProfit(profit.net)) + box('leading',leading) + '</div>' +
            panel('Sold Bikes', '<div class="profit-sold">' + soldTable + '</div>' + (data.sold.length ?
                '<p class="profit-note" data-message>Bike profit includes repair and other purchase costs.</p>' : ''));
    }

    function profitPersonTotals(entries) {
        const people = new Map();
        for (const entry of entries) {
            const key = entry.person?.toLocaleLowerCase().replace(/\s+/g, ' ').trim() || '';
            if (!people.has(key)) people.set(key,{person:entry.person, count:0, revenue:0, cost:0, profit:0});
            const group = people.get(key);
            group.count++;
            for (const field of ['revenue','cost','profit']) group[field] += cents(entry[field]);
        }
        return [...people.values()].sort((a,b) => b.profit - a.profit);
    }

    async function profitBreakdown(source) {
        if (!Object.hasOwn(profitTitles, source)) return;
        const title = profitTitles[source];
        showDialog(title,'<p id="profitLoading" class="empty" role="status">Loading…</p>');
        const loading = $('#profitLoading');
        try {
            const all = await request('/profit/entries');
            if (!loading.isConnected || !receiptDialog.open) return;
            const totals = Object.fromEntries(Object.keys(profitSources).map(key => [key,0]));
            for (const entry of all) totals[entry.source] += cents(entry.profit);
            const highest = Math.max(...Object.values(totals));
            const leaders = Object.keys(totals).filter(key => highest > 0 && totals[key] === highest);
            const combined = ['net','leading'].includes(source);
            const entries = all.filter(entry => source === 'net' || entry.source === source ||
                (source === 'leading' && leaders.includes(entry.source)));
            const entryKey = row => row.source + ':' + row.id;
            const entriesByKey = new Map(entries.map(row => [entryKey(row),row]));
            const personTitle = combined ? 'Salesman / Mechanic' : source === 'labour' ? 'Mechanic' : 'Salesman';
            const personCell = row => row.person ? esc(row.person) : message('Not recorded');

            function render() {
                const people = profitPersonTotals(entries);
                const leading = source === 'leading'
                    ? (leaders.length ? leaders.map(key => message(profitSources[key])).join(' · ') : message('No profitable source'))
                    : '';
                const summary = people.length ? table(people, [
                    [personTitle,personCell],['Transactions','count'],
                    ['Total Amount',row => esc(format(row.revenue / 100)),'money'],
                    ['Total cost',row => esc(format(row.cost / 100)),'money'],
                    ['Profit',row => signedProfit(row.profit / 100),'money']
                ]) : '';
                const records = table(entries, [
                    ['Item',row => `<button class="profit-record-link" type="button" data-profit-entry="${esc(entryKey(row))}"
                        data-verbatim>${esc(row.item)}</button>`],
                    ...(combined ? [['Source',row => message(profitSources[row.source])]] : []),
                    [source === 'labour' ? 'Job date' : 'Date',row => combined && row.source === 'labour'
                        ? esc(row.date) + ' · ' + message('Job date') : esc(row.date)],
                    [personTitle,personCell],['Amount','revenue','money'],['Total cost','cost','money'],
                    ['Profit',row => signedProfit(row.profit),'money']
                ]);
                showDialog(title,`<div class="profit-breakdown">
                    ${leading ? `<p class="profit-breakdown-leading">${leading}</p>` : ''}
                    ${summary ? `<section><h3 data-message>Profit by person</h3>${summary}</section>` : ''}
                    <section><h3 data-message>Transactions</h3>${records}</section></div>`);
                const list = $('.profit-breakdown');
                list.addEventListener('click', event => {
                    const button = event.target.closest('[data-profit-entry]');
                    const entry = entriesByKey.get(button?.dataset.profitEntry);
                    if (entry) profitEntry(entry,render);
                });
                receiptDialog.scrollTop = 0;
            }
            render();
        } catch (error) {
            if (error.status === 401) signInView();
            else if (loading.isConnected) notice(error.message,true,loading);
        }
    }

    function soldBikeProfit(id) {
        const row = data.sold.find(record => String(record.id) === id);
        if (!row) return;
        profitEntry({ ...row, source:'bike', item:row.bike_name, person:row.salesman, customer:row.customer_name,
            revenue:row.sell_price, cost:row.cost_at_sale });
    }

    function profitEntry(entry, back) {
        const labour = entry.source === 'labour';
        const parts = entry.source === 'parts';
        const editable = !labour && Number(entry.id)>0 && (parts ? can('parts') : can('sell'));
        const knownDetails = labour ? []
            : parts ? [['SKU',entry.sku],['Quantity',entry.quantity],['Unit cost',format(entry.unit_cost)],['Unit sale price',format(entry.unit_price)]]
                : [['Chassis',entry.chassis_no],['Buy Price',format(entry.purchase_price)],['Repair Cost',format(entry.repair_cost)],
                    ['Other Cost',format(entry.other_cost)]];
        showDialog(entry.item, details([
            [labour ? 'Job date' : 'Date',entry.date], [labour ? 'Mechanic' : 'Salesman',entry.person || 'Not recorded',!entry.person],
            ...(!parts ? [['Customer',entry.customer]] : []),...knownDetails,
            [labour ? 'Labour charge' : parts ? 'Total Amount' : 'Sell Price',format(entry.revenue)],
            [labour ? 'Labour cost' : 'Total cost',format(entry.cost)],['Profit',entry.profit,signedProfit]
        ]) + (editable ? `<form id="profitSalesmanForm" class="form-grid">${salesmanInput(entry.person || '')}${submit('Save salesman')}</form>` : '') +
            (back ? '<button type="button" id="profitBack">Back to breakdown</button>' : ''),true);
        if (back) $('#profitBack').addEventListener('click',back);
        receiptDialog.scrollTop = 0;
        if (!editable) return;
        const form = $('#profitSalesmanForm');
        saveForm(form, async fields => {
            const endpoint = (parts ? '/spare-parts/sales/' : '/sales/') + entry.id + '/salesman';
            const { salesman } = await request(endpoint,{method:'PATCH',body:fields});
            entry.person = salesman;
            if (!parts && data) {
                const row = data.sold.find(record => String(record.id) === String(entry.id));
                if (row) row.salesman = salesman;
            }
            if (!form.isConnected || !receiptDialog.open) return;
            profitEntry(entry,back);
            notice('Saved.',false,$('#profitSalesmanForm .notice'));
        });
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
        operations.bindConditions(form);
        form.elements.photo.addEventListener('change', () => {
            const file = form.elements.photo.files[0];
            const name = $('#photoName');
            name.toggleAttribute('data-verbatim', Boolean(file));
            name.textContent = file?.name || 'No photo chosen';
        });
        const update = () => {
            const total = ['purchase_price','repair_cost','other_cost'].reduce((cost,key) => cost + cents(form.elements[key].value),0);
            const price = form.elements.sell_price.value;
            form.querySelector('.calculation').innerHTML = message('Total Cost') + ' ' + esc(format(total / 100)) +
                ' · ' + message('Expected Profit') + ' ' + esc(price ? format((cents(price) - total) / 100) : '—');
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
            window.kbNotifications?.check();
            await refresh({ render:false });
            location.hash = 'stock';
        });
    }

    function bindSale() {
        const form = $('#saleForm');
        const selectBike = form.elements.bike_id;
        selectBike.required = true;
        form.elements.payment_method.required = true;
        const selected = () => data.bikes.find(row => String(row.id) === selectBike.value);
        const update = () => {
            const price = form.elements.sell_price.value;
            form.querySelector('#saleLoss').textContent = price && selected() && cents(price)<cents(selected().total_cost)
                ? 'Is price me nuksan ho raha hai!' : '';
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
            remaining.innerHTML = message('Interest') + ' ' + esc(format(interest / 100)) +
                ' · ' + message('Total payable') + ' ' + esc(format((base + interest) / 100)) +
                ' · ' + message('Remaining') + ' ' + esc(format(balance / 100)) +
                (count ? ' · ' + count + ' ' + message('qists') + ' · ' + message('Last Qist') + ' ' +
                    esc(format((balance - (count - 1) * monthly) / 100)) : '');
        };
        const condition = () => operations.showSaleCondition($('#saleCondition'),selected(),condition);
        selectBike.addEventListener('change', () => {
            form.elements.sell_price.value = selected()?.sell_price ?? '';
            condition();
            update();
        });
        form.addEventListener('input', update);
        form.addEventListener('change', update);
        condition();
        update();
        saveForm(form, async (fields, key) => {
            const result = await request('/sales', { method:'POST', body:{ ...fields, request_key:key } });
            window.kbNotifications?.check();
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

    function showDialog(title, body, verbatim = false) {
        const heading = $('#receiptTitle');
        heading.toggleAttribute('data-verbatim',verbatim);
        heading.textContent = title;
        $('#receiptBody').innerHTML = body;
        if (!receiptDialog.open) receiptDialog.showModal();
    }

    const details = entries => '<dl class="receipt-data">' + entries.map(([label, value, display]) =>
        `<div><dt>${esc(label)}</dt><dd>${
            typeof display === 'function' ? display(value) : display ? message(value) : esc(value ?? '—')
        }</dd></div>`).join('') + '</dl>';

    function receipt(id) {
        const row = data.sold.find(record => String(record.id) === String(id));
        if (!row) return;
        const plan = data.qist.find(record => String(record.sale_id) === String(row.id));
        const fields = [
            ['Receipt','KB-' + row.id],['Date',row.date],['Bike',[row.bike_name,row.model].filter(Boolean).join(' · ')],
            ['Chassis',row.chassis_no],['Plate',row.plate_no],['Customer',row.customer_name],['Phone',row.customer_phone],
            ['CNIC',row.customer_cnic],['Payment',payment[row.payment_method],true],['Bike price',format(row.bike_price)],
            ...(plan ? [['Interest',format(row.interest_amount) + ' (' + Number(row.interest_rate) + '%)'],['Advance',format(plan.advance)],
                ['Monthly Qist',format(plan.monthly_qist)],['Next date',plan.next_date],['Remaining',format(plan.remaining)]] : []),
            ['Total price',format(row.sell_price)]
        ];
        const { business_name:name, phone, address } = data.settings || {};
        const share = [name && name !== 'Khan Brothers' ? name : t('Khan Brothers'), phone, address,
            ...fields.filter(([label]) => label !== 'CNIC').map(([label,value,translate]) =>
                t(label) + ' ' + (value == null ? '—' : translate ? t(value) : value))].filter(Boolean).join('\n');
        const contact = [phone,address].filter(Boolean).map(esc).join(' · ');
        showDialog('Sale receipt', `<div class="receipt-brand"><img src="/kb.png" alt="" width="46" height="46"><h2>${businessName()}</h2></div>
            ${contact ? `<p class="receipt-contact">${contact}</p>` : ''}${details(fields)}<div class="actions"><button type="button" data-print>Print</button>
            <a class="button" href="https://wa.me/?text=${esc(encodeURIComponent(share))}" target="_blank" rel="noopener noreferrer">WhatsApp Share</a></div>`);
    }

    function paymentPreview(id = 'workshopRemainingPreview') {
        return `<p class="calculation wide payment-preview" aria-live="polite">${message('Remaining after payment')}
            <strong id="${id}"></strong></p>`;
    }

    function bindPaymentPreview(form, balance) {
        const field = form.elements.amount;
        const preview = form.querySelector('.payment-preview strong');
        const update = () => {
            const paid = field.validity.valid ? cents(field.valueAsNumber) : 0;
            preview.innerHTML = paymentBalance((cents(balance) - paid) / 100);
        };
        field.addEventListener('input',update);
        update();
    }

    function collect(id) {
        const plan = data.qist.find(row => String(row.id) === id);
        if (!plan || cents(plan.remaining) <= 0) return;
        showDialog('Collect Payment', details([
            ['Customer name',plan.customer_name],['Phone',plan.customer_phone],['Bike Name',plan.bike_name],
            ['Remaining',plan.remaining,paymentBalance]
        ]) + `<form id="collectForm" class="form-grid">
            ${amount('amount','Amount collected',{initial:Math.min(Number(plan.monthly_qist),Number(plan.remaining)),required:true,min:.01,max:plan.remaining})}
            ${input('next_date','Updated next date (optional)',{type:'date',extra:`min="${data.today}"`})}
            ${paymentPreview('qistRemainingPreview')}${accountField()}${submit('Save Payment')}</form>`);
        const form = $('#collectForm');
        bindPaymentPreview(form,plan.remaining);
        saveForm(form, async (fields, key) => {
            await request('/qist/' + id + '/payments', {
                method:'POST', body:{ ...fields, amount:Number(fields.amount), request_key:key }
            });
            window.kbNotifications?.check();
            await refresh({ render:false });
            if (!data) return;
            if (form.isConnected && receiptDialog.open) receiptDialog.close();
            if (['qist','qist-dues'].includes(currentPage())) await renderPage();
            notice('Payment collected.');
        });
    }

    async function qistHistory(id) {
        showDialog('Payment history','<p class="empty" id="qistHistory" aria-live="polite">Loading…</p>');
        const content = $('#qistHistory');
        try {
            const payments = await request('/qist/' + id + '/payments');
            if (content.isConnected && receiptDialog.open) content.outerHTML = table(payments,[['Date','date'],['Amount','amount','money']]);
        } catch (error) {
            if (error.status === 401) signInView();
            else if (content.isConnected) notice(error.message,true,content);
        }
    }

    function bikeDetails(id) {
        const bike = data.bikes.find(row => String(row.id) === id);
        if (!bike) return;
        showDialog(bike.bike_name, details([['Model',bike.model],['Chassis',bike.chassis_no],['Plate',bike.plate_no],
            ['Purchased',bike.purchased_on]]) + operations.bikeExpenseControls(bike) +
            (bike.status === 'stock' && can('sell') ? `<button type="button" class="primary" data-sell-bike="${esc(bike.id)}">Sell Bike</button>` : ''),true);
        operations.updateBikeTotals(bike);
        operations.bikeExpenses(bike).catch(showPageError);
    }

    function customerDetails(id) {
        const customer = data.customers.find(row => String(row.id) === id);
        if (!customer) return;
        showDialog(customer.name, details([['Phone',customer.phone],['CNIC',customer.cnic],['Qist balance',format(customer.qist_balance)]]) +
            table(data.sold.filter(row => String(row.customer_id) === id),columns.sold),true);
    }

    document.addEventListener('click', event => {
        const action = event.target.closest('button');
        if (!action) return;
        if (action.id === 'dayClose') confirmDayClose();
        else if (action.id === 'earlierClose') earlierDayClose();
        else if (action.hasAttribute('data-job')) workshopDetails(action.dataset.job);
        else if (action.hasAttribute('data-job-payment')) collectWorkshopPayment(action.dataset.jobPayment);
        else if (action.hasAttribute('data-profit-source')) profitBreakdown(action.dataset.profitSource);
        else if (action.hasAttribute('data-profit-bike')) soldBikeProfit(action.dataset.profitBike);
        else if (action.hasAttribute('data-qist-history')) qistHistory(action.dataset.qistHistory);
        else if (action.hasAttribute('data-receipt')) receipt(action.dataset.receipt);
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

    view.addEventListener('change',async event => {
        const box = event.target.closest('[data-repurchase]');
        if (!box || !box.checked) return;
        box.disabled = true;
        try {
            const { id } = await request('/daily-report/repurchase/' + box.dataset.repurchase, {
                method:'POST',body:{quantity:Number(box.dataset.quantity)}
            });
            if (data?.daily) data.daily.repurchase = data.daily.repurchase.filter(row => String(row.id) !== String(id));
            if (usesDailyReport(currentPage())) {
                await renderPage();
                if (refreshButton.disabled) await refresh();
            }
        } catch (error) {
            if (error.status === 409) await refresh();
            box.disabled = false;
            box.checked = false;
            showPageError(error);
        }
    });

    $('#loginForm').addEventListener('submit', async event => {
        event.preventDefault();
        const form = event.currentTarget;
        const button = form.querySelector('button[type=submit]');
        button.disabled = true;
        const output = $('#loginStatus');
        try {
            await request('/login', { method:'POST', body:values(form) });
            form.reset();
            notice('', false, output);
            await refresh();
        } catch (error) {
            if (error.message === 'Enter a fresh authenticator code or recovery code.') {
                $('#loginCode').hidden = false;
                form.elements.code.focus();
            }
            notice(error.message, true, output);
        }
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
    refreshButton.addEventListener('click', () => refresh({ announce:true }));

    const storage = {
        read: key => { try { return localStorage.getItem(key); } catch { return null; } },
        write: (key,value) => { try { localStorage.setItem(key,value); } catch {} }
    };
    function setTheme(theme) {
        const light = theme === 'light';
        document.documentElement.dataset.theme = light ? 'light' : 'dark';
        document.querySelectorAll('.theme-toggle').forEach(button => {
            button.textContent = light ? '☾ Dark' : '☀ Light';
            button.setAttribute('aria-pressed', String(light));
            button.setAttribute('aria-label', light ? 'Switch to dark theme' : 'Switch to light theme');
        });
    }
    setTheme(storage.read('kb-theme'));
    document.querySelectorAll('.theme-toggle').forEach(button => button.addEventListener('click', () => {
        const theme = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
        storage.write('kb-theme', theme);
        setTheme(theme);
    }));
    const mobile = matchMedia('(max-width: 760px)');
    const resize = $('.resize');
    const backdrop = $('#drawerBackdrop');
    const menu = $('#menuToggle');
    const sidebar = $('#sidebar');
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
    function updateNavigation() {
        const open = workspace.classList.contains('drawer');
        const expanded = mobile.matches ? open : !collapsed;
        sidebar.inert = !expanded;
        menu.setAttribute('aria-expanded',String(expanded));
    }
    function setDrawer(open) {
        if (open) window.kbNotifications?.close();
        const wasOpen = workspace.classList.contains('drawer');
        workspace.classList.toggle('drawer',open);
        backdrop.hidden = !open;
        for (const selector of ['#mainContent','#toolbar']) $(selector).inert = open;
        updateNavigation();
        if (open || (wasOpen && !workspace.hidden)) menu.focus();
    }
    function updateCollapse() {
        workspace.classList.toggle('collapsed',collapsed);
        updateNavigation();
    }
    size(width);
    updateCollapse();
    addEventListener('resize',() => size(width));
    mobile.addEventListener('change', () => setDrawer(false));
    backdrop.addEventListener('click',() => setDrawer(false));
    document.addEventListener('keydown',event => {
        if (backdrop.hidden) return;
        if (event.key === 'Escape') setDrawer(false);
        if (event.key !== 'Tab') return;
        const focusable = [menu, ...sidebar.querySelectorAll('a, summary, button')].filter(item => item.getClientRects().length);
        const index = focusable.indexOf(document.activeElement);
        event.preventDefault();
        focusable[(index + (event.shiftKey ? -1 : 1) + focusable.length) % focusable.length].focus();
    });
    sidebar.addEventListener('click',event => { if (event.target.closest('a') && mobile.matches) setDrawer(false); });
    menu.addEventListener('click',() => {
        if (mobile.matches) return setDrawer(!workspace.classList.contains('drawer'));
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
    const rtl = () => document.documentElement.dir === 'rtl';
    const resizePosition = event => rtl() ? innerWidth - event.clientX : event.clientX;
    addEventListener('pointermove',event => { if (pointer === event.pointerId && (event.buttons & 1)) size(resizePosition(event)); });
    function endResize() { pointer = null; workspace.classList.remove('resizing'); size(width); }
    addEventListener('pointerup',event => { if (pointer === event.pointerId) { size(resizePosition(event),true); endResize(); } });
    addEventListener('pointercancel',endResize);
    addEventListener('blur',endResize);
    resize.addEventListener('keydown',event => {
        if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
        event.preventDefault();
        const step = (event.key === 'ArrowLeft' ? -16 : 16) * (rtl() ? -1 : 1);
        size(event.key === 'Home' ? 178 : event.key === 'End' ? 392 : width + step, true);
    });

    let pullStart = null;
    addEventListener('touchstart',event => {
        pullStart = null;
        if (!mobile.matches || scrollY > 0 || workspace.hidden || !backdrop.hidden || receiptDialog.open ||
            event.touches.length !== 1 || event.target.closest('input, select, textarea')) return;
        const touch = event.touches[0];
        pullStart = { id:touch.identifier, x:touch.clientX, y:touch.clientY };
    }, {passive:true});
    addEventListener('touchmove',event => { if (event.touches.length !== 1 || scrollY > 0) pullStart = null; }, {passive:true});
    addEventListener('touchcancel',() => { pullStart = null; }, {passive:true});
    addEventListener('touchend',event => {
        if (!pullStart) return;
        const touch = Array.from(event.changedTouches).find(item => item.identifier === pullStart.id);
        if (touch && !refreshButton.disabled && touch.clientY - pullStart.y >= 72 &&
            Math.abs(touch.clientX - pullStart.x) <= 55) refresh({ announce:true });
        pullStart = null;
    }, {passive:true});

    const markDraft = event => { if (event.target.closest('.form-grid')) viewHasDraft = true; };
    view.addEventListener('input',markDraft);
    view.addEventListener('change',markDraft);
    document.addEventListener('kb-language-change',updateRefreshLabel);
    setInterval(updateRefreshLabel,15000);
    updateRefreshLabel();
    addEventListener('pageshow',event => { if (event.persisted && data) refresh({ pageOpen:true }); });
    addEventListener('hashchange',() => {
        if (!data) return;
        notice('');
        renderPage().catch(showPageError);
        refresh({ pageOpen:true });
    });
    const operationTools = {$,view,esc,t,request,label,input,amount,select,table,panel,heading,button,submit,
        saveForm,showDialog,details,notice,format,cents,metrics,message,signedProfit,exportLinks,can,allowedPage,currentPage,renderPage,
        showPageError,accountField,getData:()=>data,closeDialog:()=>{ if (receiptDialog.open) receiptDialog.close(); },
        signInView,refresh};
    const operations = window.kbOperations(operationTools);
    const businessPages = window.kbBusinessPages(operationTools);
    let checkingAccess = false;
    async function checkPermissions() {
        if (!data?.user || data.user.admin || document.hidden || checkingAccess) return;
        checkingAccess = true;
        try {
            const user = await request('/session');
            if (data?.user && JSON.stringify(data.user) !== JSON.stringify(user)) {
                if (receiptDialog.open) receiptDialog.close();
                lastPage = '';
                await refresh();
            }
        } catch (error) {
            if (error.status === 401) signInView();
        } finally { checkingAccess = false; }
    }
    setInterval(checkPermissions,5000);
    addEventListener('focus',checkPermissions);
    addEventListener('storage',event=>{ if (event.key==='kb-permissions-updated') checkPermissions(); });
    refresh().then(async () => {
        if ($('#signIn').hidden) return;
        const setup = await request('/health').catch(() => null);
        if (setup && !setup.databaseConfigured) notice('Connect Supabase to start saving records.', false, $('#loginStatus'));
        else if (setup && !setup.signInConfigured) notice('Configure a staff password to sign in.', false, $('#loginStatus'));
    });
})();

