import { describe, it, expect } from 'vitest';
import { computeSaleLines, type SaleProduct } from '../salePricing.js';

const P: SaleProduct[] = [
  { id: 1, name: 'A', retailPrice: 100, wholesalePrice: 80, wholesaleMinQty: 12, cost: 60, taxRatePct: null },
];
const opts = (over: Partial<Parameters<typeof computeSaleLines>[0]>) =>
  computeSaleLines({ items: [{ productId: 1, qty: 1 }], products: P, memberWholesale: false, type: 'RETAIL', defaultRate: 7, taxInclusive: true, ...over });

describe('computeSaleLines', () => {
  it('retail price for a normal retail line', () => {
    const r = opts({ items: [{ productId: 1, qty: 2 }] });
    expect(r.lineData[0].unitPrice).toBe(100);
    expect(r.subtotal).toBe(200);
  });

  it('member always gets wholesale (ignores qty/type)', () => {
    const r = opts({ memberWholesale: true, items: [{ productId: 1, qty: 1 }] });
    expect(r.lineData[0].unitPrice).toBe(80);
  });

  it('WHOLESALE type uses wholesale only when qty meets the minimum', () => {
    expect(opts({ type: 'WHOLESALE', items: [{ productId: 1, qty: 12 }] }).lineData[0].unitPrice).toBe(80);
    expect(opts({ type: 'WHOLESALE', items: [{ productId: 1, qty: 11 }] }).lineData[0].unitPrice).toBe(100);
  });

  it('inclusive VAT is extracted; exclusive VAT is added', () => {
    expect(opts({ items: [{ productId: 1, qty: 1 }], taxInclusive: true }).taxAmount).toBe(Math.round((100 - 100 / 1.07) * 100) / 100);
    expect(opts({ items: [{ productId: 1, qty: 1 }], taxInclusive: false }).taxAmount).toBe(7);
  });

  it('throws on an unknown product', () => {
    expect(() => opts({ items: [{ productId: 9, qty: 1 }] })).toThrow();
  });
});
