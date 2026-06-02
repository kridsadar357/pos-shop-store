import { describe, it, expect } from 'vitest';
import { computeRefund } from '../refundCalc.js';

describe('computeRefund', () => {
  it('no bill discount, VAT-inclusive: refund = gross, VAT extracted', () => {
    // subtotal == total → ratio 1; gross 107 incl 7% → VAT 7
    const r = computeRefund({ gross: 107, saleTotal: 107, saleSubtotal: 107, taxRate: 7, taxInclusive: true });
    expect(r.refundTotal).toBe(107);
    expect(r.taxAmount).toBe(7);
  });

  it('prorates a bill-level discount (total < subtotal)', () => {
    // bill had 10% off (total/subtotal = 900/1000 = 0.9); returning gross 100 → refund 90
    const r = computeRefund({ gross: 100, saleTotal: 900, saleSubtotal: 1000, taxRate: 7, taxInclusive: true });
    expect(r.refundTotal).toBe(90);
    expect(r.taxAmount).toBe(round(90 - 90 / 1.07));
  });

  it('VAT-exclusive: tax added on the gross', () => {
    const r = computeRefund({ gross: 100, saleTotal: 100, saleSubtotal: 100, taxRate: 7, taxInclusive: false });
    expect(r.refundTotal).toBe(100);
    expect(r.taxAmount).toBe(7);
  });

  it('handles zero subtotal safely (ratio defaults to 1)', () => {
    const r = computeRefund({ gross: 50, saleTotal: 0, saleSubtotal: 0, taxRate: 7, taxInclusive: true });
    expect(r.refundTotal).toBe(50);
  });
});

function round(n: number) { return Math.round(n * 100) / 100; }
