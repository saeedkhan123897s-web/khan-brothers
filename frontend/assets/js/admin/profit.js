'use strict';

(() => {
    const { pages, finance, dates, column, currency, status, metrics, table } = Admin;
    const links = [['Profit and loss', 'profit/profit-loss.html'], ['Net profit', 'profit/net-profit.html'],
        ['Spare parts profit', 'profit/spare-part-profit.html'], ['Workshop profit', 'profit/workshop-profit.html']];
    const common = { links, roles: finance, filters: dates };
    pages['profit-loss'] = {
        ...common, title: 'Profit and loss', path: '/api/profit/summary',
        summary: ({ data }) => metrics([
            currency('sales.revenue', 'Sales revenue'), currency('sales.product_profit', 'Product profit'),
            currency('workshop.revenue', 'Workshop revenue'), currency('workshop.profit', 'Workshop profit'),
            currency('gross_profit', 'Gross profit'), currency('expenses', 'Expenses'), currency('net_profit', 'Net profit')
        ], data)
    };
    pages['net-profit'] = {
        ...common, title: 'Net profit', path: '/api/profit/summary',
        summary: ({ data }) => metrics([currency('net_profit', 'Net profit'), currency('gross_profit', 'Gross profit'),
            currency('expenses', 'Expenses')], data) + table([column('name', 'Source'), currency('value', 'Amount')], [
            { name: 'Spare parts', value: data.sales.product_profit }, { name: 'Workshop', value: data.workshop.profit },
            { name: 'Operating expenses', value: -data.expenses }
        ])
    };
    pages['spare-part-profit'] = {
        ...common, title: 'Spare parts profit', path: '/api/profit/products',
        columns: [column('product_sku', 'SKU'), column('product_name', 'Product'), column('units_sold', 'Units sold'),
            currency('revenue', 'Revenue'), currency('profit', 'Profit')]
    };
    pages['workshop-profit'] = {
        ...common, title: 'Workshop profit', path: '/api/profit/workshop',
        columns: [status(), column('jobs'), currency('revenue', 'Revenue'), currency('cost', 'Cost'), currency('profit', 'Profit')]
    };
})();
