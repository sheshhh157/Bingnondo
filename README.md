<p align="center">
  <img src="https://github.com/user-attachments/assets/a02b4308-47f7-4aee-93fa-2a00e543e45f" alt="Bingnondo Cafe Logo" width="200"/>
</p>

<h1 align="center">Bingnondo Café — Manager Dashboard</h1>

<p align="center">
  A live, read-only operations dashboard for the Bingnondo Café store manager — kitchen, stock, delivery, and sales in one screen.
</p>

---

## Overview

The Bingnondo Manager Dashboard gives the store manager a single live view of everything happening in the café — kitchen orders, inventory levels, deliveries, and sales — all updating in real time. No more switching between the POS, kitchen display, or spreadsheets.

**Key principle:** observe and report, never mutate. The dashboard is strictly read-only.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite 8, React Router v7 |
| Realtime | Socket.io |
| Charts & Maps | Recharts, Leaflet / React Leaflet |
| Backend | Node.js (≥18), Express |
| Database | PostgreSQL |
| Auth | JWT, bcrypt |
| File Storage | Cloudinary |
| Email | Nodemailer (SMTP / Ethereal) |

---

## Features

- **Live Dashboard** — kitchen orders, low-stock alerts, delivery tracking, and sales stats updating every few seconds via Socket.io
- **Sales Report** — date-range picker, CSV export, and per-order drill-down
- **Oversight Hub** — dedicated views for kitchen, stocks, and delivery in one place
- **Honest Degraded State** — when the backend is unreachable, the UI shows a clear stale/error indicator instead of fabricating data
- **Chinese-heritage Design** — warm rice-paper background, seal-red & aged-gold palette, Noto Sans/Serif TC typography

---

## Project Structure

```
Bingnondo-main/
├── backend/
│   ├── src/
│   │   ├── config/        # DB, Cloudinary, mailer, ESP32 config
│   │   ├── middleware/    # Auth, rate limiting
│   │   └── modules/       # Admin, auth, customer, kitchen, inventory, delivery, etc.
│   ├── migrations/        # SQL migration files
│   ├── scripts/           # migrate.js, seed scripts
│   └── server.js
└── frontend/
    └── src/
        ├── components/    # Shared UI components
        ├── pages/         # Dashboard pages (kitchen, stocks, delivery, sales)
        └── index.css      # Design tokens (heritage palette, typography)
```

---

## Getting Started

### Prerequisites

- Node.js ≥ 18
- PostgreSQL database (local or Supabase)

### Backend Setup

```bash
cd backend
cp .env.example .env
# Fill in your DATABASE_URL and other values in .env
npm install
npm run migrate
npm run dev        # Runs on port 5000
```

### Frontend Setup

```bash
cd frontend
npm install
npm run dev        # Runs on port 5174, proxied to backend
```

---

## Database Configuration

The backend accepts either a full PostgreSQL connection string or individual host/port/name/user/password values.

**Using Supabase:**
1. Go to **Project Settings → Database** and copy the connection string
2. Paste it as `DATABASE_URL` in `backend/.env`
3. Set `DATABASE_SSL=true`
4. Use the **Session pooler URL** if your host does not support IPv6
5. Never commit `backend/.env` to version control

**Using individual settings:** leave `DATABASE_URL` empty and fill in `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, and `DB_PASSWORD`.

---

## Password Reset Emails

Staff, rider, and admin accounts can reset their password from the login page via a 6-digit OTP (valid for 10 minutes).

| Mode | Setup | Where the code appears |
|---|---|---|
| **Development** (default) | Leave `SMTP_HOST` empty | Backend console — an Ethereal preview URL is printed; nothing is delivered |
| **Production** | Fill all `SMTP_*` values in `.env` | The user's real inbox |

**Real delivery setup:**
1. Pick an SMTP provider — Gmail (2FA + App Password) or Brevo (300/day free tier)
2. Fill `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, and `MAIL_FROM` in `.env`
3. Restart the backend — the Ethereal preview lines disappear
4. Check the inbox (first sends may land in spam)

> If email is unavailable, an admin can still reset any account from the admin panel (Staff Accounts / Riders pages) — no email required.

---

## Design Tokens

The heritage palette and typography live in `frontend/src/index.css` and are binding — do not replace them with a CSS framework.

| Token | Value |
|---|---|
| `seal-red` | `#B91C1C` |
| `aged-gold` | `#B45309` |
| `rice-paper` | `#FDF6EC` |
| Body font | Noto Sans TC |
| Heading font | Noto Serif TC |

---

## License

Private repository — Bingnondo Café. Not licensed for public distribution.
