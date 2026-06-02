const num = (d: unknown) => Number(d ?? 0);
const round2 = (n: number) => Math.round(n * 100) / 100;

export interface SaleProduct {
  id: number;
  name: string;
  retailPrice: unknown;
  wholesalePrice: unknown;
  wholesaleMinQty: number;
  cost: unknown;
  taxRatePct: unknown;
}
export interface SaleLine { productId: number; nameSnapshot: string; qty: number; unitPrice: number; unitCost: number; lineTotal: number }

/**
 * Per-line pricing for a POS sale. Each line picks the wholesale price when a
 * member is attached (memberGetsWholesale) OR the order is WHOLESALE and the line
 * qty meets the product's wholesale minimum; otherwise retail. VAT is summed per
 * line (inclusive or exclusive, product rate or default). Pure (takes products).
 */
export function computeSaleLines(opts: {
  items: { productId: number; qty: number }[];
  products: SaleProduct[];
  memberWholesale: boolean;
  type: 'RETAIL' | 'WHOLESALE';
  defaultRate: number;
  taxInclusive: boolean;
}): { subtotal: number; taxAmount: number; lineData: SaleLine[] } {
  const byId = new Map(opts.products.map((p) => [p.id, p]));
  let subtotal = 0;
  let taxAmount = 0;
  const lineData: SaleLine[] = opts.items.map((i) => {
    const p = byId.get(i.productId);
    if (!p) throw Object.assign(new Error(`Product ${i.productId} not found`), { status: 400 });
    const useWholesale = opts.memberWholesale || (opts.type === 'WHOLESALE' && i.qty >= p.wholesaleMinQty);
    const unitPrice = num(useWholesale ? p.wholesalePrice : p.retailPrice);
    const lineTotal = round2(unitPrice * i.qty);
    subtotal += lineTotal;
    const rate = p.taxRatePct != null ? num(p.taxRatePct) : opts.defaultRate;
    taxAmount += opts.taxInclusive ? lineTotal - lineTotal / (1 + rate / 100) : lineTotal * (rate / 100);
    return { productId: p.id, nameSnapshot: p.name, qty: i.qty, unitPrice, unitCost: num(p.cost), lineTotal };
  });
  return { subtotal: round2(subtotal), taxAmount: round2(taxAmount), lineData };
}
