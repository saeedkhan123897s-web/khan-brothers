(function () {
    'use strict';

    const byId = id => document.getElementById(id);
    const toastElement = byId('purchaseToast');
    let toastTimer;

    function escapeHTML(value) {
        return String(value ?? '').replace(/[&<>"']/g, character => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        })[character]);
    }

    function money(value) {
        return `PKR ${new Intl.NumberFormat('en-PK', {minimumFractionDigits: 2, maximumFractionDigits: 2}).format(Number(value) || 0)}`;
    }

    function dateLabel(value) {
        if (!value) return '—';
        const parsed = new Date(value);
        return Number.isNaN(parsed.getTime()) ? String(value) : new Intl.DateTimeFormat(undefined, {dateStyle: 'medium'}).format(parsed);
    }

    function showToast(message, isError = false) {
        if (!toastElement) return;
        toastElement.textContent = message;
        toastElement.classList.toggle('is-error', isError);
        toastElement.classList.add('is-visible');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => toastElement.classList.remove('is-visible'), 3800);
    }

    async function request(url, options = {}) {
        const headers = {...(options.headers || {}), Accept: 'application/json'};
        if (options.body !== undefined) headers['Content-Type'] = 'application/json';
        const response = await fetch(url, {...options, headers, credentials: 'same-origin'});
        const payload = await response.json().catch(() => ({}));
        if (response.status === 401) {
            window.location.replace('/admin/login.html');
            const error = new Error('Please sign in to continue.');
            error.authRedirect = true;
            throw error;
        }
        if (!response.ok || payload.success === false) {
            throw new Error(payload.message || payload.error || `Request failed (${response.status})`);
        }
        return payload;
    }

    async function getProfile() {
        const payload = await request('/api/auth/me');
        setSidebarUser(payload.data);
        for (const element of document.querySelectorAll('[data-purchase-access]')) {
            element.hidden = !Admin.can(payload.data, element.dataset.purchaseAccess, Admin.finance);
        }
        return payload.data;
    }

    function statusClass(status) {
        return `purchase-badge purchase-badge--${String(status || '').toLowerCase().replace(/[^a-z0-9_-]/g, '')}`;
    }

    function statusLabel(status) {
        return String(status || 'unknown').replaceAll('_', ' ').replace(/\b\w/g, character => character.toUpperCase());
    }

    async function initPurchaseList() {
        const tableBody = byId('purchaseRows');
        const pagination = byId('purchasePagination');
        const filterForm = byId('purchaseFilters');
        const dialog = byId('purchaseDialog');
        const detailRoot = byId('purchaseDetails');
        let page = 1;
        let profile;

        try {
            profile = await getProfile();
        } catch (error) {
            if (!error.authRedirect) showToast(error.message, true);
            return;
        }

        async function loadPurchases() {
            tableBody.innerHTML = '<tr><td class="purchase-empty" colspan="8">Loading purchases…</td></tr>';
            const params = new URLSearchParams({page: String(page), limit: '100'});
            const search = byId('purchaseSearch').value.trim();
            const status = byId('purchaseStatus').value;
            const paymentStatus = byId('purchasePaymentStatus').value;
            if (search) params.set('search', search);
            if (status) params.set('status', status);
            if (paymentStatus) params.set('payment_status', paymentStatus);

            try {
                const payload = await request(`/api/purchases?${params}`);
                const purchases = Array.isArray(payload.data) ? payload.data : [];
                const meta = payload.pagination || {total: purchases.length, page: 1, totalPages: 1};
                const count = byId('purchaseCount');
                const pending = byId('pendingCount');
                const received = byId('receivedCount');
                const due = byId('purchaseDue');
                if (count) count.textContent = new Intl.NumberFormat().format(Number(meta.total) || 0);
                if (pending) pending.textContent = new Intl.NumberFormat().format(purchases.filter(item => ['pending', 'partial'].includes(item.status)).length);
                if (received) received.textContent = new Intl.NumberFormat().format(purchases.filter(item => item.status === 'received').length);
                if (due) due.textContent = money(purchases.reduce((sum, item) => sum + Number(item.amount_due || 0), 0));

                if (!purchases.length) {
                    tableBody.innerHTML = '<tr><td class="purchase-empty" colspan="8">No purchases found. Create a purchase order to get started.</td></tr>';
                } else {
                    const canManage = Admin.can(profile, 'purchases.manage', Admin.management);
                    tableBody.innerHTML = purchases.map(item => {
                        const actions = [`<button type="button" data-action="view" data-id="${Number(item.id)}">Details</button>`];
                        if (canManage && ['pending', 'partial'].includes(item.status)) actions.push(`<button type="button" data-action="receive" data-id="${Number(item.id)}">Receive</button>`);
                        if (canManage && item.status === 'pending' && Number(item.amount_paid || 0) === 0) actions.push(`<button type="button" data-action="cancel" data-id="${Number(item.id)}">Cancel</button>`);
                        return `<tr>
                            <td><strong>${escapeHTML(item.purchase_number)}</strong><small>${escapeHTML(item.payment_status ? statusLabel(item.payment_status) : '')} payment</small></td>
                            <td>${escapeHTML(item.supplier_name || 'Unlinked supplier')}${item.supplier_phone ? `<small>${escapeHTML(item.supplier_phone)}</small>` : ''}</td>
                            <td>${escapeHTML(dateLabel(item.purchase_date))}</td>
                            <td>${money(item.total_amount)}</td>
                            <td>${money(item.amount_paid)}</td>
                            <td>${money(item.amount_due)}</td>
                            <td><span class="${statusClass(item.status)}">${escapeHTML(statusLabel(item.status))}</span></td>
                            <td><div class="purchase-row-actions">${actions.join('')}</div></td>
                        </tr>`;
                    }).join('');
                }
                pagination.innerHTML = `<span>Page ${Number(meta.page) || 1} of ${Math.max(1, Number(meta.totalPages) || 1)} · ${Number(meta.total) || 0} orders</span>
                    <div class="purchase-pagination__controls"><button type="button" data-page="${Math.max(1, page - 1)}" ${page <= 1 ? 'disabled' : ''}>Previous</button><button type="button" data-page="${page + 1}" ${page >= (Number(meta.totalPages) || 1) ? 'disabled' : ''}>Next</button></div>`;
            } catch (error) {
                if (!error.authRedirect) {
                    tableBody.innerHTML = `<tr><td class="purchase-empty" colspan="8">${escapeHTML(error.message)} <button type="button" data-retry>Try again</button></td></tr>`;
                    showToast(error.message, true);
                }
            }
        }

        function renderPurchaseDetails(purchase) {
            byId('purchaseDialogTitle').textContent = purchase.purchase_number || 'Purchase details';
            const items = Array.isArray(purchase.items) ? purchase.items : [];
            const payments = Array.isArray(purchase.payments) ? purchase.payments : [];
            detailRoot.innerHTML = `
                <div class="purchase-detail-grid">
                    <div><span>Supplier</span><strong>${escapeHTML(purchase.supplier_name || 'Unlinked supplier')}</strong></div>
                    <div><span>Purchase date</span><strong>${escapeHTML(dateLabel(purchase.purchase_date))}</strong></div>
                    <div><span>Status</span><strong>${escapeHTML(statusLabel(purchase.status))}</strong></div>
                    <div><span>Order total</span><strong>${money(purchase.total_amount)}</strong></div>
                    <div><span>Paid</span><strong>${money(purchase.amount_paid)}</strong></div>
                    <div><span>Due</span><strong>${money(purchase.amount_due)}</strong></div>
                </div>
                <div class="purchase-table-wrap"><table class="purchase-table purchase-table--items"><thead><tr><th>Product</th><th>Ordered</th><th>Received</th><th>Cost</th><th>Subtotal</th></tr></thead>
                    <tbody>${items.length ? items.map(item => `<tr><td>${escapeHTML(item.product_name || 'Product')}</td><td>${Number(item.quantity) || 0}</td><td>${Number(item.received_quantity) || 0}</td><td>${money(item.cost_price)}</td><td>${money(item.subtotal)}</td></tr>`).join('') : '<tr><td class="purchase-empty" colspan="5">No line items.</td></tr>'}</tbody></table></div>
                ${purchase.notes ? `<p class="purchase-detail-note">${escapeHTML(purchase.notes)}</p>` : ''}
                ${payments.length ? `<h3 class="purchase-detail-subheading">Payments</h3><div class="purchase-table-wrap"><table class="purchase-table purchase-table--items"><thead><tr><th>Date</th><th>Method</th><th>Amount</th><th>Reference</th></tr></thead><tbody>${payments.map(payment => `<tr><td>${escapeHTML(dateLabel(payment.payment_date))}</td><td>${escapeHTML(statusLabel(payment.payment_method))}</td><td>${money(payment.amount)}</td><td>${escapeHTML(payment.payment_number || '—')}</td></tr>`).join('')}</tbody></table></div>` : ''}
                <div class="purchase-detail-actions"><button class="purchase-button purchase-button--quiet" type="button" data-close-dialog>Close</button></div>`;
        }

        tableBody.addEventListener('click', async event => {
            const button = event.target.closest('button');
            if (!button) return;
            if (button.hasAttribute('data-retry')) return loadPurchases();
            const id = Number(button.dataset.id);
            const action = button.dataset.action;
            if (!id || !action) return;
            button.disabled = true;
            try {
                if (action === 'view') {
                    const payload = await request(`/api/purchases/${id}`);
                    renderPurchaseDetails(payload.data);
                    dialog.showModal();
                } else if (action === 'receive') {
                    if (!window.confirm('Receive all outstanding quantities for this purchase?')) return;
                    await request(`/api/purchases/${id}/receive`, {method: 'POST', body: JSON.stringify({})});
                    showToast('Purchase received and stock updated.');
                    await loadPurchases();
                } else if (action === 'cancel') {
                    if (!window.confirm('Cancel this unpaid purchase order?')) return;
                    await request(`/api/purchases/${id}/status`, {method: 'PATCH', body: JSON.stringify({status: 'cancelled'})});
                    showToast('Purchase order cancelled.');
                    await loadPurchases();
                }
            } catch (error) {
                if (!error.authRedirect) showToast(error.message, true);
            } finally {
                button.disabled = false;
            }
        });

        pagination.addEventListener('click', event => {
            const button = event.target.closest('[data-page]');
            if (!button || button.disabled) return;
            page = Number(button.dataset.page) || 1;
            loadPurchases();
        });
        filterForm.addEventListener('submit', event => { event.preventDefault(); page = 1; loadPurchases(); });
        byId('refreshPurchases').addEventListener('click', loadPurchases);
        dialog.addEventListener('click', event => {
            if (event.target === dialog || event.target.closest('[data-close-dialog]')) dialog.close();
        });
        const created = new URLSearchParams(window.location.search).get('created');
        if (created) showToast(`Purchase ${created} created successfully.`);
        await loadPurchases();
    }

    async function initNewPurchase() {
        const form = byId('newPurchaseForm');
        const supplierSelect = byId('purchaseSupplier');
        const productSelect = byId('purchaseProduct');
        const rows = byId('purchaseItemRows');
        const message = byId('purchaseFormMessage');
        const productsById = new Map();
        const productType = byId('purchaseProductType');
        const productSearch = byId('productSearch');
        const requestedType = new URLSearchParams(location.search).get('product_type');
        productType.value = ['part', 'motorcycle'].includes(requestedType) ? requestedType : '';
        let products = [];
        let searchTimer;
        let catalogueRequest = 0;
        let profile;
        let items = [];

        function setMessage(text, success = false) {
            message.textContent = text;
            message.classList.toggle('is-success', success);
        }

        function totals() {
            const subtotal = Math.round(items.reduce((sum, item) => sum + Number(item.quantity) * Number(item.cost_price), 0) * 100) / 100;
            const discount = Math.max(0, Number(byId('purchaseDiscount').value) || 0);
            const shipping = Math.max(0, Number(byId('purchaseShipping').value) || 0);
            const total = Math.max(0, subtotal - discount + shipping);
            const paid = Math.max(0, Number(byId('purchasePaid').value) || 0);
            byId('purchaseSubtotal').textContent = money(subtotal);
            byId('purchaseTotal').textContent = money(total);
            byId('purchaseBalance').textContent = money(Math.max(0, total - paid));
            return {subtotal, discount, shipping, total, paid};
        }

        function renderItems() {
            if (!items.length) {
                rows.innerHTML = '<tr><td class="purchase-empty" colspan="6">Add products to this purchase.</td></tr>';
                totals();
                return;
            }
            rows.innerHTML = items.map((item, index) => `<tr>
                <td><strong>${escapeHTML(item.name)}</strong></td><td>${escapeHTML(item.sku)}</td>
                <td><input aria-label="Quantity for ${escapeHTML(item.name)}" type="number" min="1" step="1" value="${Number(item.quantity)}" data-item-quantity="${index}"></td>
                <td><input aria-label="Unit cost for ${escapeHTML(item.name)}" type="number" min="0" step="0.01" value="${Number(item.cost_price).toFixed(2)}" data-item-cost="${index}"></td>
                <td>${money(Number(item.quantity) * Number(item.cost_price))}</td>
                <td><button class="purchase-row-actions__remove" type="button" data-remove-item="${index}">Remove</button></td>
            </tr>`).join('');
            totals();
        }

        function renderProductOptions() {
            const selected = productSelect.value;
            productSelect.innerHTML = '<option value="">Choose a product</option>' + products.map(product =>
                `<option value="${Number(product.id)}">${escapeHTML(product.name)} · ${escapeHTML(product.sku)}${product.product_type === 'motorcycle' ? ' · Motorcycle' : ''}</option>`).join('');
            if (products.some(product => String(product.id) === selected)) productSelect.value = selected;
            byId('purchaseProductResults').textContent = products.length ? '' : 'No matching products.';
        }

        async function loadProducts() {
            const requestId = ++catalogueRequest;
            const path = ERP.url('/api/products', { limit: 100, product_type: productType.value, motorcycle_condition: productType.value === 'motorcycle' ? 'new' : null, search: productSearch.value.trim() });
            const payload = await request(path);
            if (requestId !== catalogueRequest) return;
            products = payload.data.filter(product => product.motorcycle_condition !== 'used');
            productsById.clear();
            for (const product of products) productsById.set(Number(product.id), product);
            renderProductOptions();
        }

        function addItem() {
            const id = Number(productSelect.value);
            const product = productsById.get(id);
            const quantity = Number(byId('purchaseQuantity').value);
            const costInput = byId('purchaseCost');
            const cost = Number(costInput.value);
            if (!product) return setMessage('Choose a product first.');
            if (!Number.isInteger(quantity) || quantity < 1) return setMessage('Enter a quantity of at least 1.');
            if (!costInput.value || !Number.isFinite(cost) || cost < 0) return setMessage('Enter a valid unit cost.');
            const existing = items.find(item => item.product_id === id);
            if (existing && Number(existing.cost_price) !== cost) return setMessage('This product is already listed. Remove it before using a different unit cost.');
            if (existing) existing.quantity += quantity;
            else items.push({product_id: id, name: product.name, sku: product.sku, quantity, cost_price: cost});
            setMessage('Product added to the purchase.', true);
            byId('purchaseQuantity').value = '1';
            renderItems();
        }

        form.addEventListener('submit', async event => {
            event.preventDefault();
            const calculated = totals();
            if (!items.length) return setMessage('Add at least one product to continue.');
            if (calculated.discount > calculated.subtotal) return setMessage('Discount cannot exceed the item subtotal.');
            if (calculated.paid > calculated.total) return setMessage('Amount paid cannot exceed the purchase total.');
            const method = byId('purchaseMethod').value;
            if (calculated.paid > 0 && method === 'credit') return setMessage('Select the actual payment method for the amount paid.');
            const saveButton = byId('savePurchase');
            saveButton.disabled = true;
            setMessage('Saving purchase order…', true);
            try {
                const payload = await request('/api/purchases', {method: 'POST', body: JSON.stringify({
                    supplier_id: supplierSelect.value ? Number(supplierSelect.value) : null,
                    supplier_name: byId('purchaseSupplierName').value.trim() || undefined,
                    items: items.map(item => ({product_id: item.product_id, quantity: Number(item.quantity), cost_price: Number(item.cost_price)})),
                    discount_amount: calculated.discount,
                    shipping_cost: calculated.shipping,
                    amount_paid: calculated.paid,
                    payment_method: method,
                    notes: byId('purchaseNotes').value.trim() || null
                })});
                const created = payload.data?.purchase_number || '';
                if (Admin.can(profile, 'purchases.view', Admin.finance)) {
                    window.location.href = `purchase-list.html${created ? `?created=${encodeURIComponent(created)}` : ''}`;
                } else {
                    items = [];
                    form.reset();
                    renderItems();
                    setMessage('Purchase order saved: ' + created, true);
                }
            } catch (error) {
                if (!error.authRedirect) setMessage(error.message);
            } finally {
                saveButton.disabled = false;
            }
        });

        byId('addPurchaseItem').addEventListener('click', addItem);
        productSelect.addEventListener('change', () => {
            const product = productsById.get(Number(productSelect.value));
            byId('purchaseCost').value = product?.cost_price == null ? '' : Number(product.cost_price).toFixed(2);
        });
        function scheduleSearch() {
            clearTimeout(searchTimer);
            catalogueRequest++;
            products = [];
            productsById.clear();
            productSelect.replaceChildren(new Option('Searching…', ''));
            searchTimer = setTimeout(() => {
                loadProducts().catch(error => { if (!error.authRedirect) setMessage(error.message); });
            }, 200);
        }
        productSearch.addEventListener('input', scheduleSearch);
        productType.addEventListener('change', scheduleSearch);
        ['purchaseDiscount', 'purchaseShipping', 'purchasePaid'].forEach(id => byId(id).addEventListener('input', totals));
        rows.addEventListener('click', event => {
            const remove = event.target.closest('[data-remove-item]');
            if (!remove) return;
            items.splice(Number(remove.dataset.removeItem), 1);
            renderItems();
        });
        rows.addEventListener('change', event => {
            const quantity = event.target.closest('[data-item-quantity]');
            const cost = event.target.closest('[data-item-cost]');
            if (!quantity && !cost) return;
            const index = Number((quantity || cost).dataset.itemQuantity ?? (quantity || cost).dataset.itemCost);
            if (!items[index]) return;
            if (quantity) items[index].quantity = Math.max(1, Number.parseInt(quantity.value, 10) || 1);
            if (cost) items[index].cost_price = Math.max(0, Number(cost.value) || 0);
            renderItems();
        });

        try {
            profile = await getProfile();
            if (!Admin.can(profile, 'purchases.create', Admin.finance)) {
                byId('savePurchase').disabled = true;
                byId('addPurchaseItem').disabled = true;
                setMessage('Your account does not have permission to create purchases.');
                return;
            }
            const [supplierResult, productResult] = await Promise.allSettled([
                request('/api/suppliers?page=1&limit=100&is_active=1'),
                loadProducts()
            ]);
            if (productResult.status === 'rejected') throw productResult.reason;
            if (supplierResult.status === 'fulfilled') {
                const suppliers = Array.isArray(supplierResult.value.data) ? supplierResult.value.data : [];
                supplierSelect.innerHTML = '<option value="">No linked supplier</option>' + suppliers.map(supplier => `<option value="${Number(supplier.id)}">${escapeHTML(supplier.name)}${supplier.company_name ? ` · ${escapeHTML(supplier.company_name)}` : ''}</option>`).join('');
            } else {
                setMessage('Supplier list is unavailable for this account. You can type a supplier name instead.');
            }
            if (!products.length) setMessage('Add the motorcycle or part in Inventory before ordering it.');
        } catch (error) {
            if (!error.authRedirect) setMessage(error.message);
        }

        const localDate = new Date();
        localDate.setMinutes(localDate.getMinutes() - localDate.getTimezoneOffset());
        byId('purchaseDate').value = localDate.toISOString().slice(0, 10);
        totals();
    }

    async function initPurchaseReport() {
        const form = byId('purchaseReportFilters');
        const rowsRoot = byId('purchaseReportRows');
        const startInput = byId('reportStartDate');
        const endInput = byId('reportEndDate');
        const today = new Date();
        const localDate = date => {
            const adjusted = new Date(date);
            adjusted.setMinutes(adjusted.getMinutes() - adjusted.getTimezoneOffset());
            return adjusted.toISOString().slice(0, 10);
        };
        endInput.value = localDate(today);
        startInput.value = localDate(new Date(today.getFullYear(), today.getMonth(), 1));

        try {
            await getProfile();
        } catch (error) {
            if (!error.authRedirect) showToast(error.message, true);
            return;
        }

        async function loadReport() {
            const start = startInput.value;
            const end = endInput.value;
            if (!start || !end || start > end) {
                rowsRoot.innerHTML = '<tr><td class="purchase-empty" colspan="8">Choose a valid date range.</td></tr>';
                return;
            }
            rowsRoot.innerHTML = '<tr><td class="purchase-empty" colspan="8">Loading report…</td></tr>';
            try {
                const params = new URLSearchParams({start_date: start, end_date: end});
                const payload = await request(`/api/reports/purchases?${params}`);
                const rows = Array.isArray(payload.data) ? payload.data : [];
                const summary = rows.reduce((total, row) => ({
                    orders: total.orders + Number(row.transactions || 0),
                    amount: total.amount + Number(row.total || 0),
                    paid: total.paid + Number(row.paid || 0),
                    due: total.due + Number(row.due || 0)
                }), {orders: 0, amount: 0, paid: 0, due: 0});
                byId('reportCount').textContent = new Intl.NumberFormat().format(summary.orders);
                byId('reportTotal').textContent = money(summary.amount);
                byId('reportPaid').textContent = money(summary.paid);
                byId('reportDue').textContent = money(summary.due);
                byId('reportPeriodLabel').textContent = `${dateLabel(start)} – ${dateLabel(end)}`;
                rowsRoot.innerHTML = rows.length ? rows.map(row => `<tr>
                    <td>${escapeHTML(dateLabel(row.date))}</td>
                    <td>${Number(row.transactions) || 0}</td>
                    <td>${money(row.subtotal)}</td>
                    <td>${money(row.discounts)}</td>
                    <td>${money(row.shipping)}</td>
                    <td><strong>${money(row.total)}</strong></td>
                    <td>${money(row.paid)}</td>
                    <td>${money(row.due)}</td>
                </tr>`).join('') : '<tr><td class="purchase-empty" colspan="8">No purchases in this date range.</td></tr>';
            } catch (error) {
                if (!error.authRedirect) {
                    rowsRoot.innerHTML = `<tr><td class="purchase-empty" colspan="8">${escapeHTML(error.message)}</td></tr>`;
                    showToast(error.message, true);
                }
            }
        }

        form.addEventListener('submit', event => { event.preventDefault(); loadReport(); });
        byId('refreshPurchaseReport').addEventListener('click', loadReport);
        await loadReport();
    }

    async function initPurchaseReturns() {
        const purchaseSelect = byId('returnPurchase');
        const itemsRoot = byId('returnItems');
        const form = byId('purchaseReturnForm');
        const message = byId('returnMessage');
        let canManage = false;

        try {
            const profile = await getProfile();
            canManage = Admin.can(profile, 'purchases.manage', Admin.management);
            if (!canManage) {
                message.textContent = 'Your account can view returns but cannot record one.';
                form.querySelector('button[type="submit"]').hidden = true;
            }
            const payload = await request('/api/purchases?page=1&limit=100');
            const purchases = (Array.isArray(payload.data) ? payload.data : []).filter(item => ['received', 'partial'].includes(item.status));
            purchaseSelect.innerHTML = '<option value="">Choose a received purchase</option>' + purchases.map(item => `<option value="${Number(item.id)}">${escapeHTML(item.purchase_number)} · ${escapeHTML(item.supplier_name || 'Supplier')} · ${escapeHTML(statusLabel(item.status))}</option>`).join('');
            if (!purchases.length) itemsRoot.innerHTML = '<p class="purchase-empty">No purchases with received stock are available to return.</p>';
        } catch (error) {
            if (!error.authRedirect) {
                message.textContent = error.message;
                itemsRoot.innerHTML = `<p class="purchase-empty">${escapeHTML(error.message)}</p>`;
            }
        }

        async function loadReturnItems() {
            const id = Number(purchaseSelect.value);
            if (!id) {
                itemsRoot.innerHTML = '<p class="purchase-empty">Select a purchase order to view its received products.</p>';
                return;
            }
            itemsRoot.innerHTML = '<p class="purchase-empty">Loading received items…</p>';
            try {
                const payload = await request(`/api/purchases/${id}`);
                const returned = new Map((payload.data.returned_items || []).map(item => [Number(item.product_id), Number(item.returned_quantity)]));
                const receivedItems = (payload.data.items || []).map(item => ({
                    ...item,
                    availableToReturn: Math.max(0, Number(item.received_quantity) - (returned.get(Number(item.product_id)) || 0))
                })).filter(item => item.availableToReturn > 0);
                if (!receivedItems.length) {
                    itemsRoot.innerHTML = '<p class="purchase-empty">All received quantities from this purchase have already been returned.</p>';
                    return;
                }
                itemsRoot.innerHTML = `<div class="purchase-table-wrap"><table class="purchase-table purchase-table--items"><thead><tr><th>Product</th><th>Received</th><th>Already returned</th><th>Available</th><th>Unit cost</th><th>Return quantity</th></tr></thead><tbody>${receivedItems.map(item => `<tr>
                    <td><strong>${escapeHTML(item.product_name)}</strong></td>
                    <td>${Number(item.received_quantity)}</td>
                    <td>${Number(item.received_quantity) - item.availableToReturn}</td>
                    <td>${item.availableToReturn}</td>
                    <td>${money(item.cost_price)}</td>
                    <td><input type="number" min="0" max="${item.availableToReturn}" value="0" data-return-product="${Number(item.product_id)}" aria-label="Return quantity for ${escapeHTML(item.product_name)}"></td>
                </tr>`).join('')}</tbody></table></div>`;
            } catch (error) {
                if (!error.authRedirect) itemsRoot.innerHTML = `<p class="purchase-empty">${escapeHTML(error.message)}</p>`;
            }
        }

        purchaseSelect.addEventListener('change', loadReturnItems);
        form.addEventListener('submit', async event => {
            event.preventDefault();
            if (!canManage) return;
            const items = [...itemsRoot.querySelectorAll('[data-return-product]')]
                .map(input => ({product_id: Number(input.dataset.returnProduct), quantity: Number(input.value)}))
                .filter(item => Number.isInteger(item.quantity) && item.quantity > 0);
            if (!purchaseSelect.value) { message.textContent = 'Choose a purchase order first.'; return; }
            if (!items.length) { message.textContent = 'Enter at least one return quantity.'; return; }
            const button = form.querySelector('button[type="submit"]');
            button.disabled = true;
            message.textContent = 'Recording return…';
            try {
                const payload = await request('/api/purchases/returns', {method: 'POST', body: JSON.stringify({purchase_id: Number(purchaseSelect.value), items, reason: byId('returnReason').value.trim() || null})});
                message.textContent = `Return ${payload.data.return_number} recorded.`;
                message.classList.add('is-success');
                showToast(`Return ${payload.data.return_number} recorded.`);
                byId('returnReason').value = '';
                await Promise.all([loadReturnItems(), loadReturns()]);
            } catch (error) {
                if (!error.authRedirect) { message.textContent = error.message; message.classList.remove('is-success'); }
            } finally {
                button.disabled = false;
            }
        });

        async function loadReturns() {
            const body = byId('returnRows');
            body.innerHTML = '<tr><td class="purchase-empty" colspan="6">Loading returns…</td></tr>';
            try {
                const payload = await request('/api/purchases/returns?page=1&limit=100');
                const returns = Array.isArray(payload.data) ? payload.data : [];
                body.innerHTML = returns.length ? returns.map(item => `<tr>
                    <td><strong>${escapeHTML(item.return_number)}</strong></td>
                    <td>${escapeHTML(item.purchase_number)}</td>
                    <td>${escapeHTML(item.supplier_name || 'Unlinked supplier')}</td>
                    <td>${escapeHTML(dateLabel(item.return_date))}</td>
                    <td>${money(item.total_amount)}</td>
                    <td><span class="${statusClass(item.status)}">${escapeHTML(statusLabel(item.status))}</span></td>
                </tr>`).join('') : '<tr><td class="purchase-empty" colspan="6">No purchase returns recorded yet.</td></tr>';
            } catch (error) {
                if (!error.authRedirect) body.innerHTML = `<tr><td class="purchase-empty" colspan="6">${escapeHTML(error.message)}</td></tr>`;
            }
        }

        byId('refreshReturns').addEventListener('click', loadReturns);
        await loadReturns();
    }

    const page = document.body?.dataset.page;
    const setSidebarUser = Admin.mountSidebar(page === 'purchase-report' ? Admin.reportLinks : Admin.purchaseLinks);
    if (page === 'purchase-list') initPurchaseList();
    if (page === 'new-purchase') initNewPurchase();
    if (page === 'purchase-returns') initPurchaseReturns();
    if (page === 'purchase-report') initPurchaseReport();
})();
