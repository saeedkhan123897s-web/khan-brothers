'use strict';

const { spreadsheet } = require('./src/utils/spreadsheet');
const { today } = require('./routes/shared');
const { problem } = require('./supabase');

const pennies = value => Math.round(Number(value || 0) * 100);
const sum = (rows, key) => rows.reduce((total, row) => total + pennies(row[key]), 0) / 100;
const byId = rows => new Map(rows.map(row => [String(row.id), row]));

async function state(db) {
    const { bikes, sales, customers, qist, expenses } = await db.rpc('kb_snapshot', {});
    const bikeById = byId(bikes);
    const salesByBike = new Map(sales.map(sale => [String(sale.bike_id), sale]));
    const qistBySale = new Map(qist.map(plan => [String(plan.sale_id), plan]));
    const saleById = byId(sales);
    const salesByCustomer = new Map();
    const sold = sales.map(sale => ({ ...bikeById.get(String(sale.bike_id)), ...sale,
        amount_due: qistBySale.get(String(sale.id))?.remaining ?? 0 }));
    for (const row of sold) {
        const key = String(row.customer_id);
        if (!salesByCustomer.has(key)) salesByCustomer.set(key, []);
        salesByCustomer.get(key).push(row);
    }
    const day = today();
    return {
        today: day,
        bikes: bikes.map(bike => {
            const sale = salesByBike.get(String(bike.id));
            return { ...bike, customer_name: sale?.customer_name, payment_method: sale?.payment_method || bike.purchase_method,
                expected_profit: bike.sell_price == null ? null : (pennies(bike.sell_price) - pennies(bike.total_cost)) / 100 };
        }).reverse(),
        sold: sold.reverse(),
        customers: customers.map(customer => {
            const purchases = salesByCustomer.get(String(customer.id)) || [];
            return { ...customer, qist_balance: sum(purchases, 'amount_due') };
        }),
        qist: qist.map(plan => {
            const sale = saleById.get(String(plan.sale_id));
            const bike = bikeById.get(String(sale?.bike_id));
            return { ...plan, customer_name: sale?.customer_name, bike_name: bike?.bike_name };
        }).sort((a, b) => (a.next_date ?? '9999').localeCompare(b.next_date ?? '9999')),
        expenses: expenses.sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)
    };
}

const columns = {
    stock: [['bike_name','Bike'],['model','Model'],['chassis_no','Chassis'],['plate_no','Plate'],['purchase_price','Purchase'],
        ['repair_cost','Repair'],['other_cost','Other'],['total_cost','Total cost'],['sell_price','Expected sell price'],['expected_profit','Expected profit']],
    sold: [['bike_name','Bike'],['model','Model'],['chassis_no','Chassis'],['customer_name','Customer'],['date','Date'],
        ['payment_method','Payment'],['sell_price','Sold price'],['cost_at_sale','Cost'],['profit','Real profit']],
    customers: [['name','Customer'],['phone','Phone'],['cnic','CNIC'],['qist_balance','Qist balance']],
    expenses: [['date','Date'],['type','Category'],['description','Description'],['amount','Amount']]
};

async function exportReport(db, section, format) {
    if (!['stock','sold','customers','profit'].includes(section) || !['csv','excel'].includes(format)) {
        throw problem(400, 'Choose a valid export.');
    }
    const data = await state(db);
    const stock = data.bikes.filter(row => row.status === 'stock');
    const sheets = [{ name: section === 'profit' ? 'Sold motorcycles' : section,
        columns: columns[section === 'profit' ? 'sold' : section],
        rows: section === 'stock' ? stock : section === 'customers' ? data.customers : data.sold }];
    if (section === 'profit') {
        const gross = sum(data.sold, 'profit');
        const overhead = sum(data.expenses, 'amount');
        sheets.unshift({ name: 'Profit summary',
            columns: [['gross_profit','Sale profit'],['expenses','Expenses'],['net_profit','Net profit']],
            rows: [{ gross_profit: gross, expenses: overhead, net_profit: (pennies(gross) - pennies(overhead)) / 100 }] });
        sheets.push({ name: 'Expenses', columns: columns.expenses, rows: data.expenses });
    }
    return spreadsheet(sheets, format);
}

module.exports = { state, exportReport };
