'use strict';

(() => {
    const { pages, finance, column, currency, day, status, metrics, table } = Admin;

    pages['workshop-overview'] = {
        title: 'Workshop overview',
        roles: finance,
        permission: 'dashboard.view',
        path: '/api/reports/dashboard',
        summary: ({ data }) => metrics([
            currency('today_sales.total', 'Today Sales'), column('products.count', 'Catalogue Products'),
            column('products.low_stock', 'Low Stock'), column('active_jobs', 'Active Workshop Jobs'),
            column('open_orders', 'Open Online Orders'), column('customers', 'Customers')
        ], data) + '<h2 class="admin-panel-title">Recent transactions</h2>' + table([
            day('transaction_date', 'Date'), column('transaction_id', 'Reference'), column('type', 'Type'),
            column('party', 'Customer or supplier'), currency('amount'), status()
        ], data.recent_transactions)
    };

    const dashboard = document.querySelector('#dashboardData');
    if (!dashboard) return;
    const setSidebarUser = Admin.mountSidebar([], true);
    const refresh = document.querySelector('#refreshDashboard');
    const notice = document.querySelector('#dashboardStatus');
    const { request, money, escape: e, url } = ERP;
    const base = '/admin/pages/';
    const bike = 'purchases/used-bike-';
    const count = value => new Intl.NumberFormat().format(Number(value) || 0);
    const headings = (title, description = '') => '<div class="section-heading"><h2>' + e(title) + '</h2>' +
        (description ? '<p>' + e(description) + '</p>' : '') + '</div>';

    function permitted(user, path) {
        return Admin.canOpenPage(user, base + path);
    }

    function cards(user, entries) {
        return '<div class="cards">' + entries.filter(([, , , , path]) => permitted(user, path)).map(
            ([icon, title, value, note, path]) => `<a class="card" href="${e(base + path)}">
                <span class="card-icon" aria-hidden="true">${icon}</span><p>${e(title)}</p><strong>${e(value)}</strong><small>${e(note)}</small>
            </a>`).join('') + '</div>';
    }

    function overview(user, data) {
        const today = { start_date: data.today, end_date: data.today, status: 'completed' };
        return headings('Business Overview', 'Your business summary') + cards(user, [
            ['💵', "Today's Sales", money(data.today_sales.total), count(data.today_sales.count) + ' sales today', url('sales/sales-list.html', today)],
            ['📦', 'Total Products', count(data.products.count), 'Products in inventory', 'inventory/products.html'],
            ['🔧', 'Active Repair Jobs', count(data.active_jobs), 'Motorcycles under repair', 'workshop/job-cards.html?status=active'],
            ['⚠️', 'Low Stock Items', count(data.products.low_stock), 'Products requiring attention', 'inventory/stock.html?stock_status=needs_attention'],
            ['🛒', 'Open Online Orders', count(data.open_orders), 'Orders awaiting completion', 'sales/online-orders.html?status=open'],
            ['👥', 'Customers', count(data.customers), 'Active customer accounts', 'customers/customer-list.html?is_active=1']
        ]);
    }

    function quickActions(user) {
        const items = [
            ['➕', 'Add Product', 'inventory/add-product.html'], ['🛒', 'New Sale', 'sales/pos.html'],
            ['🔧', 'New Repair Job', 'workshop/new-jobs.html'], ['🛍️', 'New Purchase', 'purchases/new-purchase.html'],
            ['🏍️', 'Purchase Bike', 'purchases/buy-used-bike.html'], ['⇄', 'Sell Bike', 'purchases/sell-used-bike.html']
        ].filter(([, , path]) => permitted(user, path));
        return items.length ? headings('Quick Actions', 'Frequently used business operations') +
            '<div class="actions">' + items.map(([icon, title, path]) =>
                `<a class="action" href="${e(base + path)}"><span aria-hidden="true">${icon}</span>${e(title)}</a>`).join('') + '</div>' : '';
    }

    function motorcycleOverview(user, data) {
        const today = { start_date: data.today, end_date: data.today };
        const dailyProfit = url(bike + 'profit.html', today);
        const qist = bike + 'qist.html';
        return headings('Used-Bike Business') + cards(user, [
            ['🏍️', 'Today Sale', money(data.today_sales), 'Used motorcycles sold today', dailyProfit],
            ['🧾', 'Today Expense', money(data.today_expenses), 'Used-bike expenses today', url(bike + 'expenses.html', today)],
            ['📈', 'Today Profit', money(data.today_profit), 'After today’s operating expenses', dailyProfit],
            ['💰', 'Total Profit', money(data.total_gross), 'Combined resale margins', bike + 'profit.html'],
            ['📦', 'Total Capital', money(data.stock_capital), 'Cost of used motorcycles in stock', 'purchases/used-bikes.html']
        ]) + headings('Qist reminders') +
            table([column('customer_name', 'Customer'), column('product_name', 'Bike'), day('next_due_date', 'Due date'),
                currency('monthly_installment', 'Monthly Qist'), currency('amount_due', 'Remaining')], data.reminders) +
            (permitted(user, qist) ? `<a class="kb-action-link dashboard-list-link" href="${base + qist}?status=pending">View pending Qist</a>` : '');
    }

    async function loadDashboard(user) {
        refresh.disabled = true;
        notice.classList.remove('error');
        notice.textContent = 'Loading business data…';
        try {
            const [workshop, used] = await Promise.allSettled([
                request('/api/reports/dashboard'), request('/api/used-bikes/summary')
            ]);
            const data = workshop.value?.data;
            const recent = data ? headings('Recent Transactions') + table([
                day('transaction_date', 'Date'), column('transaction_id', 'Reference'), column('type', 'Type'),
                column('party', 'Customer or supplier'), currency('amount'), status()
            ], data.recent_transactions) : '';
            dashboard.innerHTML = (data ? overview(user, data) : '') + quickActions(user) + recent +
                (used.value ? motorcycleOverview(user, used.value.data) : '');
            const failure = [workshop, used].find(result => result.status === 'rejected');
            if (failure?.reason?.status === 401) location.replace('/admin/login.html');
            notice.classList.toggle('error', Boolean(failure));
            notice.textContent = failure ? failure.reason.message : 'Dashboard data is up to date.';
        } finally {
            refresh.disabled = false;
        }
    }

    Admin.getSession().then(user => {
        if (!Admin.staff.includes(user?.role)) return location.replace('/admin/login.html');
        setSidebarUser(user);
        if (!Admin.can(user, 'dashboard.view', finance)) throw new Error('Your role does not have access to the dashboard.');
        refresh.addEventListener('click', () => loadDashboard(user));
        return loadDashboard(user);
    }).catch(error => {
        if (error.status === 401) return location.replace('/admin/login.html');
        notice.classList.add('error');
        notice.textContent = error.message;
        refresh.disabled = true;
    });
})();
