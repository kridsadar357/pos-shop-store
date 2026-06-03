# POS Suite — Remaining Tasks / Roadmap

Goals **not yet built**, grouped by area. Items already shipped (POS checkout,
products, suppliers, members, promotions, stock ledger, stock count, receiving,
purchase orders, returns/refunds, reports + dashboard, exports, settings tabs,
setup wizard, licensing + 14-day demo, customer-display PWA, ESC/POS network
printing, notifications, global search) are **not** listed here.

Legend: ⬜ not started · 🟨 partial (notes)

---

## 0. Cross-cutting / CRM
- ✅ Supplier purchase history — `GET /api/suppliers/:id/history` returns committed POs +
  stats (count, total ordered, paid, outstanding, last order); "ประวัติ" modal on the
  Suppliers page (KPI tiles + PO table). Mirrors the member purchase history.

## 1. Multi-branch & warehousing
- ✅ **Phase 1** — `Branch` model + management page, branch switcher, sales &
  shifts attributed to a branch, branch filter on the Sales list
- ✅ **Phase 2 — per-branch stock balances** — `BranchStock` (product × branch),
  branch-aware ledger via `postMovement` (Product.stockQty kept as the all-branch
  total), sales decrement the selling branch
- ✅ **Stock transfer between branches** — `StockTransfer` + page; moves
  BranchStock between branches (total preserved), with source-availability guard
- ✅ Branch selection on **receiving, PO receive, and adjust** (destination branch
  picker; defaults to the active branch)
- ✅ POS reads **branch** stock for availability — products, out-of-stock KPIs and
  badges are scoped to the terminal's active branch (branch selector in the header)
- ✅ Branch filter on **Dashboard, Movements, Shifts, Sales, and the Reports page**
  (all report types); the no-branch view is the consolidated all-branch report
- ✅ Branch-scoped **stock count** — counts snapshot & reconcile the chosen branch's
  on-hand and post COUNT movements to that branch
- ✅ Per-branch settings — PromptPay, printer (type/address/paper) and receipt
  header/footer overrides per branch (empty = inherit global); resolved in
  checkout QR, network printing and the POS receipt

**Multi-branch (§1) is complete.** Possible future polish: per-branch logo, and
branch-scoped POS reprint header/footer in the back office (Sales reprint footer QR
is already branch-correct).

## 2. Hardware & printing
- 🟨 ESC/POS **USB** printing — only network (port 9100) is implemented; USB needs a local print agent/bridge
- ✅ Cash-drawer kick (ESC/POS drawer pulse) — `buildReceipt` pulses the drawer on a
  cash receipt when `Setting.openDrawerOnCash`; plus a manual `/api/print/drawer` endpoint
  + "ทดสอบเปิดลิ้นชัก" button in the Printer settings
- ✅ Configurable Thai code page in the UI — `Setting.escposCodepage` (default 21),
  editable in the Printer settings; `Builder.init(codepage)` uses it (env is just the default)
- ✅ Barcode / shelf-label printing — `Labels` page: pick products (search/category),
  set copies + labels-per-row + retail/wholesale price, print an A4 grid of labels with
  a CODE128 barcode (jsbarcode) of each product's barcode/SKU, name, and price
- ✅ Customer pole display (VFD) support — 2×20 char network pole display via the de-facto
  **CD5220** command set. Pure byte builder `server/src/lib/vfd.ts` (`buildVfdFromState` maps the
  POS DisplayState → two lines: last item + running TOTAL while ringing up, amount due at
  PAYMENT, CHANGE + THANK YOU when PAID; ASCII-only — Thai → '?', each line padded/truncated to
  20). `Builder` mirrors `escpos.ts`; `sendToVfd` = same raw-TCP path (serial-to-LAN bridge /
  printer DM-D pass-through, :9100). 12 unit tests (framing + state rendering + ASCII reduction).
  `Setting.vfdEnabled`/`vfdAddress` (+ per-branch `Branch.vfdAddress` override via
  `resolvedSettings`); `/api/vfd/display` + `/api/vfd/test` (404→400 when unconfigured). Settings
  Printer tab has the enable + address + "ทดสอบจอแสดงผล" controls; the POS mirrors every
  DisplayState change to the VFD (debounced, fire-and-forget, gated on vfdEnabled). Verified
  end-to-end against a TCP capture — correct CD5220 bytes on the wire. (Per-branch VFD address
  has no back-office editor yet — inherits global; minor polish.)

## 3. Inventory depth
- ✅ Bulk product import (CSV/Excel) — `POST /api/products/import` upserts by SKU,
  resolves/creates categories by name (catalog only — stock stays in the ledger);
  Products page "นำเข้า" button parses the file with `xlsx` (lazy) and reports
  created/updated/errors. Complements the existing CSV/Excel/ZIP export
- ✅ Reorder suggestions / **auto-PO generation** from low-stock (branch-aware;
  suggested qty + last cost + preferred supplier; one-click creates POs grouped
  by supplier) — on the Purchase Orders page
- ✅ Per-supplier product **cost history** (from goods receipts; shown in the
  product editor) — feeds the reorder suggestions
- ✅ Editable **supplier price lists** — `SupplierProduct` catalogue (per-product
  supplier↔cost with a preferred flag), managed in the product editor; reorder
  suggestions prefer the price list (preferred → cheapest) over last-receipt cost
- ✅ Units-of-measure conversion (buy by box, sell by piece) — Product has a
  purchase unit + pack size; **receiving and PO line entry** both convert
  pack→base (stock & ledger stay in base units)
- ✅ Batch / lot & expiry-date tracking — opt-in per product (`Product.trackBatches`).
  `ProductBatch` (lot/expiry/qtyRemaining per product×branch) maintained by `postMovement`:
  receives create batches, sales/outflows consume **FEFO** (earliest expiry first), positive
  non-receive deltas + shortfalls use a no-expiry catch-all (Σbatch == net change since enabling).
  Both receiving paths (Receive page + PO receive) capture lot/expiry; product editor lists batches
  and records **opening/manual batches** (no stock movement) for pre-existing stock; "ใกล้หมดอายุ"
  report (also surfaced in the topbar notification bell as near-expiry/expired alerts).
  Verified FEFO + report + opening-count end-to-end
- ✅ Serial-number tracking — opt-in per product (`Product.trackSerials`). `ProductSerial`
  (per-unit serialNo + status IN_STOCK/SOLD/RETURNED + receipt/sale ref). Serials are
  scanned-in on **both receiving paths** — the inventory Receive page AND PO receiving
  (per-serialized-line textarea → `registerSerials`), registered manually for opening stock,
  looked up + status-managed in the product editor. **Serial / warranty lookup** (`/back/serials`):
  cross-product search by serial or product name/SKU + status filter, resolves the sale order no.
  (`GET /products/serials/search`); exportable. **POS checkout consume**: serialized cart lines
  capture serials (count must match qty), `consumeSerials` marks them SOLD + saleId in the sale
  tx (bad/duplicate serial rolls the whole sale back); voiding a sale `releaseSerials` back to
  IN_STOCK. Covered by integration tests (consume/release + reject-unknown).

## 4. Sales & customer features
- ✅ Member purchase history + lifetime value — `GET /api/members/:id/sales` returns the
  member's bills + stats (orders, total spent, avg, last visit); "ประวัติ" modal on the
  Members page shows the history table + KPI tiles (CRM)
- ✅ Bulk member import (CSV/Excel) — `POST /api/members/import` upserts by phone (the natural
  key; numeric phones coerced to string, missing phone/name rejected per row), never touches
  points. Members page "นำเข้า" button parses the file via lazy `xlsx`. Columns: phone, name,
  code, email, note. Mirrors the product import
- ✅ Loyalty points: accrual + redemption — `Member.points` + `PointTransaction`
  ledger via a single `postPoints()` chokepoint; earn on the net total and redeem
  points as a bill discount at the POS (capped by balance + bill room); voids
  reverse both sides; Settings config (earn baht / redeem value); Members page shows
  balance + history + manual adjust; receipt prints earned/redeemed points
- ✅ Quotations / proforma → convert to sale — `Quotation` + `QuotationItem`
  (snapshotted line prices, retail/wholesale, tax-aware totals). Back-office page:
  CRUD, status workflow (draft→sent→accepted/expired/cancelled), printable A4
  document, export. One-click **convert** creates a completed sale server-side from
  the quoted prices (default เงินเชื่อ/CREDIT), decrements stock, marks CONVERTED.
  **Email**: `POST /quotations/:id/email` sends the quotation (pure `buildQuotationEmail`,
  unit-tested) and marks a DRAFT → SENT on success; "อีเมล" button on the Quotations page
- ✅ Layaway / deposits / partial payment — `Layaway` + `LayawayItem` +
  `LayawayPayment`; create with an opening deposit, record installments (capped at
  the balance), then **complete** (only when fully paid) builds a sale from the
  snapshotted lines, tenders = the collected payments by method, and decrements stock.
  Back-office Layaway page (create + detail with installments/complete/cancel)
- ✅ Split / multi-tender payments on one bill — `SalePayment` model (per-method
  applied amount, summing to the total) is the source of truth; checkout accepts a
  `payments[]` array (cash may overpay → change, non-cash must fit the bill). POS
  split modal, receipt tender breakdown, and split-aware `shiftTotals` + reports
  (payment-methods, cashier). Backfilled existing sales 1 tender each
- ✅ Promotion **scheduling UI** — `startsAt`/`endsAt` editable in the Promotions
  form (datetime-local), with scheduled/active/expired status chips + date range in
  the list; the POS already enforces the window via `activePromotions()`
- ✅ Gift cards / store credit — `GiftCard` + `GiftCardTxn` ledger (via a single
  `postGift()` chokepoint); admin page to issue / reload / enable-disable / view
  history. New `GIFT` PaymentMethod: redeemed at POS as a tender in the split-payment
  modal (code + amount, validated & deducted server-side); voids refund the card.
  Split-aware everywhere (byMethod, reports, receipt). Also a **refund option**: a return
  with refund method GIFT issues a new store-credit card (`RC-xxxxxx`) loaded with the refund
- 🟨 Email / SMS / LINE receipt delivery — **Email done**: SMTP settings on `Setting`
  (host/port/secure/user/pass/from; password redacted from GET, `smtpPassSet` flag, empty
  pass on PUT keeps existing), `lib/mailer.ts` (nodemailer, throws 400 if unconfigured),
  pure `lib/receiptEmail.ts` (HTML + text + subject, HTML-escaped, unit-tested), `POST
  /sales/:id/email` emails a receipt, `POST /settings/email-test` sends a test. Settings
  "อีเมล (SMTP)" tab + "อีเมล" button on the Sales bill detail. SMS/LINE still pending.

## 5. Finance & accounting
- ✅ Petty cash / cash in-out during a shift — `CashMovement` model + POS drawer
  modal (pay-in / pay-out with reason); expected drawer cash and the close-shift
  reconciliation now account for `float + cash sales + pay-ins − pay-outs`
- ✅ Accounts payable: payments against POs — `SupplierPayment` model +
  `/api/payables` (committed POs with total / paid / outstanding, supplier & status
  filters, summary totals; record-payment capped at the outstanding balance).
  Back-office Payables page with KPIs, payment modal + history, and export
- ✅ Full tax invoice (ใบกำกับภาษีเต็มรูป) — `TaxInvoice` (1:1 with a sale) capturing
  buyer legal name / tax ID / address / branch + an official sequential number; issued
  from the Sales bill detail (idempotent, PAID-only), prints a full A4 VAT invoice with
  base / VAT / total derived from the inclusive total
- ✅ Expense tracking & categories — `Expense` model + `/api/expenses` (date-range /
  branch / category filters); back-office Expenses page (ListToolbar + filters +
  Excel/PDF/CSV export, total + by-category summary, CRUD modal). Branch-aware,
  records the user; seeded with a few demo expenses
- 🟨 Multi-currency support — configurable **secondary-currency display** (approx.
  conversion at a set rate) shown on the POS net total and the receipt
  (`Setting.secondaryCurrency`/`secondaryRate`, `secondaryAmount()` helper). Display-only;
  transactions are still recorded in THB. Full multi-currency accounting still pending.

## 6. Reporting & data
- ✅ Cash-flow report — `/reports/cash-flow` (range + branch): cash in (cash sales + petty-cash
  pay-ins) vs cash out (pay-outs + cash expenses + cash refunds) → net. New "กระแสเงินสด" tab
  (statement + KPIs + CSV). Synthesizes sales, petty cash, expenses, and returns
- ✅ Tax-invoice register (รายงานภาษีขาย, สำหรับ ภ.พ.30) — `GET /api/tax-invoices` lists
  issued full tax invoices over a date range with per-invoice VAT base/amount; back-office
  register page (month-default range, period totals base/VAT/total, export)
- ✅ Profit & Loss report — `/reports/profit-loss` (date-range + branch): revenue → less
  VAT → net revenue → less COGS → gross profit → less operating expenses (from the Expense
  table, by category) → net profit, with margins. New "กำไร-ขาดทุน (P&L)" tab on the Reports
  page (statement view + KPIs + CSV export). Ties sales and expenses into the bottom line
- ✅ Scheduled / emailed reports — daily sales-summary email. `computeDailySummary` (orders,
  revenue, cost, tax, gross profit, expenses, by-method, top-5 items) + pure `buildDailySummaryEmail`
  (HTML+text, escaped, unit-tested). `POST /reports/email-daily` {to?, date?} sends on demand;
  an in-process scheduler (`startReportScheduler`, started in index.ts) sends the prior day's
  summary at `Setting.reportEmailHour` when `reportEmailEnabled` + `reportEmailTo` are set
  (dedup via `reportEmailLastSent`; trigger logic `shouldSendDailyReport` is pure + unit-tested).
  Settings "อีเมล (SMTP)" tab has the enable/recipient/hour controls + "ส่งสรุปวันนี้เลย" button.
- ✅ Z-report / X-report end-of-day printout — printable `ShiftReport` (80mm, same
  print path as the receipt): X = mid-shift snapshot from the POS *More* menu, Z =
  end-of-day close report (offered after closing + reprintable per shift on the
  back-office Shifts page). Shows orders, per-payment-method breakdown
  (`shiftTotals.byMethod`), pay-in/out, and the cash-drawer reconciliation
- ✅ Data backup & restore — generic export/restore driven by Prisma DMMF
  (topological FK order, no per-model maintenance). `/api/backup/export` downloads a
  full JSON snapshot; `/api/backup/restore` atomically replaces all data in one
  transaction (rolls back on any error) and resets autoincrement sequences. Admin
  Backup page with download + upload/confirm. (Verified by a full round-trip.)
- ✅ Saved/custom report builder — `/back/custom-reports`: an ad-hoc report engine over
  PAID sale-item facts. Pick 1–2 **group-by dimensions** (day/month/branch/cashier/payment/
  type/category/product/member) + any **metrics** (orders=distinct bills, qty, sales=Σline,
  cost, profit=sales−cost, margin%), a date range + branch, then run. Core aggregation is a
  pure, unit-tested function (`server/src/lib/customReport.ts`, 9 vitest cases — distinct-bill
  counting, 2-dim cross-tab, month-from-day, sort, config validation). `SavedReport` model +
  `/api/custom-reports` (meta/run + name-unique CRUD, ADMIN/MANAGER); definitions are saved
  (JSON config), reloaded, and deleted from the builder. Results table sorts on header click,
  shows a totals row, and exports to Excel/CSV/PDF via the shared `makeExporters`. Verified
  end-to-end against seeded sales

## 7. Security & administration
- 🟨 Granular permissions — ADMIN can choose which back-office pages a MANAGER may
  open (`Setting.managerPages`); enforced in the sidebar nav + a route gate in
  BackLayout (empty = full access; dashboard always allowed). UI-level access control;
  admin-only data routes (users/branches/audit/backup) remain hard-gated server-side.
  Full per-action backend permission matrix still pending.
- ✅ Audit log of user actions — `AuditLog` model + app-level `auditLogger`
  middleware that records every mutating /api call (actor snapshot, method, path,
  action label, status, IP) after the response finishes; no request bodies stored.
  ADMIN-only viewer page (`/back/audit`) with search / date-range / method filters
  and export
- ✅ Per-user PIN / quick cashier switch on the POS — `User.pinHash`; admin sets/clears
  a 4–8 digit PIN on the Users page; the POS *More* menu has a PIN-pad "สลับผู้ใช้" that
  re-authenticates via `POST /api/auth/pin` and reloads the new user's shift
- ✅ Password management — self-service **change password** (`/api/auth/change-password`,
  verifies current; available to every role from the back-office user menu and the POS
  More menu) + admin **reset password** per user on the Users page (PUT). (True
  forgot-password email flow still pending — no mail infra.)
- ✅ Online license re-validation + grace — `POST /api/license/revalidate` re-checks an
  ACTIVE license against the vendor: success updates expiry/lastCheckedAt; a definite "invalid"
  expires it; an **unreachable vendor keeps it valid (grace)** so a network outage never locks
  the shop out. `licenseHealth()` (pure, tested) reports needsRevalidation/withinGrace; the
  License settings tab shows a re-check button + an overdue nudge

## 8. Platform / offline / PWA
- 🟨 Offline POS — **Phase 1 (replay-safe checkout) done**: `Sale.clientRef` (nullable
  unique) idempotency key. `POST /api/sales` accepts an optional `clientRef`; a resend of the
  same key returns the original bill (HTTP 200) instead of creating a duplicate — covers offline
  replay AND double-click/flaky-network double-submits. Pre-check by clientRef + a P2002
  unique-race fallback inside the handler; the POS generates a stable `crypto.randomUUID()` per
  cart (reused on retry, reset by `clearCart` on success). Verified e2e: same ref twice → one
  sale (201 then 200, identical id); no-ref path still 201.
  **Phase 2 (offline sale outbox) done**: `web/src/store/offline.ts` `useOffline` — a
  localStorage-persisted queue of sales that fail to reach the server. POS `completeSale` catches
  connectivity failures (`isNetworkError`: `!navigator.onLine` / fetch `TypeError`), enqueues the
  exact POST body (carrying its clientRef), and lets the cashier keep selling. `sync()` replays
  oldest-first (idempotent via clientRef; stops on a network error, flags business rejections);
  auto-triggered on login, the `online` event, and a 20s interval (`App.tsx`). POS header
  `ConnBadge` shows live online/offline + a clickable "รอซิงค์ N" chip (manual replay). Verified
  e2e: a queued sale replays to exactly one bill, a duplicate sync trigger is a no-op (201 then
  200).
  **Phase 3 (offline catalog cache) done**: `web/src/lib/idb.ts` (tiny promise IndexedDB
  key-value, no dep) + `web/src/lib/catalogCache.ts` cache the branch-scoped **products**,
  **categories**, and **resolved settings**. POS load points write the cache on a successful
  fetch and fall back to it on failure (offline) — so the product grid + cart + checkout
  (→ outbox) survive a **cold reload while offline**. Fail-safe by construction: cache writes
  are best-effort (errors swallowed), reads only run inside a fetch `.catch`, so the online path
  can't regress. Verified by typecheck + production build + review (the offline-reload runtime
  path itself wants a headless-browser e2e — see §8 e2e). **Offline POS is now functionally
  complete**; remaining polish: cache active promotions for offline preview, and an explicit
  service-worker app-shell so the SPA assets load offline (Vite PWA only ships the customer
  display today).
- ✅ Production deploy story — single-image deploy: Express serves the API **and** the
  built SPA (`WEB_DIST`, SPA fallback for non-`/api`/`/uploads`/`/ws` GETs). Multi-stage
  `Dockerfile` (build web → build server → slim runtime), `docker-compose.prod.yml`
  (Postgres + app, `prisma migrate deploy` on start, uploads/pgdata volumes), `.dockerignore`,
  and `DEPLOY.md` (incl. reverse-proxy/HTTPS + WS notes). First run → /setup wizard.
  Verified end-to-end: `docker compose up` → migrations applied on a fresh DB → /health + SPA
- 🟨 Automated tests + CI — Vitest in `server` (65 unit tests). Every money calc is a pure,
  tested function: **POS sale line pricing + wholesale selection** (`lib/salePricing.ts`),
  **split-payment tender** (`lib/tender.ts`), **loyalty redeem/earn** (`lib/loyaltyCalc.ts`),
  **returns refund proration** (`lib/refundCalc.ts`), **quotation/layaway bill totals**
  (`lib/billing.ts`), the **promotion engine** (`lib/promotions.ts` — %/fixed/BXGY ×
  bill/product/category + coupons + minSpend), plus PromptPay CRC/payload + ESC/POS bytes.
  `npm --prefix server test`. Plus **integration tests** (`npm run test:integration`, 3 tests)
  that exercise the real `postMovement` stock chokepoint + batch FEFO against Postgres via a
  transaction-rollback harness (zero residue) — covering every DB-mutation chokepoint
  (`postMovement`+FEFO, `postPoints`, `postGift`, `nextSeq`), 7 integration tests.
  GitHub Actions (`.github/workflows/ci.yml`):
  install → prisma generate → **migrate deploy on a Postgres service** → unit test → **integration
  test** → typecheck-build server + web. Root `npm test` / `npm run test:integration`. (e2e still
  to expand.)

## 9. Smaller polish / known stubs
- ✅ Sidebar "เปลี่ยนสาขา" — the back-office POS sidebar branch button is now a live
  branch switcher (`BranchSwitcher` in `PosSidebar.tsx`) backed by the shared `useBranch`
  store: a `<select>` of active branches (≥2) or a static pill (single-branch), reusing the
  same `setActive` the header `BranchPill` uses — so switching re-scopes POS products +
  resolved settings instantly (see §1)
- 🟨 Code-split — the heavy export libs (xlsx+jszip, ~173 KB gz) are now lazy-loaded
  (`lib/export.ts` dynamic `import()`), off the initial load of every export-capable page;
  keep new heavy libs lazy as features grow
- ⬜ i18n toggle (UI is Thai-only; English option)
- ✅ `*.tsbuildinfo` gitignored + untracked (build cache no longer committed)
