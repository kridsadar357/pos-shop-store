import { describe, it, expect } from 'vitest';
import { evaluatePromotions, type PromoCartLine } from '../promotions.js';
import type { Promotion } from '@prisma/client';

// Minimal promo factory — only the fields evaluatePromotions reads.
let pid = 0;
function promo(over: Record<string, unknown>): Promotion {
  return {
    id: ++pid, name: over.name ?? `P${pid}`, code: null, type: 'PERCENT', scope: 'BILL',
    value: 0, buyQty: 1, getQty: 1, productId: null, categoryId: null, minSpend: 0,
    autoApply: true, isActive: true, startsAt: null, endsAt: null, createdAt: new Date(),
    ...over,
  } as unknown as Promotion;
}

const line = (productId: number, qty: number, unitPrice: number, categoryId: number | null = null): PromoCartLine =>
  ({ productId, categoryId, qty, unitPrice, lineTotal: Math.round(unitPrice * qty * 100) / 100 });

describe('evaluatePromotions', () => {
  it('PERCENT on the whole bill', () => {
    const r = evaluatePromotions([line(1, 2, 100)], [promo({ type: 'PERCENT', scope: 'BILL', value: 10 })]);
    expect(r.promoDiscount).toBe(20); // 10% of 200
    expect(r.applied).toHaveLength(1);
  });

  it('FIXED amount is capped at the base', () => {
    const r = evaluatePromotions([line(1, 1, 30)], [promo({ type: 'FIXED', scope: 'BILL', value: 50 })]);
    expect(r.promoDiscount).toBe(30); // min(50, 30)
  });

  it('PRODUCT scope only discounts the matching product lines', () => {
    const lines = [line(1, 1, 100), line(2, 1, 100)];
    const r = evaluatePromotions(lines, [promo({ type: 'PERCENT', scope: 'PRODUCT', productId: 1, value: 50 })]);
    expect(r.promoDiscount).toBe(50); // 50% of product 1's 100 only
  });

  it('CATEGORY scope discounts only that category', () => {
    const lines = [line(1, 1, 100, 7), line(2, 1, 100, 9)];
    const r = evaluatePromotions(lines, [promo({ type: 'PERCENT', scope: 'CATEGORY', categoryId: 7, value: 10 })]);
    expect(r.promoDiscount).toBe(10);
  });

  it('respects minSpend (gate)', () => {
    const p = promo({ type: 'PERCENT', scope: 'BILL', value: 10, minSpend: 500 as any });
    expect(evaluatePromotions([line(1, 1, 100)], [p]).promoDiscount).toBe(0);
    expect(evaluatePromotions([line(1, 6, 100)], [p]).promoDiscount).toBe(60); // 600 ≥ 500 → 10%
  });

  it('coupon-gated promo needs the matching code', () => {
    const p = promo({ type: 'FIXED', scope: 'BILL', value: 50, autoApply: false, code: 'SAVE50' });
    expect(evaluatePromotions([line(1, 1, 200)], [p]).promoDiscount).toBe(0);
    expect(evaluatePromotions([line(1, 1, 200)], [p], { couponCode: 'save50' }).promoDiscount).toBe(50); // case-insensitive
  });

  it('BXGY: buy 2 get 1 free gives one free unit per group', () => {
    // group = 3; qty 7 → floor(7/3)=2 free units × unitPrice 100
    const p = promo({ type: 'BXGY', productId: 1, buyQty: 2, getQty: 1 });
    expect(evaluatePromotions([line(1, 7, 100)], [p]).promoDiscount).toBe(200);
  });

  it('accumulates multiple promos and caps total at the subtotal', () => {
    const lines = [line(1, 1, 100)];
    const promos = [
      promo({ type: 'FIXED', scope: 'BILL', value: 80 }),
      promo({ type: 'FIXED', scope: 'BILL', value: 80 }),
    ];
    const r = evaluatePromotions(lines, promos);
    expect(r.applied).toHaveLength(2);
    expect(r.promoDiscount).toBe(100); // 80+80 capped at subtotal 100
  });
});
