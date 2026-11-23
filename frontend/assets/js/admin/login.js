(function () {
    'use strict';

    const form = document.getElementById('loginForm');
    const message = document.getElementById('loginMessage');
    const submitButton = form.querySelector('button[type="submit"]');

    form.addEventListener('submit', async event => {
        event.preventDefault();
        message.hidden = true;
        submitButton.disabled = true;
        submitButton.textContent = 'Signing in…';

        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                credentials: 'same-origin',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json'
                },
                body: JSON.stringify({
                    email: form.elements.email.value.trim(),
                    password: form.elements.password.value
                })
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(payload.message || payload.error || 'Sign in failed. Please try again.');
            }

            const role = String(payload.data?.user?.role || '').toLowerCase();
            const roleHome = {
                owner: '/admin/dashboard.html',
                admin: '/admin/dashboard.html',
                manager: '/admin/dashboard.html',
                accountant: '/admin/dashboard.html',
                salesman: '/admin/pages/sales/pos.html',
                mechanic: '/admin/pages/workshop/job-cards.html',
                customer: '/'
            };
            window.location.replace(roleHome[role] || '/admin/dashboard.html');
        } catch (error) {
            message.textContent = error.message || 'Could not connect to the server.';
            message.hidden = false;
        } finally {
            submitButton.disabled = false;
            submitButton.textContent = 'Sign In';
        }
    });
})();
