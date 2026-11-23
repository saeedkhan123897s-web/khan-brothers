# Database design

MySQL stores operational data. The connection pool and transaction helpers live in `backend/src/config/database.js`. The migration runner executes the ordered schema definitions in `database/migrations`. The seed runner uses defaults from `database/seeds/defaults.js`.

| Data area | Main relationships |
| --- | --- |
| Identity | `users` holds staff and customer sign-ins. `customers` holds shop customer records with zero or more `customer_motorcycles`. `mechanics` can link to a staff user. |
| Catalogue | `products` references `categories` and `brands`. Categories can reference a parent category. `stock_movements` references a product and stores the balance before and after each movement. |
| Sales | `sales` has `sale_items`, with optional links to a customer. `sale_returns` references the original sale, and `sale_return_items` records the returned products and quantities. |
| Purchasing | `purchases` references `suppliers`. `purchase_items` tracks ordered and received quantities. `purchase_returns` and `purchase_return_items` record supplier returns. |
| Used-bike business | `used_bikes` links each acquired motorcycle to one stock product. `used_bike_work` records repair and other costs. `used_bike_photos` stores the photo paths. `used_bike_sales` links the vehicle to a POS sale and stores its receipt and Qist terms. `used_bike_installments` links Qist collections to payments. |
| Workshop | `job_cards` can reference a customer, motorcycle and mechanic. `job_card_services` and `job_card_parts` store billed lines. |
| Online orders | `orders` and `order_items` store checkout and fulfilment details. Confirmation deducts stock. An eligible cancellation restores confirmed stock. |
| Accounts | `accounts` forms the chart of accounts, and `ledger_entries` records postings. `payments` uses a reference type and ID for operational documents. `bank_accounts` and `expenses` store bank records and business expenses. |
| Administration | `settings` stores grouped key-value preferences. `audit_trail` stores recorded actions, actor details and available changes. |

Migration 002 adds `user_route_permissions` for per-staff allow or deny overrides and adds motorcycle classification, model year and engine size to the product catalogue. Existing product rows default to spare parts.

Migrations 003 and 004 add used motorcycles, photos, resale and Qist records, and an expense business area. Existing expenses keep the general business area. Purchase, repair and other costs update the motorcycle product's cost basis. Sold line items retain the cost recorded at the time of sale.

## Setup and maintenance

1. Create the configured database with `npm run db:create` using an account with the required permissions.
2. Apply schema definitions with `npm run migrate`.
3. Insert the initial owner account, catalogue metadata, services, accounts and settings with `npm run seed`.
4. Back up existing data before applying future schema changes.

The initial migration uses `CREATE TABLE IF NOT EXISTS`. Existing installations require explicit migrations for future column or constraint changes. Seed defaults preserve existing account and setting records. Document numbers remain unique per document table and stored line prices preserve the original sale or purchase values.
