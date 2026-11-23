# Motorcycle Workshop ERP

Khan Brothers' storefront, inventory, sales, purchasing, workshop and accounting system.

The new black-and-gold motorcycle resale app uses Supabase and has its own setup instructions. [Supabase and Vercel setup](docs/supabase-app.md)

## Run the existing MySQL ERP locally

```sh
npm ci
npm run db:create
npm run migrate
npm run seed
npm start
```

Configure MySQL and application credentials first. Open `http://localhost:3000` for the storefront and `http://localhost:3000/admin/login.html` for staff access. Run `npm test` to verify local links, scripts and route mounting.

## Project structure

| Directory | Purpose |
| --- | --- |
| `backend/src` | Express app, API modules, permissions and database commands |
| `database/migrations` | MySQL schema definitions |
| `database/seeds` | Initial categories, brands, services, accounts and settings |
| `frontend/admin` | Staff dashboard and ERP pages |
| `frontend/public` | Storefront and checkout |
| `frontend/assets` | Shared styles, browser scripts and images |
| `tests` | Project structure checks |
| `uploads` | Product images written at runtime |

[Local setup](docs/setup.md) · [User guide](docs/user-guide.md) · [Requirements](docs/project-requirements.md) · [Database design](docs/database-design.md)
