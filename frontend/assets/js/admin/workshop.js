'use strict';

(() => {
    const { pages, management, field, select, lookup, amount, integer, text, search, column, currency,
        day, status, customer, product, action, edit, remove, table, details } = Admin;
    const { request } = ERP;
    const base = '/api/workshop';
    const links = [['Job cards', 'workshop/job-cards.html'], ['New job', 'workshop/new-jobs.html'],
        ['Repair history', 'workshop/repair-history.html'], ['Mechanics', 'workshop/mechanics.html'], ['Services', 'workshop/services.html']];
    const jobForms = new WeakMap();
    const jobRoles = [...management, 'mechanic'];
    const transitions = {
        received: ['diagnosing', 'cancelled'], diagnosing: ['waiting_parts', 'in_progress', 'cancelled'],
        waiting_parts: ['in_progress', 'cancelled'], in_progress: ['waiting_parts', 'completed', 'cancelled'],
        completed: ['delivered']
    };
    const jobPath = row => base + '/' + row.id;
    const mechanic = options => lookup('mechanic_id', 'Mechanic', base + '/mechanics', ['name'], options);
    const diagnosis = text('diagnosis', 'Diagnosis', { keepEmpty: true });
    const complaints = text('complaints', 'Customer complaint', { keepEmpty: true });
    const notes = text('notes', 'Technician notes', { keepEmpty: true });
    const appointment = field('estimated_completion', 'Estimated completion', { type: 'date' });
    const oilDates = [field('oil_change_on', 'Last oil change', { type: 'date' }),
        field('next_oil_change_on', 'Next oil change due', { type: 'date' })];
    const editableOilDates = oilDates.map(spec => ({ ...spec, emptyAsNull: true }));
    const oilColumns = [day('oil_change_on', 'Last oil change'), day('next_oil_change_on', 'Next oil change')];
    const detailsAction = action('View', async (row, context) => {
        const { data } = await request(jobPath(row));
        context.dialog(data.job_number, details([
            column('customer_name', 'Customer'), column('customer_phone', 'Phone'),
            column('motorcycle_make', 'Make'), column('motorcycle_model', 'Model'),
            column('motorcycle_registration', 'Registration'), status(), column('complaints'), column('diagnosis'),
            column('notes'), ...oilColumns, currency('total_cost', 'Total'), currency('amount_paid', 'Paid')
        ], data) + '<h3>Services</h3>' + table([column('service_name', 'Service'), currency('price', 'Price')], data.services)
            + '<h3>Parts</h3>' + table([column('product_name', 'Product'), column('quantity'), currency('subtotal', 'Subtotal')], data.parts));
    });
    const jobColumns = [column('job_number', 'Job'), day('received_date', 'Received'), column('customer_name', 'Customer'),
        column('motorcycle_registration', 'Registration'), column('mechanic_name', 'Mechanic'), ...oilColumns, status(), currency('total_cost', 'Total')];

    pages['job-cards'] = {
        title: 'Workshop job cards', links, path: base, paged: true, columns: jobColumns,
        filters: [search, select('status', 'Status', [['active', 'Active repair jobs'], ...Object.keys(transitions), 'delivered', 'cancelled'])],
        actions: [detailsAction, edit('Update job', jobPath, [complaints, diagnosis, mechanic({ emptyAsNull: true }), appointment,
            amount('estimated_cost', 'Estimated cost'), ...editableOilDates, notes], { permission: 'workshop.jobs.edit', when: (_row, user) => user.role !== 'mechanic' }),
        edit('Update diagnosis', jobPath, [diagnosis, appointment, ...editableOilDates, notes], { roles: ['mechanic'], permission: 'workshop.jobs.edit', when: (_row, user) => user.role === 'mechanic' }),
        action('Change status', (row, context) => {
            const options = transitions[row.status].filter(value =>
                context.user.role !== 'mechanic' || !['delivered', 'cancelled'].includes(value));
            return edit('Change job status', item => jobPath(item) + '/status',
                [select('status', 'Next status', options, { required: true })], { method: 'PATCH' }).run(row, context);
        }, { roles: jobRoles, permission: 'workshop.jobs.edit', when: (row, user) => transitions[row.status]?.some(value => user.role !== 'mechanic' || !['delivered', 'cancelled'].includes(value)) })]
    };
    pages['repair-history'] = {
        title: 'Repair history', links, path: base, paged: true, columns: jobColumns, actions: [detailsAction],
        filters: [search, select('status', 'Closed status', ['completed', 'delivered', 'cancelled'], { value: 'delivered', required: true }),
            customer()]
    };

    pages['new-jobs'] = {
        title: 'New workshop job', links, roles: management,
        form: {
            path: base, button: 'Create job card',
            fields: [customer(), select('motorcycle_id', 'Registered motorcycle', []), field('customer_name', 'Walk-in name', { maxLength: 100 }),
                field('customer_phone', 'Walk-in phone', { maxLength: 20 }), field('motorcycle_make', 'Motorcycle make', { maxLength: 50 }),
                field('motorcycle_model', 'Motorcycle model', { maxLength: 50 }), field('motorcycle_registration', 'Registration', { maxLength: 20 }),
                integer('mileage', 'Mileage'), mechanic(), appointment, ...oilDates, complaints, notes, amount('estimated_cost', 'Estimated cost'),
                amount('labor_cost', 'Labour charge override'), amount('amount_paid', 'Amount paid')],
            async setup(form) {
                jobForms.set(form, {
                    services: Admin.repeat(form, 'Services', [lookup('service_id', 'Service', base + '/services', ['name'], { required: true })]),
                    parts: Admin.repeat(form, 'Parts', [product({ required: true, productType: 'part' }), integer('quantity', 'Quantity', { min: 1, required: true, value: 1 })])
                });
                const account = form.elements.customer_id;
                const motorcycle = form.elements.motorcycle_id;
                const load = async () => {
                    const id = account.value;
                    motorcycle.length = 1;
                    if (!id) return;
                    const payload = await request('/api/customers/' + encodeURIComponent(id) + '/motorcycles');
                    if (account.value !== id) return;
                    for (const row of payload.data) motorcycle.add(new Option([row.make, row.model, row.registration_number].filter(Boolean).join(' · '), row.id));
                };
                account.addEventListener('change', () => load().catch(error => Admin.feedback(form.querySelector('.erp-form-actions p'), error.message, true)));
            },
            body(values, _row, form) {
                const { services, parts } = jobForms.get(form);
                values.services = services.read().map(row => ({ service_id: Number(row.service_id) }));
                values.parts = parts.read().map(row => ({ product_id: Number(row.product_id), quantity: row.quantity }));
                if (new Set(values.parts.map(row => row.product_id)).size !== values.parts.length) throw new Error('Combine quantities for the same part on one line.');
                if (!values.customer_id && !values.customer_name) throw new Error('Select a customer or enter a walk-in name.');
                return values;
            },
            saved: () => location.assign('/admin/pages/workshop/job-cards.html')
        }
    };

    const services = [field('name', 'Service name', { required: true, minLength: 2, maxLength: 100 }),
        amount('base_price', 'Base price', { required: true }), amount('estimated_hours', 'Estimated hours', { step: '0.1', max: 999.9 }), text('description', 'Description', { keepEmpty: true })];
    const mechanics = [field('name', 'Mechanic name', { required: true, minLength: 2, maxLength: 100 }),
        field('phone', 'Phone', { maxLength: 20, keepEmpty: true }), field('specialization', 'Specialization', { maxLength: 100, keepEmpty: true }),
        amount('daily_rate', 'Daily rate'), integer('user_id', 'Linked mechanic user ID', { min: 1, emptyAsNull: true })];
    for (const [type, title, fields, columns] of [
        ['services', 'Workshop services', services, [column('name'), currency('base_price', 'Base price'), column('estimated_hours', 'Hours'), column('description')]],
        ['mechanics', 'Mechanics', mechanics, [column('name'), column('phone'), column('specialization'), currency('daily_rate', 'Daily rate'), column('user_id', 'Linked user')]]
    ]) {
        const path = base + '/' + type;
        pages[type] = {
            title, links, path, columns, listPermission: 'workshop.view', form: { roles: management, permission: 'workshop.manage', fields, path },
            actions: [edit('Edit', row => path + '/' + row.id, fields, { permission: 'workshop.manage' }), remove('Deactivate', row => path + '/' + row.id, management, 'workshop.manage')]
        };
    }
})();
