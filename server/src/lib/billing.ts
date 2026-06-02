const num = (d: unknown) => Number(d ?? 0);
const round2 = (n: number) => Math.round(n * 100) / 100;

export interface BillItemInput { productId: number; qty: number; unitPrice?: number }
export interface BillProduct { id: number; name: string; retailPrice: unknown; wholesalePrice: unknown; cost: unknown; taxRatePct: unknown }
export interface BillLine { productId: number; nameSnapshot: string; qty: number; unitPrice: number; lineTotal: number; unitCost: number }

/**
 * Pure bill totals for quotations / layaways (and any "build a sale from a list"
 * flow). Resolves each line's unit price from the chosen type (or an explicit
 * override), sums line totals, derives VAT per line (inclusive or exclusive, using
 * the product's own rate or the default), caps the discount at the subtotal, and
 * computes the net total. Takes already-fetched products so it is DB-free/testable.
 */
export function buildBill(opts: {
  items: BillItemInput[];
  products: BillProduct[];
  type: 'RETAIL' | 'WHOLESALE';
  discount: number;
  defaultRate: number;
  taxInclusive: boolean;
}): { subtotal: number; discount: number; taxAmount: number; total: number; lines: BillLine[] } {
  const pmap = new Map(opts.products.map((p) => [p.id, p]));
  let subtotal = 0;
  let tax = 0;
  const lines: BillLine[] = opts.items.map((i) => {
    const p = pmap.get(i.productId);
    if (!p) throw Object.assign(new Error(`Product ${i.productId} not found`), { status: 400 });
    const unitPrice = round2(i.unitPrice ?? num(opts.type === 'WHOLESALE' ? p.wholesalePrice : p.retailPrice));
    const lineTotal = round2(unitPrice * i.qty);
    subtotal += lineTotal;
    const r = p.taxRatePct != null ? num(p.taxRatePct) : opts.defaultRate;
    tax += opts.taxInclusive ? lineTotal - lineTotal / (1 + r / 100) : lineTotal * (r / 100);
    return { productId: p.id, nameSnapshot: p.name, qty: i.qty, unitPrice, lineTotal, unitCost: num(p.cost) };
  });
  subtotal = round2(subtotal);
  const discount = round2(Math.min(subtotal, opts.discount));
  const taxAmount = round2(tax);
  const total = round2(opts.taxInclusive ? subtotal - discount : subtotal + taxAmount - discount);
  return { subtotal, discount, taxAmount, total, lines };
}
