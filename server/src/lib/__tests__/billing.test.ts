import { describe, it, expect } from 'vitest';
import { buildBill, type BillProduct } from '../billing.js';

const P: BillProduct[] = [
  { id: 1, name: 'A', retailPrice: 100, wholesalePrice: 90, cost: 60, taxRatePct: null },
  { id: 2, name: 'B', retailPrice: 50, wholesalePrice: 40, cost: 30, taxRatePct: 0 }, // tax-exempt
];

describe('buildBill', () => {
  it('retail, VAT-inclusive: subtotal + extracted VAT', () => {
    const r = buildBill({ items: [{ productId: 1, qty: 2 }], products: P, type: 'RETAIL', discount: 0, defaultRate: 7, taxInclusive: true });
    expect(r.subtotal).toBe(200);
    expect(r.total).toBe(200);
    expect(r.taxAmount).toBe(Math.round((200 - 200 / 1.07) * 100) / 100); // 13.08
    expect(r.lines[0]).toMatchObject({ unitPrice: 100, lineTotal: 200, unitCost: 60 });
  });

  it('wholesale pricing is used for the WHOLESALE type', () => {
    const r = buildBill({ items: [{ productId: 1, qty: 1 }], products: P, type: 'WHOLESALE', discount: 0, defaultRate: 7, taxInclusive: true });
    expect(r.lines[0].unitPrice).toBe(90);
    expect(r.subtotal).toBe(90);
  });

  it('explicit unitPrice override wins over the product price', () => {
    const r = buildBill({ items: [{ productId: 1, qty: 1, unitPrice: 77 }], products: P, type: 'RETAIL', discount: 0, defaultRate: 7, taxInclusive: true });
    expect(r.lines[0].unitPrice).toBe(77);
  });

  it('discount caps at subtotal and reduces the inclusive total', () => {
    const r = buildBill({ items: [{ productId: 1, qty: 1 }], products: P, type: 'RETAIL', discount: 500, defaultRate: 7, taxInclusive: true });
    expect(r.discount).toBe(100); // capped at subtotal 100
    expect(r.total).toBe(0);
  });

  it('VAT-exclusive: tax added on top', () => {
    const r = buildBill({ items: [{ productId: 1, qty: 1 }], products: P, type: 'RETAIL', discount: 0, defaultRate: 7, taxInclusive: false });
    expect(r.subtotal).toBe(100);
    expect(r.taxAmount).toBe(7);
    expect(r.total).toBe(107);
  });

  it('per-product tax rate overrides the default (0% = exempt line)', () => {
    const r = buildBill({ items: [{ productId: 2, qty: 1 }], products: P, type: 'RETAIL', discount: 0, defaultRate: 7, taxInclusive: true });
    expect(r.taxAmount).toBe(0); // product 2 has taxRatePct 0
  });

  it('throws on an unknown product', () => {
    expect(() => buildBill({ items: [{ productId: 99, qty: 1 }], products: P, type: 'RETAIL', discount: 0, defaultRate: 7, taxInclusive: true })).toThrow();
  });
});
