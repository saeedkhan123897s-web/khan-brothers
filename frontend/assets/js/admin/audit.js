'use strict';

(() => {
    const { pages, finance, field, select, integer, dates, column, day, status, action, details } = Admin;
    const { request, escape: e } = ERP;
    const links = Admin.auditLinks;
    const modules = ['accounts', 'auth', 'customers', 'inventory', 'orders', 'payments', 'products', 'purchases', 'sales', 'settings', 'suppliers', 'used_bikes', 'workshop'];
    const fields = [day('created_at', 'Date'), column('actor_name', 'User'), column('module'), status('action', 'Action'), column('record_id', 'Record'), column('description')];
    const view = action('View', async (row, context) => {
        const { data } = await request('/api/audit/' + row.id);
        const snapshot = (title, value) => value == null ? '' : `<h3>${title}</h3><pre>${e(typeof value === 'string' ? value : JSON.stringify(value, null, 2))}</pre>`;
        context.dialog('Audit entry #' + row.id, details(fields, data) + snapshot('Previous values', data.old_values) + snapshot('Recorded values', data.new_values));
    });
    const list = { links, roles: finance, path: '/api/audit', paged: true, columns: fields, actions: [view] };
    pages['audit-trail'] = { ...list, title: 'Audit trail', filters: [select('module', 'Module', modules), field('action', 'Action'), ...dates] };
    pages['employee-activity'] = { ...list, title: 'Employee activity', filters: [integer('user_id', 'User ID', { min: 1 }), ...dates] };
    pages['financial-audit'] = {
        ...list, title: 'Financial audit',
        filters: [select('module', 'Module', ['accounts', 'payments', 'purchases', 'sales'], { value: 'accounts', required: true }), ...dates]
    };
})();
