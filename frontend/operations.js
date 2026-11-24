'use strict';

window.kbOperations = function createOperations(ui) {
    const {$,view,esc,t,request,label,input,amount,select,table,panel,heading,button,submit,saveForm,showDialog,details,
        notice,format,cents,metrics,message,signedProfit,exportLinks,can,allowedPage,closeDialog,currentPage,getData,renderPage,accountField} = ui;
    const grants = {
        dashboard:'Dashboard Dekh Sakta Hai',stock:'Stock Dekh Sakta Hai',buy:'Buy Bike Kar Sakta Hai',sell:'Sell Bike Kar Sakta Hai',
        qist:'Qist / Udhar Dekh Sakta Hai',qist_collect:'Qist Jama Kar Sakta Hai',workshop:'Workshop / Job Card Dekh Sakta Hai',
        workshop_status:'Workshop Job Status Change Kar Sakta Hai',parts:'Spare Parts Dekh Sakta Hai',customers:'Customers Dekh Sakta Hai',
        profit:'Profit Dekh Sakta Hai',daily:'Daily Report Dekh Sakta Hai',download:'Download Report Kar Sakta Hai',
        commission:'Commission Dekh Sakta Hai',capital:'Capital Dekh Sakta Hai',delete:'Delete Kar Sakta Hai',
        settings:'Settings Khol Sakta Hai',users:'Naya User Bana Sakta Hai'
    };
    const conditions = {engine_pct:'Engine Condition',body_pct:'Body / Kader Condition',overall_pct:'Overall Condition'};
    const direction = value => value <= 30 ? ['condition-low','Kharab'] : value <= 60
        ? ['condition-mid','Theek Hai'] : ['condition-high','Zabardast'];
    let selectedUser;
    let year;
    let chartRange = '30';

    async function load(page,path,render) {
        view.innerHTML=heading(page)+'<p class="empty" role="status">Loading…</p>';
        const placeholder=view.lastElementChild;
        const value=await request(path);
        if (placeholder.isConnected) render(value);
    }

    function conditionFields(bike = {},readonly = false) {
        return '<div class="condition-grid wide">' + Object.entries(conditions).map(([key,title])=>{
            const value=bike[key];
            if (readonly && value == null) return `<p>${message(title)} ${message('Not recorded')}</p>`;
            return label(title,`<input type="range" name="${key}" min="0" max="100" value="${esc(value ?? 50)}"
                data-condition ${readonly ? 'disabled' : ''}><output data-condition-value></output>`);
        }).join('') + '</div>';
    }

    function bindConditions(container) {
        container.querySelectorAll('[data-condition]').forEach(input=>{
            const repaint=()=>{
                const value=Number(input.value);
                const [color,text]=direction(value);
                const output=input.nextElementSibling;
                output.className=color;
                output.innerHTML=`<bdi>${value}%</bdi> · ${message(text)}`;
            };
            input.addEventListener('input',repaint);
            repaint();
        });
    }

    function overallLine(row) {
        if (row.overall_pct == null) return '';
        const [color]=direction(Number(row.overall_pct));
        return `<small class="overall-condition ${color}">${message('Overall Condition')} <bdi>${Number(row.overall_pct)}%</bdi>
            <meter min="0" max="100" value="${Number(row.overall_pct)}"></meter></small>`;
    }

    function showSaleCondition(container,bike,afterChange) {
        container.innerHTML=bike ? conditionFields(bike,true)+`<button type="button" data-update-condition>Update Condition</button>` : '';
        if (!bike) return;
        bindConditions(container);
        container.querySelector('[data-update-condition]').addEventListener('click',()=>{
            showDialog('Update Condition',`<form id="bikeConditionForm" class="form-grid">${conditionFields(bike)}${submit('Save Condition')}</form>`);
            const form=$('#bikeConditionForm');
            bindConditions(form);
            saveForm(form,async fields=>{
                Object.assign(bike,await request('/bikes/'+bike.id+'/condition',{method:'PATCH',body:fields}));
                closeDialog();
                if (container.isConnected) afterChange();
            });
        });
    }

    async function bikeExpenses(bike) {
        const target=$('#bikeExpenseDetails');
        if (!target) return;
        const rows=await request('/bikes/'+bike.id+'/expenses');
        if (!target.isConnected) return;
        const update=()=>target.innerHTML=panel('Bike Expenses',table(rows,[['Date','date'],['Expense name','name'],['Amount','amount','money']]));
        update();
        const form=$('#bikeExpenseForm');
        if (!form) return;
        saveForm(form,async (fields,key)=>{
            const result=await request('/bikes/'+bike.id+'/expenses',{method:'POST',body:{...fields,request_key:key}});
            Object.assign(bike,result.bike);
            if (!rows.some(row=>row.id===result.expense.id)) rows.unshift(result.expense);
            update();
            updateBikeTotals(bike);
            form.reset();
            notice('Saved.',false,form.querySelector('.notice'));
        });
        const price=$('#bikePriceForm');
        saveForm(price,async fields=>{
            Object.assign(bike,await request('/bikes/'+bike.id+'/asking-price',{method:'PATCH',body:fields}));
            updateBikeTotals(bike);
            notice('Saved.',false,price.querySelector('.notice'));
        });
    }

    function updateBikeTotals(bike) {
        const target=$('#bikeExpenseTotals');
        if (!target) return;
        target.innerHTML=details([['Buy Price',format(bike.purchase_price)],['Total cost',format(bike.total_cost)],
            ['Best Sell Price',format(bike.sell_price)],...(can('profit')||can('buy') ? [['Expected profit',bike.sell_price == null ? null :
                (cents(bike.sell_price)-cents(bike.total_cost))/100,signedProfit]] : [])]);
    }

    function bikeExpenseControls(bike) {
        return `<div id="bikeExpenseTotals"></div><div id="bikeExpenseDetails"></div>` +
            (bike.status==='stock' && can('buy') ? `<form id="bikeExpenseForm" class="form-grid">
                ${input('date','Date',{type:'date',value:getData().today,required:true})}
                ${input('name','Expense name',{required:true,max:100})}${amount('amount','Amount',{required:true,min:.01})}
                ${accountField()}${submit('Add Expense')}</form><form id="bikePriceForm" class="form-grid">
                ${amount('sell_price','Best Sell Price',{initial:bike.sell_price ?? '',required:true,min:.01})}
                ${submit('Save Best Sell Price')}</form>` : '');
    }

    function partnerOptions(options,job={}) {
        return select('mechanic_id','Select Mechanic',options.mechanics.map(row=>[row.id,row.name]),job.mechanic_id,'Choose a mechanic',true) +
            select('referral_id','Select Workshop',options.workshops.map(row=>[row.id,row.name]),job.referral_id,'No referral workshop',true);
    }

    async function workshopExtras(job,updateJob) {
        const target=$('#jobPartsView');
        const [options,lines]=await Promise.all([request('/commission/options'),request('/workshop/'+job.id+'/parts')]);
        if (!target?.isConnected) return;
        const partner=options.workshops.find(row=>String(row.id)===String(job.referral_id));
        target.innerHTML=(partner ? details([['Referral Workshop',partner.name]]) : '') +
            panel('Job Parts',table(lines,[['Part Name','part_name'],['Quantity','quantity'],['Total price','revenue','money'],
                ...(can('commission') ? [['Commission Earned','commission','money'],['Bonus Earned','bonus','money']] : [])]),
                job.status==='cancelled' || job.status==='delivered' ? '' :
                    (lines.length ? '' : '<button type="button" data-job-partners>Select Mechanic / Workshop</button>')+
                    (job.mechanic_id ? '<button type="button" class="primary" data-add-job-part>Add Spare Part</button>' : ''));
        target.querySelector('[data-job-partners]')?.addEventListener('click',()=>{
            showDialog('Select Mechanic / Workshop',`<form id="jobPartnersForm" class="form-grid">${partnerOptions(options,job)}
                ${submit('Save changes')}</form>`);
            const form=$('#jobPartnersForm');
            form.elements.mechanic_id.required=true;
            saveForm(form,async fields=>updateJob(await request('/workshop/'+job.id+'/partners',{method:'PATCH',body:fields}),form));
        });
        target.querySelector('[data-add-job-part]')?.addEventListener('click',()=>addJobPart(job,options,updateJob));
    }

    function addJobPart(job,options,updateJob) {
        const hasRates=can('commission');
        const rate=Number(job.commission_rate ?? options.mechanics.find(row=>String(row.id)===String(job.mechanic_id))?.rate ?? 10);
        showDialog(hasRates?'Mechanic Commission?':'Add Spare Part',`<form id="jobPartForm" class="form-grid">
            ${select('part_id','Spare Parts',options.parts.map(row=>[row.id,row.name+' · '+row.quantity]),'','Choose a spare part',true)}
            ${label('Quantity','<input type="number" name="quantity" min="1" step="1" value="1" required>')}
            ${amount('unit_price','Unit sale price',{min:.01,required:true})}
            ${hasRates ? select('preset','Commission rate',[[10,'10%'],[15,'15%'],['custom','Custom %']],rate===10||rate===15?rate:'custom')+
                amount('commission_rate','Custom commission %',{initial:rate,max:100,required:true})+
                (job.referral_id ? amount('bonus_rate','Workshop Bonus %',{initial:job.bonus_rate ?? 10,max:100,required:true}) : '') : ''}
            <p class="calculation wide" aria-live="polite"></p>${submit('Save to Job Card')}</form>`);
        const form=$('#jobPartForm');
        form.elements.part_id.required=true;
        if (hasRates) form.elements.preset.required=true;
        const render=()=>{
            const total=cents(form.elements.unit_price.value)*Number(form.elements.quantity.value);
            let result=message('Parts Total')+' '+esc(format(total/100));
            if (hasRates) {
                const preset=form.elements.preset.value;
                form.elements.commission_rate.closest('label').hidden=preset!=='custom';
                form.elements.commission_rate.required=preset==='custom';
                if (preset!=='custom') form.elements.commission_rate.value=preset;
                const earned=(field,label)=> ' · '+message(label)+' '+esc(format(total/100))+' × '+esc(field.value)+'% = '+
                    esc(format(Math.round(total*Number(field.value)/100)/100));
                result+=earned(form.elements.commission_rate,'Commission Earned');
                if (form.elements.bonus_rate) result+=earned(form.elements.bonus_rate,'Bonus Earned');
            }
            form.querySelector('.calculation').innerHTML=result;
        };
        form.elements.part_id.addEventListener('change',()=>{
            const part=options.parts.find(row=>String(row.id)===form.elements.part_id.value);
            form.elements.quantity.max=part?.quantity ?? '';
            form.elements.unit_price.value=Number(part?.sell_price)>0?part.sell_price:'';
            render();
        });
        form.addEventListener('input',render);
        form.addEventListener('change',render);
        render();
        saveForm(form,async (fields,key)=>{
            delete fields.preset;
            const result=await request('/workshop/'+job.id+'/parts',{method:'POST',body:{...fields,request_key:key}});
            await updateJob(result.job,form);
        });
    }

    function openLedger(page) {
        return load(page,'/commission',rows=>{
            const mechanic=page==='mechanics';
            const kind=mechanic?'mechanic':'workshop';
            const other=button(mechanic?'Workshop Ledger':'Mechanic Ledger',mechanic?'workshop-ledger':'mechanics');
            const entries=rows.filter(row=>row.kind===kind);
            view.innerHTML=heading(page,other+exportLinks('commission')) + panel(mechanic?'Add Mechanic':'Add Referral Workshop',
                `<form id="newPartner" class="form-grid">${input('name',mechanic?'Mechanic Name':'Workshop Name',{required:true,max:100})}
                    ${mechanic ? amount('rate','Default Commission %',{initial:10,max:100,required:true}) :
                        input('owner','Owner',{required:true,max:100})}
                    ${input('phone','Phone',{type:'tel',max:24,required:!mechanic})}${submit('Save')}</form>`) +
                panel(mechanic?'Mechanic Ledger':'Workshop Ledger',table(entries,[
                    ['Name','name'],...(!mechanic?[['Owner','owner']]:[]),['Phone','phone'],[mechanic?'Total Jobs':'Total Referrals','jobs'],
                    ['Parts Quantity','quantity'],['Total Parts Sold','sales','money'],[mechanic?'Commission Earned':'Bonus Earned','earned','money'],
                    ['Paid','paid','money'],['Remaining','remaining','money'],['Actions',row=>Number(row.remaining)>0
                        ? `<button type="button" data-partner-pay="${row.id}">${mechanic?'Commission De Diya':'Bonus De Diya'}</button>` : '—']
                ]));
            saveForm($('#newPartner'),async (fields,key)=>{
                await request('/commission/'+(mechanic?'mechanics':'workshops'),{method:'POST',body:{...fields,request_key:key}});
                if (currentPage()===page) await openLedger(page);
            });
            view.querySelectorAll('[data-partner-pay]').forEach(control=>control.addEventListener('click',()=>{
                const row=entries.find(entry=>String(entry.id)===control.dataset.partnerPay);
                showDialog(mechanic?'Commission De Diya':'Bonus De Diya',details([['Name',row.name],['Remaining',format(row.remaining)]])+
                    `<form id="partnerPayForm" class="form-grid">${amount('amount','Amount',{initial:row.remaining,required:true,min:.01,max:row.remaining})}
                        ${accountField()}${submit('Save Payment')}</form>`);
                saveForm($('#partnerPayForm'),async (fields,key)=>{
                    await request('/commission/'+kind+'/'+row.id+'/payments',{method:'POST',body:{...fields,request_key:key}});
                    closeDialog();
                    if (currentPage()===page) await openLedger(page);
                });
            }));
        });
    }

    function userFields(row) {
        return input('name','Name',{value:row?.name,required:true,max:100})+
            input('phone','Phone',{value:row?.phone,type:'tel',max:24})+
            input('username','Username',{value:row?.username,required:true,max:40})+
            input('password',row?'New password (optional)':'Password',{type:'password',required:!row,max:72,extra:'minlength="8" autocomplete="new-password"'})+
            input('role','Role',{value:row?.role,required:true,max:40})+
            (row?select('active','Status',[[1,'Active'],[0,'Inactive']],row.active?1:0):'');
    }

    function openUsers() {
        return load('users','/users',rows=>{
            const admin=getData().user.admin;
            view.innerHTML=heading('users',admin?button('Rules Router','rules'):'')+
                (can('users')?panel('Naya User Banao',`<form id="newUserForm" class="form-grid">${userFields()}${submit('Save User')}</form>`):'')+
                panel('Users',table(rows,[['Name','name'],['Phone','phone'],['Username','username'],['Role','role'],
                    ['Status',row=>message(row.active?'Active':'Inactive')],['Actions',row=>row.id && String(row.id)!==String(getData().user.id)
                        ? `<div class="actions">${admin?`<button type="button" data-user-edit="${row.id}">Edit</button>`:''}
                            ${can('delete')?`<button type="button" data-user-remove="${row.id}">Delete</button>`:''}</div>`:'—']]));
            if ($('#newUserForm')) saveForm($('#newUserForm'),async (fields,key)=>{
                await request('/users',{method:'POST',body:{...fields,request_key:key}});
                if (currentPage()==='users') await openUsers();
            });
            view.querySelectorAll('[data-user-edit],[data-user-remove]').forEach(control=>control.addEventListener('click',()=>{
                const row=rows.find(item=>String(item.id)===(control.dataset.userEdit || control.dataset.userRemove));
                const removing=control.hasAttribute('data-user-remove');
                showDialog(removing?'Delete':'Edit',`<form id="manageUserForm" class="form-grid">
                    ${removing?details([['Username',row.username]]):userFields(row)}${submit(removing?'Delete User':'Save User')}</form>`);
                const form=$('#manageUserForm');
                if (!removing) form.elements.active.required=true;
                saveForm(form,async fields=>{
                    await request('/users/'+row.id, removing ? {method:'DELETE'} : {method:'PATCH',body:{...fields,active:fields.active==='1'}});
                    closeDialog();
                    if (currentPage()==='users') await openUsers();
                });
            }));
        });
    }

    function openRules() {
        return load('rules','/users',rows=>{
            const current=rows.find(row=>String(row.id)===String(selectedUser)) || rows[0];
            if (!current) return;
            selectedUser=current.id;
            const userList=rows.map(row=>`<button type="button" data-rule-user="${row.id}" data-verbatim
                aria-pressed="${row.id===current.id}">${esc(row.name)} · ${esc(row.username)}</button>`).join('');
            const switches=Object.entries(grants).map(([key,title])=>`<label class="permission-row">
                ${message(title)}<input type="checkbox" role="switch" name="${key}"
                    ${current.permissions.includes(key)?'checked':''} ${current.admin || key==='capital'?'disabled':''}></label>`).join('');
            view.innerHTML=heading('rules',button('Users','users'))+`<div class="rules-grid"><section class="panel rules-users"><h2>Users</h2>${userList}</section>
                <section class="panel"><h2 data-verbatim>${esc(current.name)}</h2><form id="rulesForm" class="rules-form">${switches}
                ${current.admin?'<p class="empty">Admin permissions are always on.</p>':
                    '<div class="actions"><button type="button" data-rule-all="on">Sab ON Karo</button><button type="button" data-rule-all="off">Sab OFF Karo</button></div>'+
                    submit('Save Permissions')}</form></section></div>`;
            view.querySelectorAll('[data-rule-user]').forEach(control=>control.addEventListener('click',()=>{
                selectedUser=control.dataset.ruleUser;
                openRules().catch(ui.showPageError);
            }));
            if (current.admin) return;
            const form=$('#rulesForm');
            form.querySelectorAll('[data-rule-all]').forEach(control=>control.addEventListener('click',()=>{
                form.querySelectorAll('input:not(:disabled)').forEach(box=>{box.checked=control.dataset.ruleAll==='on';});
            }));
            saveForm(form,async fields=>{
                await request('/users/'+current.id+'/permissions',{method:'PUT',body:{permissions:Object.keys(fields)}});
                try { localStorage.setItem('kb-permissions-updated',String(Date.now())); } catch {}
                notice('Saved.',false,form.querySelector('.notice'));
            });
        });
    }

    const investmentMethods={bank:'Bank',cash:'Cash',western_union:'Western Union'};
    function openCapital() {
        return load('capital','/capital'+(year?'?year='+year:''),report=>{
            year=report.year;
            const rows=report.investments.map(row=>({...row,method:row.opening?'Opening Capital':investmentMethods[row.method]}));
            const form=`<form id="investmentForm" class="form-grid">
                ${input('date','Date',{type:'date',value:getData().today,required:true})}${amount('amount','Amount',{required:true,min:.01})}
                ${input('note','Note',{max:250})}${select('method','Method',Object.entries(investmentMethods),'bank')}
                ${submit('Save Investment')}</form>`;
            view.innerHTML=heading('capital')+metrics([['Total Investment',format(report.total.investment)],
                ['Total Profit',format(report.total.profit)],['Total Capital + Profit',format(report.total.funds)]])+
                panel('Naya Investment Add Karo',form)+panel('Investments',table(rows,[['Date','date'],['Amount','amount','money'],
                    ['Note','note'],['Method',row=>message(row.method)],['Running Total','running_total','money']]))+
                panel('Monthly Investment vs Profit',chartMarkup('capitalChart',report.months,capitalSeries)+
                    table(report.months,[['Month',row=>esc(row.day.slice(0,7))],['Investment','investment','money'],['Profit','profit','money']]),
                    label('Year',`<input id="capitalYear" type="number" min="1900" max="${getData().today.slice(0,4)}" step="1" value="${report.year}">`))+
                panel('Year Summary',metrics([['Total Investment',format(report.year.investment)],['Total Profit',format(report.year.profit)],
                    ['Profit %',report.year.return_rate==null?'—':Number(report.year.return_rate).toFixed(1)+'%'],['Total Paisa',format(report.year.funds)]]));
            $('#capitalYear').addEventListener('change',event=>{
                if (!event.target.validity.valid || !event.target.value) return;
                year=Number(event.target.value); openCapital().catch(ui.showPageError);
            });
            $('#investmentForm').elements.method.required=true;
            saveForm($('#investmentForm'),async (fields,key)=>{
                await request('/capital',{method:'POST',body:{...fields,request_key:key}});
                if (currentPage()==='capital') await openCapital();
            });
            window.kbDailyChart.draw($('#capitalChart'),report.months,{series:capitalSeries,mode:'bars',monthly:true});
        });
    }

    const capitalSeries=[{field:'investment',title:'Investment',color:'#5c9ff9'},{field:'profit',title:'Profit',color:'#28b779'}];
    const graphs=[
        {id:'salesChart',title:'Sale vs Expense vs Profit',mode:'bars',series:[
            {field:'sale',title:'Sale',color:'#28b779'}, {field:'expense',title:'Expense',color:'#e45d6a'},
            {field:'profit',title:'Profit',color:'#5c9ff9',permission:'profit'}]},
        {id:'workshopChart',title:'Spare Parts Sale vs Workshop Income',mode:'lines',series:[
            {field:'part_sales',title:'Spare Parts Sale',color:'#28b779',permission:'parts'},
            {field:'workshop_income',title:'Workshop Income',color:'#5c9ff9',permission:'workshop'}]},
        {id:'commissionChart',title:'Mechanic Commission vs Workshop Bonus',mode:'bars',series:[
            {field:'commission',title:'Mechanic Commission',color:'#5c9ff9',permission:'commission'},
            {field:'bonus',title:'Workshop Bonus',color:'#f5a34d',permission:'commission'}]},
        {id:'bikeChart',title:'Bike Buy Cost vs Sell Price',mode:'bars',series:[
            {field:'bike_cost',title:'Total cost',color:'#f5a34d'},{field:'bike_price',title:'Sell Price',color:'#28b779'}]}
    ];

    function chartMarkup(id,rows,series) {
        const legend=series.map(item=>`<li><i class="chart-key chart-${item.field}" aria-hidden="true"></i>${message(item.title)}</li>`).join('');
        return `<ul class="chart-legend chart-legend-series ${id}-legend">${legend}</ul>
            <canvas id="${id}" class="report-chart" role="img" aria-label="Daily comparison chart"></canvas>`+
            `<details class="chart-values"><summary>View chart data</summary>${table(rows,[['Date','day'],
                ...series.map(({title,field})=>[title,field,'money'])])}</details>`;
    }

    function weekComparison(weeks,series) {
        const total=(items,key)=>items.reduce((value,row)=>value+cents(row[key]),0);
        const percent=new Intl.NumberFormat(document.documentElement.lang,{style:'percent',maximumFractionDigits:1});
        return '<ul class="week-change">'+series.map(({field,title})=>{
            const previous=total(weeks.slice(0,7),field);
            const change=total(weeks.slice(7),field)-previous;
            const label=(change>0?'↑ ':change<0?'↓ ':'→ ')+(previous||!change?percent.format(Math.abs(change)/(Math.abs(previous)||1)):'—');
            return `<li>${message(title)} <bdi>${esc(label)}</bdi></li>`;
        }).join('')+'</ul>';
    }

    function dashboardCharts() {
        return panel('Dashboard Graphs',`<div class="actions chart-filters">
            ${[['today','Today'],['7','7 Days'],['30','30 Days'],['all','All Time']].map(([id,name])=>
                `<button type="button" data-main-chart-range="${id}" aria-pressed="${chartRange===id}">${name}</button>`).join('')}
            </div><div id="businessGraphs" class="graph-grid"><p class="empty" role="status">Loading…</p></div>`);
    }

    function bindDashboardCharts() {
        const target=$('#businessGraphs');
        if (!target) return;
        const shell=target.closest('.panel');
        let revision=0;
        async function draw() {
            const chosen=chartRange;
            const expected=++revision;
            const result=await request('/dashboard/charts?range='+chosen);
            if (!target.isConnected || expected!==revision) return;
            const cards=graphs.map(graph=>({...graph,series:graph.series.filter(item=>!item.permission||can(item.permission))}))
                .filter(graph=>graph.series.length);
            const capital=$('#dashboardInvestment');
            if (capital && result.investment!=null) capital.textContent=format(result.investment);
            target.innerHTML=cards.map(graph=>panel(graph.title,chartMarkup(graph.id,result.rows,graph.series)+
                `<p class="weekly-title" data-message>This week vs Previous week</p>`+weekComparison(result.weeks,graph.series))).join('');
            for (const graph of cards) window.kbDailyChart.draw($('#'+graph.id),result.rows,
                {series:graph.series,mode:graph.mode,monthly:chosen==='all'});
        }
        shell.querySelectorAll('[data-main-chart-range]').forEach(control=>control.addEventListener('click',()=>{
            chartRange=control.dataset.mainChartRange;
            shell.querySelectorAll('[data-main-chart-range]').forEach(button=>button.setAttribute('aria-pressed',String(control===button)));
            draw().catch(ui.showPageError);
        }));
        draw().catch(ui.showPageError);
    }

    function settingsLinks() {
        return (allowedPage('users')?button('Users','users'):'')+(allowedPage('rules')?button('Rules Router','rules'):'')+
            (allowedPage('capital')?button('Capital / Investment','capital'):'');
    }

    return { conditionFields,bindConditions,overallLine,showSaleCondition,bikeExpenses,bikeExpenseControls,updateBikeTotals,
        partnerOptions,workshopExtras,openLedger,openUsers,openRules,openCapital,dashboardCharts,bindDashboardCharts,settingsLinks };
};
