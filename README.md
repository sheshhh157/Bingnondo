# Bingnondo

## Password reset emails

Staff, rider, and admin accounts can reset their own password from the login
page (**Forgot password?**). The user receives a 6-digit code (valid 10
minutes) and, after a successful reset, a "password was changed" alert.

Delivery has two modes, controlled by `backend/.env`:

| Mode | Setup | Where the code shows up |
|---|---|---|
| **Development** (default) | Leave `SMTP_HOST` empty | Backend console — an Ethereal preview URL is printed per email; nothing is delivered |
| **Real delivery** | Fill all `SMTP_*` values (see `backend/.env.example`) | The user's real inbox — no terminal involved |

Real delivery setup:
1. Pick a sender provider — Gmail (2FA + App Password) or Brevo (300/day free).
2. Fill `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS` and
   set `MAIL_FROM` to that same real sender address (a domain you do not own
   lands in spam).
3. Restart the backend. Expect `[mailer] Using SMTP transporter: ...` — the
   Ethereal preview lines disappear.
4. Request a reset and check the inbox (first sends may land in spam).

Notes:
- Email requires outbound internet. If it is unavailable, an admin can still
  reset any account from the admin panel (Staff Accounts / Riders pages) — no
  email required.
- If the backend runs with `NODE_ENV=production` and no `SMTP_HOST`, it logs a
  one-time warning and every send fails with a clear "SMTP is not configured"
  error instead of failing silently per-send.
