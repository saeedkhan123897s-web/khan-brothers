# Local setup

Requirements: Node.js 18.11+ and a running MySQL server.

On macOS, if MySQL is not installed, install and start it with `brew install mysql` and `brew services start mysql`.

1. Install Node dependencies with `npm ci`.
2. Copy `.env.example` to `.env` and set the MySQL password and a private random `JWT_SECRET` of at least 32 characters. `HOST=localhost` keeps the development server on this machine; set an appropriate interface when deploying. Production also requires an HTTPS `FRONTEND_URL` origin.
3. Create the configured database and tables. If MySQL already provisioned the database, run only the migration and seed commands.

   ```sh
   npm run db:create
   npm run migrate
   npm run seed
   ```

4. Start the app with `npm start` and open `http://localhost:3000`.

The seed command creates `admin@khanbros.pk` with password `admin123` for local development. Change it after the first login. In production, set `SEED_ADMIN_EMAIL` and a unique `SEED_ADMIN_PASSWORD` of at least 16 characters before seeding; the development credentials are disabled there.

In development, the public pages still load without MySQL. `/api/health` reports `degraded` and database-backed API requests return `503` until MySQL is available. The server retries the database connection every 10 seconds and enables APIs after it recovers. Production startup exits if the database is unavailable or required secrets are missing.

## API overview

- `/api/auth` — registration, login, profile and user management
- `/api/customers` — customers, motorcycles and transaction summaries
- `/api/products` — product catalogue, categories and brands
- `/api/suppliers` — supplier records and balances
- `/api/inventory` — stock levels, movements and adjustments
- `/api/sales` — point of sale, invoices and returns
- `/api/purchases` — purchase orders, receipts and returns
- `/api/orders` — online orders, tracking and fulfilment
- `/api/payments` — receipts and payments
- `/api/workshop` — mechanics, services and job cards
- `/api/accounts` — accounts, ledger, bank accounts, cashbook and expenses
- `/api/settings` — business settings; `/api/settings/public` exposes storefront settings
- `/api/uploads/images` — protected product image upload (JPEG, PNG, WEBP or GIF, up to 5 MB)
- `/api/profit`, `/api/reports`, `/api/audit` — management reports and audit history

Most list endpoints accept `page` and `limit` query parameters. Staff endpoints require a bearer token or the login cookie.
