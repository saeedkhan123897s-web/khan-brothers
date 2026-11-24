'use strict';

(() => {
    const { t } = window.kbLanguage;
    const bell = document.getElementById('notificationBell');
    const badge = document.getElementById('notificationCount');
    const panel = document.getElementById('notificationPanel');
    const list = document.getElementById('notificationList');
    const status = document.getElementById('notificationStatus');
    const storagePrefix = 'kb-notifications-v1';
    let storageKey = storagePrefix;
    const currency = new Intl.NumberFormat('en-PK', { style:'currency', currency:'PKR', maximumFractionDigits:2 });
    const titles = {
        'due-today':'Qist Due Today', 'due-tomorrow':'Qist Due Tomorrow', overdue:'Qist Overdue',
        'low-bikes':'Low Stock', 'low-part':'Low Stock', ready:'Workshop Job Ready',
        sale:'New Sale', 'qist-payment':'Qist Payment Received', summary:'Daily Summary'
    };
    const esc = value => String(value ?? '').replace(/[&<>"']/g, character =>
        ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[character]);
    const empty = () => ({ items:[], signals:[], timeZone:'Asia/Muscat' });
    let saved = readStored() || empty();
    let account;
    let enabled = false;
    let revision = 0;
    let pending = false;
    let queued = false;
    let timer;
    let failed = false;

    function readStored() {
        try {
            const value = JSON.parse(localStorage.getItem(storageKey));
            if (Array.isArray(value?.items) && Array.isArray(value.signals)) return value;
        } catch {}
        return null;
    }

    function persist() {
        try { localStorage.setItem(storageKey,JSON.stringify(saved)); } catch {}
    }

    function notificationMessage(item) {
        const values = { ...item.values };
        for (const key of ['amount','sales','expenses','cash']) {
            if (values[key] != null) values[key] = currency.format(values[key]);
        }
        switch (item.kind) {
        case 'due-today':
        case 'due-tomorrow':
            return t('{customer} · {bike} · {amount} due on {date}.',values);
        case 'overdue':
            return t('{customer} · {bike} · {amount} is {days} days overdue.',values);
        case 'low-bikes':
            return t('Bikes in stock: {quantity}.',values);
        case 'low-part':
            return t('{name} · {quantity} units in stock.',values);
        case 'ready':
            return t('Job #{job} for {bike} is ready.',values);
        case 'sale':
            return t('{item} sold for {amount}.',values);
        case 'qist-payment':
            return t('{amount} collected from {customer}.',values);
        case 'summary':
            return t('{day} · Sale {sales} · Expense {expenses} · Cash sales {cash}.',values);
        default:
            return '';
        }
    }

    function render() {
        const grants = {'due-today':'qist','due-tomorrow':'qist',overdue:'qist','low-bikes':'stock','low-part':'parts',
            ready:'workshop','qist-payment':'qist',summary:'daily',sale:'sell'};
        const visible = saved.items.filter(item => account?.admin || account?.permissions?.includes(
            item.id.startsWith('part-sale:') ? 'parts' : grants[item.kind]));
        const unread = visible.filter(item => !item.read).length;
        badge.hidden = unread === 0;
        badge.textContent = unread;
        bell.setAttribute('aria-label',unread ? t('Notifications ({count} unread)',{count:unread}) : 'Notifications');
        if (panel.hidden) return;
        status.textContent = failed ? 'Could not check for new notifications.' : '';
        const time = new Intl.DateTimeFormat(document.documentElement.lang, {
            dateStyle:'medium', timeStyle:'short', timeZone:saved.timeZone
        });
        const scroll = list.scrollTop;
        list.innerHTML = visible.length ? visible.map(item =>
            `<li class="notification-item${item.kind === 'overdue' ? ' is-overdue' : ''}${item.read ? '' : ' is-unread'}">
                <div class="notification-content">
                    <h3>${esc(t(titles[item.kind]))}</h3>
                    <p>${esc(notificationMessage(item))}</p>
                    <time datetime="${esc(item.at)}">${esc(time.format(new Date(item.at)))}</time>
                </div>${item.read ? '' : `<button type="button" data-notification-read="${esc(item.id)}">${esc(t('Mark as Read'))}</button>`}
            </li>`
        ).join('') : `<li class="empty">${esc(t('No notifications yet.'))}</li>`;
        list.scrollTop = scroll;
    }

    function applyFeed(feed) {
        saved = readStored() || saved;
        const candidates = feed.activity.map(item => ({ ...item, key:item.id }));
        for (const row of feed.reminders) {
            const id = row.kind + ':' + row.id + ':' + row.next_date;
            candidates.push({ id, key:id, kind:row.kind, at:feed.now, values:{
                customer:row.customer_name, bike:row.bike_name, amount:row.remaining, date:row.next_date, days:row.days
            } });
        }
        const low = (key,kind,values) => ({
            key, id:key + ':' + feed.now, kind, at:feed.now, values
        });
        if (feed.bikeStock != null && feed.bikeStock <= 5) candidates.push(low('low:bikes','low-bikes',{quantity:feed.bikeStock}));
        for (const part of feed.lowParts) candidates.push(low('low:part:' + part.id,'low-part',part));
        if (feed.summary) {
            const id = 'summary:' + feed.summary.day;
            candidates.push({ id, key:id, kind:'summary', at:feed.summary.at, values:feed.summary });
        }

        const known = new Set([...saved.signals,...saved.items.map(item => item.id)]);
        const additions = candidates.filter(item => !known.has(item.key)).map(({key,...item}) => ({...item,read:false}));
        const signals = candidates.map(item => item.key).sort();
        if (!additions.length && saved.timeZone === feed.timeZone && JSON.stringify(saved.signals) === JSON.stringify(signals)) return;
        const items = [...additions,...saved.items].sort((a,b) => Date.parse(b.at) - Date.parse(a.at)).slice(0,250);
        saved = { items, signals, timeZone:feed.timeZone };
        persist();
        render();
    }

    async function check() {
        if (!enabled || document.hidden) return;
        if (pending) { queued = true; return; }
        clearTimeout(timer);
        pending = true;
        const current = revision;
        let delay = 60000;
        try {
            const response = await fetch('/api/notifications',{headers:{Accept:'application/json'}});
            if (!response.ok) throw new Error('Notification feed unavailable');
            const feed = await response.json();
            if (current !== revision) return;
            if (failed) { failed = false; render(); }
            applyFeed(feed);
            const untilSummary = Date.parse(feed.nextSummary) - Date.parse(feed.now);
            delay = Math.min(delay,Math.max(500,untilSummary + 100));
        } catch {
            if (current === revision && !failed) { failed = true; render(); }
        } finally {
            pending = false;
            const again = queued;
            queued = false;
            if (enabled && !document.hidden) timer = setTimeout(check,again ? 0 : delay);
        }
    }

    function close() {
        panel.hidden = true;
        bell.setAttribute('aria-expanded','false');
    }

    bell.addEventListener('click',() => {
        if (!panel.hidden) return close();
        panel.hidden = false;
        bell.setAttribute('aria-expanded','true');
        saved = readStored() || saved;
        render();
        check();
    });
    list.addEventListener('click',event => {
        const button = event.target.closest('[data-notification-read]');
        if (!button) return;
        saved = readStored() || saved;
        const item = saved.items.find(entry => entry.id === button.dataset.notificationRead);
        if (!item) return;
        item.read = true;
        persist();
        render();
        (list.querySelector('[data-notification-read]') || bell).focus();
    });
    document.addEventListener('click',event => {
        if (!panel.hidden && !panel.contains(event.target) && !bell.contains(event.target)) close();
    });
    document.addEventListener('keydown',event => {
        if (event.key === 'Escape' && !panel.hidden) { close(); bell.focus(); }
    });
    document.addEventListener('visibilitychange',() => {
        if (document.hidden) clearTimeout(timer);
        else check();
    });
    document.addEventListener('kb-language-change',render);
    addEventListener('storage',event => {
        if (event.key !== storageKey) return;
        const updated = readStored();
        if (updated) { saved = updated; render(); }
    });
    window.kbNotifications = {
        start(user) {
            const nextKey = user?.id ? storagePrefix + ':' + user.id : storagePrefix;
            if (nextKey !== storageKey) {
                revision++;
                storageKey = nextKey;
                saved = readStored() || empty();
            }
            if (JSON.stringify(account) !== JSON.stringify(user)) {
                account = user;
                render();
            }
            if (enabled) return;
            enabled = true;
            check();
        },
        stop() {
            enabled = false;
            revision++;
            clearTimeout(timer);
            close();
        },
        check, close
    };
    render();
})();
