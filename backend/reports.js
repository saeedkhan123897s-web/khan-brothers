'use strict';

const { pdfReport } = require('./report-pdf');
const { spreadsheet } = require('./src/utils/spreadsheet');
const { today } = require('./routes/shared');
const { problem } = require('./supabase');

const pennies = value => Math.round(Number(value || 0) * 100);
const sum = (rows, key) => rows.reduce((total, row) => total + pennies(row[key]), 0) / 100;
const byId = rows => new Map(rows.map(row => [String(row.id), row]));

async function state(db) {
    const { bikes, sales, customers, qist, expenses, settings, profit } = await db.rpc('kb_snapshot', {});
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
        settings,
        profit,
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
            return { ...plan, customer_name: sale?.customer_name, customer_phone: sale?.customer_phone,
                bike_name: bike?.bike_name, paid: (pennies(plan.total) - pennies(plan.remaining)) / 100 };
        }).sort((a, b) => (a.next_date ?? '9999').localeCompare(b.next_date ?? '9999') || a.id - b.id),
        expenses: expenses.sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)
    };
}

const columns = {
    stock: [['bike_name','Bike'],['model','Model'],['chassis_no','Chassis'],['plate_no','Plate'],['purchase_price','Purchase'],
        ['repair_cost','Repair'],['other_cost','Other'],['total_cost','Total cost'],['sell_price','Expected sell price'],['expected_profit','Expected profit']],
    sold: [['bike_name','Bike'],['model','Model'],['chassis_no','Chassis'],['customer_name','Customer'],['salesman','Salesman'],['date','Date'],
        ['payment_method','Payment'],['sell_price','Sold price'],['cost_at_sale','Cost'],['profit','Real profit']],
    customers: [['name','Customer'],['phone','Phone'],['cnic','CNIC'],['qist_balance','Qist balance']],
    profit: [['bike_name','Bike Name'],['purchase_price','Buy Price'],['sell_price','Sell Price'],['profit','Profit']]
};
const profitSourceLabels = { bike:'Bike Sell Profit', parts:'Spare Parts Profit', labour:'Handwork / Labour Profit' };

const reportNames = { stock:'Stock Report', sold:'Sale Report', customers:'Customer Report', profit:'Profit Report',
    daily:'Daily Report', qist:'Qist Report', commission:'Mechanic Commission Report', workshop:'Workshop Report' };
const totalsColumns = {
    stock:['purchase_price','repair_cost','other_cost','total_cost','expected_profit'],
    sold:['sell_price','cost_at_sale','profit'],
    customers:['qist_balance'], qist:['total','paid','remaining'],
    daily:['sale_income','qist_collected','workshop_income','expense','total_income'],
    commission:['jobs','quantity','sales','earned','paid','remaining'],
    workshop:['parts_cost','labour_charge','total_bill','paid_amount','remaining'],
    profit:['purchase_price','sell_price','profit']
};

function withTotals(sheet, fields) {
    return {...sheet,total:{ [sheet.columns[0][0]]:'Total',
        ...Object.fromEntries(fields.map(key=>[key,sum(sheet.rows,key)])) }};
}

async function exportReport(db, section, format, zone='Asia/Muscat') {
    if (!Object.hasOwn(reportNames,section) || !['csv','excel','pdf'].includes(format)) throw problem(400,'Choose a valid export.');
    const data = await state(db);
    const day = today(zone);
    const dateLabel = new Intl.DateTimeFormat('en-GB',{day:'2-digit',month:'short',year:'numeric',timeZone:'UTC'})
        .format(new Date(day+'T00:00:00Z')).replaceAll(' ','-');
    let sheets;
    if (section==='daily') {
        const {report} = await db.rpc('kb_daily_overview',{p_day:day,p_timezone:zone});
        sheets=[{ name:'Daily balances', columns:[['label','Item'],['value','PKR']], rows:[
            {label:'Opening Balance',value:report.opening_balance},{label:'Today Sale',value:report.sale_income},
            {label:'Qist Collected',value:report.qist_collected},{label:'Workshop Income',value:report.workshop_income},
            {label:'Total Income',value:report.total_income},{label:'Total Expense',value:report.expense}
        ],total:{label:'Closing Balance',value:report.closing_balance} }];
    } else if (section==='qist') {
        sheets=[withTotals({name:'Qist plans',columns:[['customer_name','Customer Name'],['customer_phone','Phone'],['bike_name','Bike'],
            ['total','Total Price'],['paid','Paid'],['remaining','Remaining'],['next_date','Next Date']],rows:data.qist},totalsColumns.qist)];
    } else if (section==='commission') {
        const ledger=await db.rpc('kb_partner_ledger',{});
        sheets=['mechanic','workshop'].map(kind=>withTotals({name:kind==='mechanic'?'Mechanics':'Referral Workshops',columns:[
            ['name','Name'],['jobs',kind==='mechanic'?'Total Jobs':'Total Referrals'],['quantity','Parts'],['sales','Parts Sold'],
            ['earned',kind==='mechanic'?'Commission Earned':'Bonus Earned'],['paid','Paid'],['remaining','Remaining']
        ],rows:ledger.filter(row=>row.kind===kind)},totalsColumns.commission));
    } else if (section==='workshop') {
        const rows=(await db.list('kb_workshop_jobs')).map(row=>({...row,remaining:row.total_bill == null ? null :
            (pennies(row.total_bill)-pennies(row.paid_amount))/100}));
        sheets=[withTotals({name:'Workshop jobs',columns:[['created_on','Date'],['bike_name','Bike'],['customer_name','Customer'],
            ['mechanic','Mechanic'],['status','Status'],['parts_cost','Parts Cost'],['labour_charge','Labour Charge'],
            ['total_bill','Total Bill'],['paid_amount','Paid'],['remaining','Remaining']],rows},totalsColumns.workshop)];
    } else {
        const rows=section==='stock' ? data.bikes.filter(row=>row.status==='stock') : section==='customers' ? data.customers : data.sold;
        sheets=[withTotals({name:section==='profit'?'Sold Bikes':reportNames[section],columns:columns[section],rows},totalsColumns[section])];
        if (section==='profit') {
            if (!data.profit) throw problem(503,'Profit data is unavailable.');
            const leading=data.profit.leading.map(source=>profitSourceLabels[source]).join(' / ');
            sheets.unshift({name:'Profit summary',
                columns:[...Object.entries(profitSourceLabels),['net','Total Net Profit'],['leading','Highest Profit Source']],
                rows:[{...data.profit,leading:leading||'No profitable source'}]});
        }
    }
    const file=format==='pdf' ? await pdfReport(reportNames[section],dateLabel,sheets,data.settings?.business_name||'Khan Brothers')
        : spreadsheet(sheets.map(sheet=>section==='daily' && sheet.total ? {...sheet,rows:[...sheet.rows,sheet.total]} : sheet),format);
    return {...file,filename:reportNames[section].replaceAll(' ','_')+'_'+dateLabel+'.'+file.extension};
}

module.exports = { state, exportReport };
