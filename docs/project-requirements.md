# Project requirements

Khan Brothers uses the ERP to manage a motorcycle workshop, spare parts catalogue and storefront. Staff sign in through the admin area. Shoppers can browse the catalogue and submit and track orders through the public site.

| Area | Workflows |
| --- | --- |
| Inventory | Maintain products, categories and brands. Filter stock levels, record reasoned adjustments and reconcile stock against the latest movement. |
| Customers and suppliers | Maintain customer records, motorcycles and supplier profiles. Look up customer transactions and supplier purchase records. |
| Sales and purchases | Create sales, view invoices, record returns, order from suppliers and receive returned or incoming stock through the appropriate documents. |
| Workshop | Maintain mechanics and services, create job cards with services and parts, assign mechanics, update status and review repair history. |
| Storefront | Browse and search available products, keep a local cart, submit an order and track it by order number. Management confirms and fulfils online orders. |
| Accounts | Record receipts, payments, expenses and journals. Review the cashbook, bank records, general ledger and trial balance. |
| Management | Review sales, inventory, workshop, financial and profit reports. Inspect audit entries and update settings and user roles. |

## Access and state

The backend checks permissions for protected operations. Owner and admin accounts can manage user roles. Managers can manage stock, purchases, workshop records and business settings. Finance roles can access financial reports and accounting. Mechanics can update assigned jobs within the permitted status transitions.

Stock and balance changes driven by receiving goods, sales, returns, workshop jobs and order confirmation use MySQL transactions. When a request fails, the frontend keeps entered values where possible and shows the API error. Start with a reachable MySQL server and the initialized schema before using transactional screens.

## Operating scope

Currency is PKR. Checkout records a preferred payment method for staff follow-up. Staff record payments after collection. The cashbook reports recorded receipts and disbursements, and the trial balance reports posted ledger entries. Sales and purchase totals are available separately in management reports. The app has no payment gateway or bank feed integration.
