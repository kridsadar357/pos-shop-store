import { describe, it, expect } from 'vitest';
import { withinDiscountLimit } from '../discountLimit.js';

describe('withinDiscountLimit', () => {
  it('caps a CASHIER over the limit', () => {
    expect(withinDiscountLimit({ role: 'CASHIER', discountAmount: 30, subtotal: 100, maxPct: 20 })).toBe(false);
  });
  it('allows a CASHIER within the limit (incl. exactly at it)', () => {
    expect(withinDiscountLimit({ role: 'CASHIER', discountAmount: 15, subtotal: 100, maxPct: 20 })).toBe(true);
    expect(withinDiscountLimit({ role: 'CASHIER', discountAmount: 20, subtotal: 100, maxPct: 20 })).toBe(true);
  });
  it('never caps ADMIN / MANAGER', () => {
    expect(withinDiscountLimit({ role: 'ADMIN', discountAmount: 90, subtotal: 100, maxPct: 10 })).toBe(true);
    expect(withinDiscountLimit({ role: 'MANAGER', discountAmount: 90, subtotal: 100, maxPct: 10 })).toBe(true);
  });
  it('maxPct 100 = unlimited', () => {
    expect(withinDiscountLimit({ role: 'CASHIER', discountAmount: 100, subtotal: 100, maxPct: 100 })).toBe(true);
  });
  it('no-ops on zero subtotal / zero discount', () => {
    expect(withinDiscountLimit({ role: 'CASHIER', discountAmount: 0, subtotal: 100, maxPct: 0 })).toBe(true);
    expect(withinDiscountLimit({ role: 'CASHIER', discountAmount: 10, subtotal: 0, maxPct: 0 })).toBe(true);
  });
});
