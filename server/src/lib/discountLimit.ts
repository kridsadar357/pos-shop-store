// Enforces the cashier manual-discount cap at checkout. Only the CASHIER role is capped;
// ADMIN/MANAGER are unlimited. Pure + tested; the sales route calls this before committing.

export function withinDiscountLimit(opts: {
  role: string;
  discountAmount: number; // the manual bill discount (absolute, base currency)
  subtotal: number;
  maxPct: number; // 0–100; 100 = unlimited
}): boolean {
  const { role, discountAmount, subtotal, maxPct } = opts;
  if (role !== 'CASHIER') return true; // managers/admins aren't capped
  if (maxPct >= 100) return true; // unlimited
  if (subtotal <= 0 || discountAmount <= 0) return true; // nothing to cap
  const pct = (discountAmount / subtotal) * 100;
  return pct <= maxPct + 1e-9;
}
