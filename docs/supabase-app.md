# Khan Brothers Supabase app

The single-page app and the original MySQL ERP run separately. The old ERP still uses `npm start` on port 3000. The Supabase app starts with its own database and staff password. Existing workshop and business records remain in the ERP.

## Set up the database and sign-in

1. In the SQL Editor of a Supabase project for this app, run [schema.sql](../database/supabase/schema.sql). It creates the tables, protected photo bucket and database functions for sales and collections.
2. Set `SUPABASE_URL` to the Supabase project URL. Set `SUPABASE_KEY` to the secret API key or legacy service-role key. Express uses it to access the database and photo storage.
3. Set `APP_PASSWORD_HASH` to a bcrypt hash of the staff password. Set `APP_SESSION_SECRET` to an independent random secret of at least 32 characters.

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

Open [http://localhost:3100](http://localhost:3100) and enter the staff password. Purchase, Stock, Sales, Profit, Expenses, Customers and Qist use the same page with hash navigation.

The export buttons download current database records as CSV or Excel. Profit exports contain the sales margin, business expenses and net profit. Qist totals include the agreed flat interest when entered at sale.

## Vercel

Use the repository root as the Vercel project root. The Express entry point is `index.js`. The build command in `vercel.json` copies the single-page frontend and shared KB assets into Vercel's `public/` directory. Set the Supabase and staff sign-in environment variables for the intended deployment before deploying. [Express on Vercel](https://vercel.com/docs/frameworks/backend/express)

Vercel Hobby is for personal, non-commercial use. Commercial use of the shop app requires an eligible Vercel plan. [Vercel Fair Use Guidelines](https://vercel.com/docs/limits/fair-use-guidelines)
