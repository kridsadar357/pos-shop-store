# POS Suite — Remaining Tasks / Roadmap

Goals **not yet built**, grouped by area. Items already shipped (POS checkout,
products, suppliers, members, promotions, stock ledger, stock count, receiving,
purchase orders, returns/refunds, reports + dashboard, exports, settings tabs,
setup wizard, licensing + 14-day demo, customer-display PWA, ESC/POS network
printing, notifications, global search) are **not** listed here.

Legend: ⬜ not started · 🟨 partial (notes)

---

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
- ⬜ Cash-drawer kick (ESC/POS drawer pulse on cash payment)
- ⬜ Configurable Thai code page in the UI (currently env `ESCPOS_THAI_CODEPAGE`)
- ⬜ Barcode / shelf-label printing (product labels with barcode + price)
- ⬜ Customer pole display (VFD) support

## 3. Inventory depth
- ✅ Reorder suggestions / **auto-PO generation** from low-stock (branch-aware;
  suggested qty + last cost + preferred supplier; one-click creates POs grouped
  by supplier) — on the Purchase Orders page
- ✅ Per-supplier product **cost history** (from goods receipts; shown in the
  product editor) — feeds the reorder suggestions
- 🟨 Editable **supplier price lists** (a `SupplierProduct` catalogue) — only the
  derived cost *history* exists; no maintained price list yet
- ⬜ Units-of-measure conversion (buy by box, sell by piece) — add purchase unit +
  units-per-pack to Product; convert on receiving/PO
- ⬜ Batch / lot & expiry-date tracking — **large**: needs batch-level balances
  layered on the per-branch stock model + FEFO picking
- ⬜ Serial-number tracking — **large**: per-unit records + scan-in/scan-out

## 4. Sales & customer features
- ⬜ Loyalty points: accrual + redemption (members exist, points do not)
- ⬜ Quotations / proforma → convert to sale
- ⬜ Layaway / deposits / partial payment
- ⬜ Split / multi-tender payments on one bill
- 🟨 Promotion **scheduling UI** — `startsAt`/`endsAt` exist in the schema but aren't editable in the Promotions form
- ⬜ Gift cards / store credit (esp. as a refund option)
- ⬜ Email / SMS / LINE receipt delivery

## 5. Finance & accounting
- ⬜ Petty cash / cash in-out during a shift (pay-in / pay-out)
- ⬜ Accounts payable: supplier invoices & payments against POs
- ⬜ Full tax invoice (ใบกำกับภาษีเต็มรูป) vs. the current abbreviated receipt
- ⬜ Expense tracking & categories
- ⬜ Multi-currency support (currently THB only)

## 6. Reporting & data
- ⬜ Scheduled / emailed reports
- ⬜ Z-report / X-report end-of-day printout
- ⬜ Data backup & restore (export/import)
- ⬜ Saved/custom report builder

## 7. Security & administration
- ⬜ Granular permissions (beyond ADMIN/MANAGER/CASHIER roles)
- ⬜ Audit log of user actions (general activity, not just the stock ledger)
- ⬜ Per-user PIN / quick cashier switch on the POS
- ⬜ Password reset / forgot-password flow
- ⬜ Online license re-validation + grace handling (currently activate/demo only)

## 8. Platform / offline / PWA
- 🟨 Offline POS — the customer display is an installable PWA, but the POS itself
  doesn't queue sales offline; needs local persistence + sync
- ⬜ Production deploy story (Docker image for server + built web, reverse proxy, HTTPS)
- ⬜ Automated tests (unit/integration/e2e) and CI

## 9. Smaller polish / known stubs
- ⬜ Sidebar "เปลี่ยนสาขา" — currently a "coming soon" toast (see §1)
- ⬜ Code-split warning long-term: keep heavy libs lazy as features grow
- ⬜ i18n toggle (UI is Thai-only; English option)
- ⬜ Bundle `tsconfig.tsbuildinfo` into .gitignore (build cache currently tracked)
