# Setup

How to get this branch running locally, and what changed for your machine compared to `main`.

## Requirements

- Node.js (v18+ recommended, matches the tooling in this repo)
- npm
- PostgreSQL running locally (default port 5432)

## Flow

```
git clone / git checkout hardening-combined
        |
        v
npm install  x3  (root, backend, frontend)      <- REQUIRED, see below
        |
        v
cp backend/.env.example backend/.env  ...fill in secrets
        |
        v
createdb bingnondo        (migrate does NOT create the database)
        |
        v
npm run migrate           (creates _migrations, applies 002..026)
        |
        v
npm run dev               (backend :5000 + frontend :5173 together)
```

## Steps

### 1. Get the code

```bash
git clone <repo-url>
cd Bingnondo
git checkout hardening-combined
```

If you already have a local clone sitting on `main`:

```bash
git fetch origin
git checkout hardening-combined      # creates a local branch tracking origin
# or, to work on top of your main:
git checkout -b my-work hardening-combined
```

### 2. Install dependencies in three places

This step is **mandatory on every fresh clone**. `backend/node_modules` used to be
committed to the repo by accident; this branch untracks it. Dependencies are no
longer in git, so they must be reinstalled locally.

```bash
npm install                  # repo root (concurrently, for the `dev` script)
npm install --prefix backend
npm install --prefix frontend
```

### 3. Create your env file

```bash
cp backend/.env.example backend/.env
```

On Windows PowerShell:

```powershell
Copy-Item backend/.env.example backend/.env
```

Then edit `backend/.env` and fill in:

| Variable | What to do |
|---|---|
| `DB_PASSWORD` | Your local Postgres password |
| `JWT_ACCESS_SECRET` | A long random string |
| `JWT_REFRESH_SECRET` | A different long random string |
| `ESP32_DEVICE_KEY` | Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `ESP32_DEVICE_CODE` | e.g. `ESP32-KitchenA` — must match the physical device |
| `SMTP_*`, `MAIL_FROM` | Only needed if you want password-reset email to actually send |
| `DB_NAME_TEST` | Only if you intend to run the test suite (see step 7) |

`backend/.env` is gitignored. Never commit it.

### 4. Create the database

The migrate script only applies `backend/migrations/*.sql` against an existing
database. It does **not** create the database itself.

```bash
createdb bingnondo
```

Or via psql:

```sql
CREATE DATABASE bingnondo;
```

The name must match `DB_NAME` in your `.env`.

### 5. Run the migrations

```bash
npm run migrate --prefix backend
```

This creates the `_migrations` bookkeeping table and applies `002` through `026`.
It is idempotent — each file is applied once and recorded, so running it again is
safe and does nothing.

The lineage this branch adds on top of `main` includes: ESP32 device presence,
menu soft-delete, priced options, variant/flavor options, inventory categories,
refresh-token rotation, order-type checks, inventory FK tightening, staff role
checks, a report-index sweep, referral columns, cash/change columns, `paid_at`
backfill, a partial unique index for deductions, admin switch tables plus
`business_hours`/`created_by`, and a data fix closing abandoned counter tickets.

### 6. Optional: one-off data backfill

`backend/scripts/devcopy_backfill_025_complete_ready_paid_counter_orders.sql`
is a manual, idempotent backfill that completes counter orders which are still
sitting at `ready` but already paid.

It deliberately lives in `backend/scripts/`, **not** `backend/migrations/`, so
`npm run migrate` never applies it to your dev database automatically. Run it
manually only if your database has accumulated those stuck rows. Running it twice
is a no-op.

### 7. Optional: test database

```bash
npm run test:setup --prefix backend   # creates DB_NAME_TEST and restores schema
npm test --prefix backend
```

Two constraints:

- The Postgres role needs `CREATEDB` so the script can create the test database.
  If you cannot grant that, create the database yourself first — migrate then
  treats it as missing.
- `npm run test:setup` refuses to run if `DB_NAME_TEST` equals `DB_NAME`, and
  `npm run migrate` refuses to run with `NODE_ENV=test` pointed at the dev
  database. Both guards exist to stop the test suite wiping your dev data.

The test schema comes from `backend/scripts/base-schema.sql`, a tracked
schema-only dump of the migrated database, so a fresh clone needs nothing extra.
Setup restores that file and then records the numbered migrations as applied
rather than replaying them — replaying is not safe, because migrations `008` and
`011` add constraints with no preceding `DROP`, and Postgres has no
`ADD CONSTRAINT IF NOT EXISTS`.

### 8. Start the app

From the repo root:

```bash
npm run dev
```

This runs both halves concurrently:

- **backend** — `nodemon server.js` on port 5000, restarts on file change
- **frontend** — Vite on port 5173, proxies `/api` to `http://127.0.0.1:5000`

Other useful commands:

```bash
npm run build --prefix frontend    # production build
npm run lint --prefix frontend     # oxlint
npm run backend --prefix backend   # backend only
npm run frontend                   # frontend only
```

## What is different about this branch

**No CI.** `.github/workflows` is not part of this branch's tree, so GitHub runs
no checks on PRs raised from it. Restore the workflow file separately if you want
CI here.

**No enforced line endings.** `.gitattributes` is not part of this branch's tree
either. If you hit CRLF/LF churn on Windows, that file is the fix, and it needs
to be re-added.

**Dependencies are no longer in git.** Covered in step 2. This is the single
biggest practical difference for your machine: a pull that used to bring a working
`node_modules` now does not, so you must `npm install` after switching branches.

**Reference docs are local-only.** The architecture/flow/database design docs and
the schema dumps are gitignored. If you want them, ask the repo owner — they are
not in the pushed tree.

## Troubleshooting

**`ECONNREFUSED` / connection refused on the frontend.** The backend is not
running on port 5000. Start it, or check `PORT` in `backend/.env` matches the
proxy target in `frontend/vite.config.js`.

**Frontend loads but every API call fails.** Same root cause, or `FRONTEND_URL`
in `backend/.env` does not match where Vite is serving (`http://localhost:5173`).

**Migration errors about existing tables.** Migrations were already applied
partially, or you are pointing at an old database. Check `SELECT * FROM _migrations;`
to see what the database thinks it has.

**Tests refuse to start.** Usually `DB_NAME_TEST` is unset, equals `DB_NAME`, or
the role lacks `CREATEDB`. Read the error message; the scripts are explicit.

**Password-reset email does not arrive.** Expected with the blank `SMTP_*` values
in the example env. Fill them in with real SMTP credentials.