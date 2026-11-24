# Khan Brothers Supabase app

The single-page app and the original MySQL ERP run separately. The old ERP still uses `npm start` on port 3000. The Supabase app starts with its own database and staff password. Existing workshop and business records remain in the ERP.

## Set up the database and sign-in

1. In the SQL Editor of a Supabase project for this app, run [schema.sql](../database/supabase/schema.sql), then apply the numbered migrations in [database/supabase](../database/supabase) in order. On an existing database, apply only the pending migrations.
2. Set `SUPABASE_URL` to the Supabase project URL. Set `SUPABASE_KEY` to the secret API key or legacy service-role key. Express uses it to access the database and photo storage.
3. Set `APP_PASSWORD_HASH` to a bcrypt hash of the built-in `admin` password. Set `APP_SESSION_SECRET` to an independent random secret of at least 32 characters.

Generate these two values with Bash from the project root.

```bash
read -r -s -p 'Staff password: ' KB_PASSWORD
printf '\n'
KB_PASSWORD="$KB_PASSWORD" node -e 'console.log(require("bcryptjs").hashSync(process.env.KB_PASSWORD, 12))'
unset KB_PASSWORD
node -e 'console.log(require("node:crypto").randomBytes(32).toString("hex"))'
```

Put the values in the existing local `.env` using [.env.example](../.env.example) as a reference. Wrap the password hash in single quotes in `.env`. Set `BUSINESS_TIME_ZONE` if the shop's dates should follow a different time zone from the default, `Asia/Muscat`.

## Start the single-page app

```sh
npm ci
PORT=3100 npm run start:spa
```

Open [http://localhost:3100](http://localhost:3100) and sign in as `admin` with the configured password. Create staff accounts under **Settings → Users** and assign their access under **Rules Router**.

The export buttons download current database records as CSV or Excel. Profit exports contain the three profit sources, their combined total and the four-column sold-bike summary. Use **Sell part** in Spare Parts to record a sale at its actual unit price. Enter the labour charge and cost in the details of a completed or delivered workshop job. Qist totals include the agreed flat interest when entered at sale.

Select a Profit Report box to see transaction amounts and totals by salesperson or mechanic. Enter the salesperson on the sale form, or add a missing name in the transaction details.

In Workshop, the total bill is the parts charge plus the labour charge. Use **Details** to update the bill and **Collect Payment** to record actual receipts. Ready and delivered jobs appear in **Repair History**. Search either job list by bike number or mobile number.

The Daily Report adds recorded sale receipts, Qist collections and workshop payments to the latest saved closing balance, then deducts operating expenses. The first opening balance is zero. Closing a day saves the report and blocks new postings to that date. The repurchase list targets 10 units per low-stock part and clears a tick when the part's inventory quantity changes.

Assign independent mechanics and optional referral workshops to jobs. Recording parts deducts stock and saves the commission and referral bonus for those parts. Partner payouts reduce the Daily Report closing balance. Capital is available only to administrators and starts with PKR 120,000.

## Vercel

Use the repository root as the Vercel project root. The Express entry point is `index.js`. The build command in `vercel.json` copies the single-page frontend and shared KB assets into Vercel's `public/` directory. Set the Supabase and staff sign-in environment variables for the intended deployment before deploying. [Express on Vercel](https://vercel.com/docs/frameworks/backend/express)

Vercel Hobby is for personal, non-commercial use. Commercial use of the shop app requires an eligible Vercel plan. [Vercel Fair Use Guidelines](https://vercel.com/docs/limits/fair-use-guidelines)

## Backend blueprint

The app is for staff recording motorcycle purchases, stock, resales, Qist collections and operating expenses. The frontend uses plain HTML, CSS and JavaScript. Node.js and Express provide an authenticated API. Supabase provides Postgres and private photo storage. Passwords are verified with bcrypt. An eight-hour signed session cookie identifies each account, and protected API requests check the account's current permissions.

### Data model

| Table | Columns and relationships |
| --- | --- |
| `bikes` | Bigint ID, bike name, model, photo URL, chassis and plate numbers, engine/tyre/body condition, purchase date and payment method, purchase price, repair cost, other cost, expected sell price, status and UUID request key. Postgres generates total cost from the three costs and indexes the normalized chassis number. |
| `customers` | Bigint ID, name, phone and optional CNIC. A generated phone key supports grouping sales for the same customer. |
| `sales` | Bigint ID, unique bike reference, customer reference and buyer details at the time of sale, bike price, interest rate and amount, sale total, cost at sale, payment method, sale date and UUID request key. Postgres generates profit as the sale total minus the recorded cost. |
| `qist` | Bigint ID, unique sale reference, total, advance, remaining balance, monthly amount and next due date. Postgres derives the payment status from the remaining balance. |
| `qist_payments` | Bigint ID, Qist plan reference, collected amount, payment date and UUID request key. |
| `expenses` | Bigint ID, expense category, amount, date, optional description and UUID request key. |

Money is stored as fixed-precision numeric values. Dates use Postgres date columns. Foreign keys keep sales, plans and collections linked to existing records. The SQL file contains the full types, indexes, constraints and grants. [Supabase schema](../database/supabase/schema.sql)

### API routes

| Method and route | Purpose |
| --- | --- |
| `GET /api/health` | Reports whether the required settings are present. |
| `POST /api/login`, `POST /api/logout` | Creates or clears the staff session. |
| `GET /api/state` | Returns a consistent snapshot for the single-page app. |
| `GET /api/bikes`, `POST /api/bikes` | Lists bikes and records purchases into stock. |
| `POST /api/bikes/photos`, `GET /api/bikes/photos/:name` | Uploads and retrieves private bike photos. |
| `GET /api/sales`, `POST /api/sales` | Lists sales and records a sale with its customer and optional Qist plan. |
| `GET /api/customers` | Lists customer records. |
| `GET /api/qist`, `POST /api/qist/:id/payments` | Lists plans and records collections. |
| `GET /api/expenses`, `POST /api/expenses` | Lists and records operating expenses. |
| `GET /api/export/:section?format=csv` | Exports `stock`, `sold`, `customers` or `profit`. Use `format=excel` for an XLSX workbook. |

### Security and validation

Protected routes verify the staff session. State-changing browser requests check their origin. Staff login has a rate limit, and the session cookie is HttpOnly, SameSite Strict and Secure on Vercel. The Supabase key stays on the server. The schema enables row-level security, and only the service role can run the app's database functions or read the business tables through the Data API. [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys)

Express validates names, contact details, amounts, dates, IDs and photo types. Postgres locks the bike while selling it and locks the Qist plan while recording a payment. Each write updates its related records in the same transaction. Request keys protect retries from recording duplicate purchases, expenses, sales or collections.

### Source layout

```text
frontend/
  index.html, style.css, app.js
backend/
  server.js, supabase.js, reports.js
  routes/
    bikes.js, sales.js, customers.js, qist.js, expenses.js
database/
  supabase/schema.sql
.env.example
index.js
vercel.json
```
