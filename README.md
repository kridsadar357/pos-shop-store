# POS Shop Store — Enterprise Retail & Wholesale

A full-stack, enterprise-grade Point of Sale for shops that sell **retail and
wholesale** — fast front-of-house checkout plus a complete back-office.

## Highlights

**Front-store POS** (BizPro-style enterprise UI, Thai)
- Navy app shell, live KPI cards, category rail, paginated product grid with
  status badges, and a rich cart panel.
- **Barcode/QR scanner auto-listen** (keyboard-wedge) + camera fallback.
- Retail/wholesale pricing, **members** with automatic member pricing.
- **Promotions** (percentage / fixed / buy-X-get-Y, auto-apply or coupon code).
- Payments: **Cash**, **PromptPay QR** (EMVCo + CRC16, encodes ID + amount),
  **Card**, **Store credit** — with cash tendering & change.
- **Shifts**: open with a cash float, close with cash reconciliation.
- **Customer second display** (`/display`) over BroadcastChannel **and** a
  WebSocket relay — works on an extended monitor or an IoT/embedded device.
- **80mm thermal receipt** printing + reprint.

**Back-office**
- Dashboard (KPIs, charts), Products & Stock (with images), Members,
  Promotions, Receive Goods, Stock Count (cycle counts), **Stock Ledger**
  (full backtrack audit trail), Sales (void + reprint), Shifts, Users, Settings.
- **Reports** with CSV export: Sales summary, Payment methods, Top products,
  Profit by category, Sales by hour, Tax summary, Low stock, Inventory
  valuation, Daily Z-report.
- **Roles**: Admin / Manager / Cashier (front-store for Cashier; back-office for
  Admin/Manager).

## Stack

| Layer    | Tech                                                        |
|----------|-------------------------------------------------------------|
| Frontend | React 18 + Vite + TypeScript + TailwindCSS + Zustand        |
| Backend  | Node + Express + TypeScript + Prisma ORM + ws               |
| Database | PostgreSQL 16 (Docker)                                       |

## Quick start

```bash
# 1. Start PostgreSQL (preflight checks the port for conflicts first)
npm run db:up

# 2. Install dependencies (root + server + web)
npm install && npm run setup

# 3. Set up the database schema + seed demo data
npm run db:migrate && npm run db:seed

# 4. Run the app (API on :4000 + WS relay, web on :5173)
npm run dev
```

Open http://localhost:5173 and log in with a seeded account.

## Seeded logins

| Role    | Username | Password   |
|---------|----------|------------|
| Admin   | admin    | admin123   |
| Manager | manager  | manager123 |
| Cashier | cashier  | cashier123 |

## Ports

| Service    | Port | Note                                          |
|------------|------|-----------------------------------------------|
| PostgreSQL | 5432 | Override with `DB_PORT` in `.env`             |
| Backend    | 4000 | REST API + `ws://…/ws/display` relay          |
| Web        | 5173 | Vite dev server                               |

`npm run db:up` runs `scripts/preflight.mjs`, which checks whether `DB_PORT` is
in use **before** `docker compose up` and tells you how to remap it.

## Notes

- **PromptPay**: set the receiving ID (mobile / Tax ID) under **Back-office →
  Settings**. Checkout generates a valid EMVCo QR encoding the ID **and the
  exact amount**, scannable by any Thai banking app. The QR also mirrors to the
  customer second display.
- **Customer display**: open `http://<host>:5173/display` on a second screen or
  device. In dev it connects directly to the backend WebSocket; in production it
  uses the same origin.
- **Receipts** print as 80mm thermal; reprint past sales from **Back-office →
  Sales → Receipt**.
- Reset to a pristine demo: `npm run db:reset && npm run db:up && npm run db:migrate && npm run db:seed`.
