'use strict';

window.kbBusinessPages = function businessPages(ui) {
    const {$,view,esc,request,input,amount,select,table,panel,heading,submit,button,saveForm,showDialog,
        details,notice,format,metrics,message,signedProfit,currentPage,showPageError,accountField,closeDialog,signInView} = ui;
    const accounts = {cash:'Cash',bank:'Bank',wallet:'Mobile Wallet',unassigned:'Unassigned'};
    const accountName = value => message(accounts[value || 'unassigned']);
    const accountColumn = ['Payment account',row=>accountName(row.account)];
    const dateColumn = ['Date','date'];
    const amountColumn = ['Amount','amount','money'];
    const history = {
        'bike-expenses':[dateColumn,['Bike ID','bike_id'],['Expense name','name'],amountColumn,accountColumn],
        'part-sales':[dateColumn,['Part ID','part_id'],['Quantity','quantity'],['Unit sale price','unit_price','money'],['Salesman','salesman'],accountColumn],
        'qist-payments':[dateColumn,['Qist ID','qist_id'],amountColumn,accountColumn],
        'workshop-payments':[dateColumn,['Job ID','job_id'],amountColumn,accountColumn],
        'job-parts':[dateColumn,['Job ID','job_id'],['Part Name','part_name'],['Quantity','quantity'],['Total price','revenue','money']],
        'commission-payments':[dateColumn,['Mechanic ID','mechanic_id'],['Workshop ID','referral_id'],amountColumn,accountColumn],
        'day-closings':[dateColumn,['Opening Balance','opening_balance','money'],['Total Income','total_income','money'],
            ['Expense','expense','money'],['Closing Balance','closing_balance','money']],
        'supplier-payments':[dateColumn,['Bill ID','bill_id'],amountColumn,accountColumn],
        'cash-openings':[dateColumn,accountColumn,amountColumn,['Note','note']],
        'workshop-cancellations':[dateColumn,['Job ID','job_id'],['Reason','reason'],['Refund','refund','money'],
            ['Refund account',row=>row.refund_account ? accountName(row.refund_account) : '—']],
        'part-returns':[['Cancellation ID','cancellation_id'],['Job Part ID','line_id'],['Quantity Returned','quantity']],
        'activity-log':[['Time','recorded_at'],['User','actor'],['Action','action'],['Record Type','resource'],
            ['Record ID','record_id'],['Changed Fields','fields'],['Reason','reason']]
    };

    async function load(page,path,render) {
        view.innerHTML = heading(page) + '<p class="empty" role="status">Loading…</p>';
        const placeholder = view.lastElementChild;
        const value = await request(path);
        if (placeholder.isConnected) render(value);
    }

    function openHistory(page,num = 1) {
        return load(page,'/records/'+page+'?page='+num,({rows,next})=>{
            view.innerHTML = heading(page) + panel('Records',table(rows,history[page]) +
                `<div class="actions record-pagination"><button id="previousRecords" type="button" ${num===1 ? 'disabled' : ''}>Previous</button>
                <span data-verbatim>${num}</span><button id="nextRecords" type="button" ${next ? '' : 'disabled'}>Next</button></div>`);
            $('#previousRecords').addEventListener('click',()=>openHistory(page,num-1).catch(showPageError));
            $('#nextRecords').addEventListener('click',()=>openHistory(page,num+1).catch(showPageError));
        });
    }

    function openCashbook(query = '') {
        const page = 'cashbook';
        return load(page,'/finance/cashbook'+query,({balances,movements,from,to})=>{
            view.innerHTML = heading(page,button('Account Openings','cash-openings')) +
                metrics(balances.map(row=>[accounts[row.account],format(row.amount)])) +
                panel('Cash and bank statement',`<form id="cashRange" class="form-grid">
                    ${input('from','From date',{type:'date',value:from,required:true})}${input('to','To date',{type:'date',value:to,required:true})}
                    ${submit('Apply Filters')}</form>` +
                    '<p class="daily-report-note" data-message>Unassigned entries are payments with no recorded account. The statement shows up to 500 entries per date range.</p>' +
                    table(movements,[dateColumn,['Source',row=>message(row.source)],accountColumn,
                        ['Amount',row=>signedProfit(Number(row.amount)),'money']])) +
                panel('Set Account Opening',`<form id="cashOpeningForm" class="form-grid">
                    <p class="wide" data-message>Enter the balance at the start of the selected day, before that day’s transactions.</p>
                    ${accountField()}${input('date','Date',{type:'date',value:to,required:true})}
                    ${amount('amount','Opening Balance',{required:true,max:999999999999.99})}${input('note','Note',{required:true,max:250})}
                    ${submit('Save')}</form>`);
            saveForm($('#cashRange'),fields=>openCashbook('?'+new URLSearchParams(fields)));
            saveForm($('#cashOpeningForm'),async (fields,key)=>{
                await request('/finance/openings',{method:'POST',body:{...fields,request_key:key}});
                if (currentPage()===page) await openCashbook(query);
                notice('Saved.');
            });
        });
    }

    function openSuppliers() {
        const page = 'supplier-ledger';
        return load(page,'/finance/suppliers',({bills,balance,suppliers,parts})=>{
            view.innerHTML = heading(page,button('Supplier Payments','supplier-payments')) +
                metrics([['Total Supplier Balance',format(balance)]]) +
                panel('Add Supplier Bill',`<form id="supplierBillForm" class="form-grid">
                    ${select('supplier_id','Supplier Name',suppliers.map(row=>[row.id,row.name]),'','Choose supplier',true)}
                    ${input('description','Invoice or description',{required:true,max:250})}
                    ${input('date','Date',{type:'date'})}${amount('amount','Amount',{required:true,min:.01,max:999999999999.99})}
                    ${select('part_id','Spare part received',parts.map(row=>[row.id,row.name+' · '+row.sku]),'','No stock received',true)}
                    ${input('quantity','Quantity',{type:'number',min:1,max:2147483647})}
                    ${submit('Save Bill')}</form>`) +
                panel('Supplier Bills',table(bills,[dateColumn,['Supplier Name','supplier'],['Description','description'],['Part Name','part'],
                    ['Quantity','quantity'],amountColumn,['Paid','paid','money'],['Remaining','remaining','money'],
                    ['Action',row=>Number(row.remaining)>0 ? `<button type="button" data-pay-bill="${esc(row.id)}">Record Payment</button>` : message('Fully Paid')]]));
            const form = $('#supplierBillForm');
            form.elements.supplier_id.required = true;
            form.elements.quantity.step = '1';
            const sync = ()=>{
                form.elements.quantity.required = Boolean(form.elements.part_id.value);
                form.elements.quantity.disabled = !form.elements.part_id.value;
            };
            form.elements.part_id.addEventListener('change',sync);
            sync();
            saveForm(form,async (fields,key)=>{
                await request('/finance/suppliers/bills',{method:'POST',body:{...fields,request_key:key}});
                if (currentPage()===page) await openSuppliers();
                notice('Saved.');
            });
            view.querySelectorAll('[data-pay-bill]').forEach(control=>control.addEventListener('click',()=>{
                const bill = bills.find(row=>String(row.id)===control.dataset.payBill);
                showDialog('Record Payment',details([['Supplier Name',bill.supplier],['Remaining',format(bill.remaining)]]) +
                    `<form id="paySupplier" class="form-grid">${amount('amount','Amount',{required:true,min:.01,max:bill.remaining})}
                    ${accountField()}${submit('Save Payment')}</form>`);
                saveForm($('#paySupplier'),async (fields,key)=>{
                    await request('/finance/suppliers/bills/'+bill.id+'/payments',{method:'POST',body:{...fields,request_key:key}});
                    closeDialog();
                    if (currentPage()===page) await openSuppliers();
                    notice('Saved.');
                });
            }));
        });
    }

    async function cancelJob(job,updateJob) {
        const rows = await request('/workshop/'+job.id+'/parts');
        if (!$('#cancelWorkshop')) return;
        const refund = Number(job.paid_amount);
        showDialog('Cancel Job',details([['Bike Model',job.bike_name],['Refund',format(refund)]]) +
            `<form id="cancelJobForm" class="form-grid">
                ${input('reason','Reason',{required:true,max:250})}
                ${refund ? accountField('refund_account','Refund account') : ''}
                ${rows.map(row=>input('return_'+row.id,'Return unused parts: '+row.part_name,
                    {type:'number',value:0,max:row.quantity,required:true})).join('')}
                <p class="wide" data-message>Confirm the actual refund and enter only the unused quantities returned to stock. Commission and referral bonus for the cancelled job will be reversed.</p>
                ${submit('Confirm Cancellation')}</form>`);
        const form = $('#cancelJobForm');
        for (const control of form.querySelectorAll('[name^="return_"]')) control.step = '1';
        saveForm(form,async (fields,key)=>{
            const returns = Object.fromEntries(rows.map(row=>[row.id,Number(fields['return_'+row.id])]));
            const result = await request('/workshop/'+job.id+'/cancel',{method:'POST',body:{
                expected:job.status,refund,refund_account:fields.refund_account,reason:fields.reason,returns,request_key:key
            }});
            await updateJob(result,form,true);
        });
    }

    const passwordField = (name,title,autocomplete='current-password') =>
        input(name,title,{type:'password',required:true,max:72,extra:`autocomplete="${autocomplete}"`});
    const codeField = () => input('code','Authenticator or recovery code',{required:true,max:24,extra:'autocomplete="one-time-code"'});

    function openSecurity() {
        return load('security','/security',({enabled})=>{
            const credential = passwordField('password','Current password');
            view.innerHTML = heading('security') +
                panel('Change Password',`<form id="changeAdminPassword" class="form-grid">${credential}
                    ${passwordField('new_password','New password','new-password')}${enabled ? codeField() : ''}
                    ${submit('Change Password')}</form>`) +
                panel('Two-step verification',enabled ? `<form id="disableMfa" class="form-grid"><p class="wide" data-message>Two-step verification is enabled.</p>
                    ${credential}${codeField()}${submit('Disable Two-step Verification')}</form>`
                    : `<form id="startMfa" class="form-grid">${credential}${submit('Set Up Authenticator')}</form>`);
            saveForm($('#changeAdminPassword'),async fields=>{
                await request('/security/password',{method:'POST',body:fields});
                signInView();
                notice('Password changed. Sign in again.',false,$('#loginStatus'));
            });
            const start = $('#startMfa');
            if (!start) {
                saveForm($('#disableMfa'),async fields=>{
                    await request('/security/mfa/disable',{method:'POST',body:fields});
                    signInView();
                    notice('Sign in again to continue.',false,$('#loginStatus'));
                });
                return;
            }
            saveForm(start,async fields=>{
                const setup = await request('/security/mfa/start',{method:'POST',body:fields});
                start.reset();
                showDialog('Set Up Authenticator',`<p data-message>Add a time-based account in your authenticator app and enter this setup key.</p>
                    <p><code class="auth-key" dir="ltr">${esc(setup.key)}</code></p>
                    <form id="enableMfa" class="form-grid">${credential}${codeField()}${submit('Enable Two-step Verification')}</form>`);
                saveForm($('#enableMfa'),async values=>{
                    const result = await request('/security/mfa/enable',{method:'POST',body:{...values,token:setup.token}});
                    showDialog('Recovery Codes',`<p data-message>Keep these codes somewhere safe. Each code works only once.</p>
                        <ul class="recovery-codes" dir="ltr">${result.recoveryCodes.map(code=>`<li><code>${esc(code)}</code></li>`).join('')}</ul>
                        <button type="button" id="finishMfa">Sign in again</button>`);
                    $('#finishMfa').addEventListener('click',signInView);
                });
            });
        });
    }

    const special = {cashbook:openCashbook,'supplier-ledger':openSuppliers,security:openSecurity};
    return {
        hasPage:page=>Object.hasOwn(history,page)||Object.hasOwn(special,page),
        open:page=>Object.hasOwn(special,page) ? special[page]() : openHistory(page),
        cancelJob
    };
};
