# POS Shop Store — Enterprise Retail & Wholesale

A full-stack Point of Sale system for **retail + wholesale** shops.

- **Front-store**: fast checkout, barcode/QR scanner auto-listen, cash & PromptPay QR (with amount) payments.
- **Back-store**: products, categories, suppliers, stock receiving, inventory counts, stock adjustments, **backtrack stock ledger**, and a full report suite.
- **Roles**: Admin, Manager, Cashier (front-store gated for Cashier; back-store for Admin/Manager).

## Stack

| Layer    | Tech                                                        |
|----------|-------------------------------------------------------------|
| Frontend | React 18 + Vite + TypeScript + TailwindCSS + Zustand        |
| Backend  | Node + Express + TypeScript + Prisma ORM                    |
| Database | PostgreSQL 16 (Docker)                                       |
| Payments | Cash + PromptPay EMVCo QR (CRC16, generated server-side)    |

## Quick start

```bash
# 1. Start PostgreSQL (preflight checks the port for conflicts first)
npm run db:up

# 2. Install dependencies (server + web)
npm install
npm --prefix server install
npm --prefix web install

# 3. Set up the database schema + seed demo data
npm run db:migrate
npm run db:seed

# 4. Run the app (server on :4000, web on :5173)
npm run dev
```

Open http://localhost:5173 and log in with a seeded account (see below).

## Seeded logins

| Role    | Username | Password   |
|---------|----------|------------|
| Admin   | admin    | admin123   |
| Manager | manager  | manager123 |
| Cashier | cashier  | cashier123 |

## Ports

| Service    | Port | Note                                   |
|------------|------|----------------------------------------|
| PostgreSQL | 5432 | Override with `DB_PORT` in `.env`      |
| Backend    | 4000 | Override with `PORT`                    |
| Web        | 5173 | Vite dev server                         |

`npm run db:up` runs `scripts/preflight.mjs`, which checks whether `DB_PORT`
is already in use **before** `docker compose up`, and tells you how to remap it.

## PromptPay

Set the receiving PromptPay ID (mobile number or Tax/Citizen ID) under
**Back-store → Settings**. Checkout generates a valid EMVCo QR encoding the
PromptPay ID **and the exact amount**, scannable by any Thai banking app.
