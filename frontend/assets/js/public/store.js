'use strict';

(() => {
    const { request, url, money, date, label, escape: e } = ERP;
    const page = document.body.dataset.storePage;
    const main = document.querySelector('main');
    const params = new URLSearchParams(location.search);
    const storageKey = 'khan-brothers-cart';
    const banner = document.createElement('p');
    banner.setAttribute('role', 'status');
    main.prepend(banner);

    function notice(message, error = false) {
        banner.textContent = message;
        banner.classList.toggle('store-error', error);
    }

    function readCart() {
        try {
            const saved = JSON.parse(localStorage.getItem(storageKey) || '{}');
            return Object.fromEntries(Object.entries(saved).filter(([id, quantity]) => /^\d+$/.test(id) && Number.isSafeInteger(quantity) && quantity > 0));
        } catch {
            return {};
        }
    }

    function saveCart(cart) {
        localStorage.setItem(storageKey, JSON.stringify(cart));
    }

    const apiProduct = id => '/api/products/' + encodeURIComponent(id);
    const detailLink = id => '/pages/product-details.html?id=' + encodeURIComponent(id);
    const motorcyclesURL = '/pages/products.html?product_type=motorcycle';
    const soldInStore = product => product.in_stock ?? Number(product.stock_quantity) > 0;
    const bikeSpecs = product => [product.motorcycle_condition === 'used' ? 'Used' : 'New', product.brand_name, product.model_year,
        product.engine_cc ? product.engine_cc + ' cc' : ''].filter(Boolean).join(' · ');
    function image(product) {
        if (!product.image_url || !/^\/uploads\/[a-z0-9.-]+$/i.test(product.image_url)) return '';
        return `<img src="${e(product.image_url)}" alt="${e(product.name)}" loading="lazy">`;
    }

    async function listProducts() {
        const form = document.querySelector('#catalogueFilters');
        const results = document.querySelector('#catalogueProducts');
        const pager = document.querySelector('#cataloguePages');
        const motorcycleCatalogue = params.get('product_type') === 'motorcycle';
        const condition = form.elements.motorcycle_condition;
        if (motorcycleCatalogue) {
            document.querySelector('#catalogueCondition').hidden = false;
            const requestedCondition = params.get('motorcycle_condition');
            condition.value = ['new', 'used'].includes(requestedCondition) ? requestedCondition : '';
            document.title = 'Motorcycles | Khan Brothers';
            document.querySelector('#catalogueTitle').textContent = 'Motorcycles';
            document.querySelector('#catalogueDescription').textContent = 'Browse available motorcycles and place an order online.';
            document.querySelector('#catalogueHelp').textContent = 'Need help choosing a motorcycle?';
            document.querySelector('#catalogueHelpText').textContent = 'Contact the shop for model and availability details.';
            form.elements.search.placeholder = 'Motorcycle name or SKU';
            document.querySelector('#catalogueMotorcycles').setAttribute('aria-current', 'page');
        }
        let current = Number(params.get('page')) || 1;
        let revision = 0;
        form.elements.search.value = params.get('search') || '';
        const categories = request('/api/products/categories').then(({ data }) => {
            for (const row of data) form.elements.category_id.add(new Option(row.name, row.id));
            form.elements.category_id.value = params.get('category_id') || '';
        });
        async function load() {
            const id = ++revision;
            results.textContent = 'Loading catalogue…';
            pager.replaceChildren();
            try {
                const { data, pagination } = await request(url('/api/products', {
                    page: current, limit: 20, product_type: motorcycleCatalogue ? 'motorcycle' : 'part',
                    motorcycle_condition: motorcycleCatalogue ? condition.value : '',
                    in_stock: motorcycleCatalogue ? 1 : '',
                    search: form.elements.search.value.trim(), category_id: form.elements.category_id.value
                }));
                if (id !== revision) return;
                results.innerHTML = data.map(product => `<article class="store-card">${image(product)}<h3><a href="${detailLink(product.id)}">${e(product.name)}</a></h3>
                    <p>${e(motorcycleCatalogue ? bikeSpecs(product) || product.sku : product.category_name || product.sku)}</p><strong>${e(money(product.selling_price))}</strong>
                    <p>${soldInStore(product) ? 'In stock' : 'Out of stock'}</p></article>`).join('') || '<p>No products match your filters.</p>';
                if (pagination.totalPages > 1) {
                    pager.innerHTML = `<button type="button" data-page="${current - 1}" ${current === 1 ? 'disabled' : ''}>Previous</button><span>Page ${current} of ${Number(pagination.totalPages)}</span><button type="button" data-page="${current + 1}" ${current >= pagination.totalPages ? 'disabled' : ''}>Next</button>`;
                }
                notice('');
            } catch (error) {
                if (id === revision) { results.replaceChildren(); notice(error.message, true); }
            }
        }
        form.addEventListener('submit', event => { event.preventDefault(); current = 1; load(); });
        pager.addEventListener('click', event => {
            if (event.target.dataset.page) { current = Number(event.target.dataset.page); load(); }
        });
        await categories;
        await load();
    }

    async function productDetails() {
        const id = params.get('id');
        if (!/^\d+$/.test(id || '')) {
            notice('Choose a product from the catalogue.', true);
            return;
        }
        const { data } = await request(apiProduct(id));
        document.title = data.name + ' | Khan Brothers';
        const bike = data.product_type === 'motorcycle';
        const catalogue = document.querySelector('#productCatalogueLink');
        if (bike) {
            catalogue.href = motorcyclesURL;
            catalogue.textContent = 'Motorcycle catalogue';
        }
        const specifications = bike ? bikeSpecs(data) : '';
        const album = data.images?.length > 1
            ? `<div class="kb-public-album">${data.images.map(image_url => image({ ...data, image_url })).join('')}</div>`
            : image(data);
        document.querySelector('#storeProduct').innerHTML = `${album}<h2>${e(data.name)}</h2><p>SKU ${e(data.sku)}</p>
            ${specifications ? `<p>${e(specifications)}</p>` : ''}<p>${e(data.description || '')}</p><strong>${e(money(data.selling_price))}</strong><p>${soldInStore(data) ? 'In stock' : 'Out of stock'}</p>`;
        const form = main.querySelector('form');
        form.hidden = !soldInStore(data);
        if (bike) form.querySelector('button[type="submit"]').textContent = 'Add motorcycle to cart';
        const used = bike && data.motorcycle_condition === 'used';
        if (used) form.elements.quantity.max = 1;
        form.addEventListener('submit', event => {
            event.preventDefault();
            const cart = readCart();
            const quantity = Number(form.elements.quantity.value);
            if (used && cart[id]) {
                notice('This used motorcycle is already in your cart.', true);
                return;
            }
            if (!Number.isSafeInteger(quantity) || quantity < 1 || (cart[id] || 0) + quantity > 999) {
                notice('Enter a quantity from 1 to 999 including units already in the cart.', true);
                return;
            }
            try {
                cart[id] = (cart[id] || 0) + quantity;
                saveCart(cart);
                location.assign('/pages/cart.html');
            } catch {
                notice('Browser storage is unavailable. Enable it to use the cart.', true);
            }
        });
    }

    async function cartProducts(cart) {
        return Promise.all(Object.entries(cart).map(async ([id, quantity]) => {
            try { return { id, quantity, product: (await request(apiProduct(id))).data }; }
            catch (error) {
                if (error.status === 404) return { id, quantity, product: null };
                throw error;
            }
        }));
    }

    const cartTotal = rows => rows.reduce((total, row) => total + Number(row.product?.selling_price || 0) * row.quantity, 0);
    async function shoppingCart() {
        const output = document.querySelector('#cartProducts');
        const checkout = document.querySelector('#cartCheckout');
        async function draw() {
            const rows = await cartProducts(readCart());
            checkout.hidden = !rows.length || rows.some(row => !row.product || !soldInStore(row.product));
            output.innerHTML = rows.map(({ id, quantity, product }) => `<article class="store-card">
                <h3>${product ? `<a href="${detailLink(id)}">${e(product.name)}</a>` : 'Unavailable product'}</h3>
                ${product ? `<p>${e(money(product.selling_price))} per unit${soldInStore(product) ? '' : ' · Out of stock'}</p>` : ''}
                <label>Quantity <input type="number" min="1" max="${product?.motorcycle_condition === 'used' ? 1 : 999}" value="${quantity}" data-quantity="${e(id)}"></label>
                <button type="button" data-remove="${e(id)}">Remove</button></article>`).join('') || '<p>Your cart is empty.</p>';
            document.querySelector('#cartTotal').textContent = money(cartTotal(rows));
        }
        async function update(event) {
            const { remove, quantity } = event.target.dataset;
            if (!remove && !quantity) return;
            const cart = readCart();
            if (remove) delete cart[remove];
            else {
                if (!event.target.reportValidity() || !event.target.value) return;
                cart[quantity] = Number(event.target.value);
            }
            try { saveCart(cart); await draw(); }
            catch (error) { notice(error.message, true); }
        }
        output.addEventListener('change', update);
        output.addEventListener('click', event => { if (event.target.dataset.remove) update(event); });
        await draw();
    }

    function bind(form, handler) {
        form.addEventListener('submit', async event => {
            event.preventDefault();
            const button = event.submitter || form.querySelector('[type="submit"]');
            button.disabled = true;
            notice('');
            const values = Object.fromEntries(new FormData(form));
            try { await handler(values); }
            catch (error) { notice(error.message, true); banner.scrollIntoView({ block: 'nearest' }); }
            finally { button.disabled = false; }
        });
    }

    async function checkout() {
        const form = main.querySelector('form');
        const rows = await cartProducts(readCart());
        const summary = document.querySelector('#checkoutSummary');
        summary.innerHTML = rows.map(({ product, quantity }) => `<li>${e(product?.name || 'Unavailable product')} × ${quantity}</li>`).join('');
        document.querySelector('#checkoutTotal').textContent = money(cartTotal(rows));
        if (!rows.length || rows.some(row => !row.product || !soldInStore(row.product))) {
            notice('Your cart is empty or contains unavailable items. Update the cart before placing an order.', true);
            return;
        }
        form.hidden = false;
        bind(form, async values => {
            const latest = readCart();
            if (JSON.stringify(latest) !== JSON.stringify(Object.fromEntries(rows.map(row => [row.id, row.quantity])))) {
                throw new Error('Your cart changed. Refresh checkout before placing the order.');
            }
            const { data } = await request('/api/orders', { method: 'POST', body: {
                items: rows.map(row => ({ product_id: Number(row.id), quantity: row.quantity })),
                customer_name: values.full_name, customer_email: values.email, customer_phone: values.phone,
                shipping_address: [values.address, values.city, values.district, values.province, values.postal_code].filter(Boolean).join(', '),
                payment_method: { cash_on_delivery: 'cash', online_payment: 'card' }[values.payment_method] || values.payment_method,
                notes: [values.order_notes, [values.motorcycle_brand, values.motorcycle_model].filter(Boolean).join(' ')].filter(Boolean).join('\n')
            } });
            try { saveCart({}); } catch { /* The order is already recorded. */ }
            location.assign(url('/pages/order-tracking.html', { order: data.order_number }));
        });
    }

    function tracking() {
        const form = main.querySelector('form');
        const output = document.querySelector('#trackingResult');
        bind(form, async values => {
            output.replaceChildren();
            const number = values.order_number.trim();
            if (!number) throw new Error('Enter an order number.');
            const { data } = await request('/api/orders/tracking/' + encodeURIComponent(number));
            output.innerHTML = `<h3>Order ${e(data.order_number)}</h3><p><strong>${e(label(data.status))}</strong></p>
                <p>Placed ${e(date(data.created_at))}</p>${data.tracking_number ? `<p>Tracking number ${e(data.tracking_number)}</p>` : ''}`;
        });
        if (params.has('order') || params.has('order_number')) {
            form.elements.order_number.value = params.get('order') || params.get('order_number');
            form.requestSubmit();
        }
    }

    function authentication() {
        const form = main.querySelector('form');
        bind(form, async values => {
            const registering = page === 'register';
            if (registering && values.password !== values.confirm_password) throw new Error('The passwords must match.');
            const body = { email: values.email, password: values.password };
            if (registering) Object.assign(body, {
                name: values.full_name, phone: values.phone,
                address: [values.address, values.city, values.district, values.province].filter(Boolean).join(', ')
            });
            const result = await request('/api/auth/' + (registering ? 'register' : 'login'), { method: 'POST', body });
            if (registering) location.assign('/pages/login.html?registered=1');
            else location.assign(result.data.user.role === 'customer' ? '/pages/products.html' : '/admin/dashboard.html');
        });
        if (params.get('registered')) notice('Your account is ready. Sign in to continue.');
    }

    async function contact() {
        const { data } = await request('/api/settings/public');
        const address = document.querySelector('#storeContactDetails');
        for (const text of [data.business_address, data.business_phone, data.business_email].filter(Boolean)) {
            const line = document.createElement('p');
            line.textContent = text;
            address.append(line);
        }
        const email = data.business_email?.trim();
        if (!email || !/^[^?&\s@]+@[^?&\s@]+\.[^?&\s@]+$/.test(email)) return;
        const form = main.querySelector('form');
        form.hidden = false;
        bind(form, values => {
            const subject = values.service ? 'Workshop inquiry — ' + values.service : 'Workshop inquiry';
            const body = [values.message, values.customer_name, values.phone, values.email, values.motorcycle_model].filter(Boolean).join('\n');
            location.assign('mailto:' + encodeURIComponent(email).replace('%40', '@') +
                '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body));
        });
    }

    const handlers = { products: listProducts, 'product-details': productDetails, cart: shoppingCart, checkout,
        'order-tracking': tracking, login: authentication, register: authentication, contact };
    Promise.resolve().then(() => handlers[page]?.()).catch(error => notice(error.message, true));
})();
