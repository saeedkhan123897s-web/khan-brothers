'use strict';

window.ERP = (() => {
    const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[character]);
    const label = value => String(value ?? '').replaceAll('_', ' ').replace(/^./, first => first.toUpperCase());
    const currency = new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR' });
    const money = value => currency.format(Number(value) || 0);
    const date = value => {
        if (!value) return '—';
        if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
        const parsed = new Date(value);
        return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toLocaleString();
    };
    const query = values => new URLSearchParams(Object.entries(values).filter(([, value]) => value !== '' && value != null));
    const url = (path, values = {}) => {
        const params = query(values);
        return params.size ? `${path}${path.includes('?') ? '&' : '?'}${params}` : path;
    };

    async function request(path, { method = 'GET', body, signal } = {}) {
        const headers = { Accept: 'application/json' };
        if (body !== undefined) headers['Content-Type'] = 'application/json';
        const response = await fetch(path, {
            method, headers, signal, credentials: 'same-origin',
            body: body === undefined ? undefined : JSON.stringify(body)
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || result.success === false) {
            const problems = result.details || result.errors;
            const detail = Array.isArray(problems) && problems
                .map(error => error.message || error.msg).filter(Boolean).join(' · ');
            const error = new Error(detail || result.error || result.message || `Request failed (${response.status})`);
            error.status = response.status;
            throw error;
        }
        return result;
    }

    return { escape, label, money, date, url, request };
})();
