import { describe, it, expect } from 'vitest';
import { computeTenderPlan } from '../tender.js';

const sum = (rows: { amount: number }[]) => Math.round(rows.reduce((s, r) => s + r.amount, 0) * 100) / 100;

describe('computeTenderPlan', () => {
  it('single cash with change: applied = total, change = received − total', () => {
    const p = computeTenderPlan({ total: 175, paymentMethod: 'CASH', cashReceived: 200 });
    expect(p.paymentRows).toEqual([{ method: 'CASH', amount: 175, reference: '' }]);
    expect(p.changeDue).toBe(25);
    expect(p.cashTendered).toBe(200);
    expect(p.dominant).toBe('CASH');
    expect(p.isSplit).toBe(false);
  });

  it('single cash exact (no cashReceived) defaults received to total, no change', () => {
    const p = computeTenderPlan({ total: 100, paymentMethod: 'CASH' });
    expect(p.changeDue).toBe(0);
    expect(sum(p.paymentRows)).toBe(100);
  });

  it('single transfer: one row, no change, no QR-relevant cash', () => {
    const p = computeTenderPlan({ total: 391, paymentMethod: 'TRANSFER' });
    expect(p.paymentRows).toEqual([{ method: 'TRANSFER', amount: 391, reference: '' }]);
    expect(p.changeDue).toBe(0);
    expect(p.dominant).toBe('TRANSFER');
  });

  it('split transfer + cash with overpay: applied sums to total, change from cash', () => {
    const p = computeTenderPlan({ total: 175, paymentMethod: 'CASH', payments: [
      { method: 'TRANSFER', amount: 100 },
      { method: 'CASH', amount: 200 },
    ]});
    expect(sum(p.paymentRows)).toBe(175);
    const cash = p.paymentRows.find((r) => r.method === 'CASH')!;
    const tr = p.paymentRows.find((r) => r.method === 'TRANSFER')!;
    expect(tr.amount).toBe(100);
    expect(cash.amount).toBe(75); // 200 cash − 125 change
    expect(p.changeDue).toBe(125);
    expect(p.dominant).toBe('TRANSFER'); // 100 > 75
    expect(p.isSplit).toBe(true);
  });

  it('non-cash overpay is rejected', () => {
    expect(() => computeTenderPlan({ total: 100, paymentMethod: 'TRANSFER', payments: [{ method: 'TRANSFER', amount: 150 }] })).toThrow();
  });

  it('insufficient payment is rejected', () => {
    expect(() => computeTenderPlan({ total: 100, paymentMethod: 'CASH', payments: [
      { method: 'CASH', amount: 30 }, { method: 'TRANSFER', amount: 40 },
    ]})).toThrow();
  });

  it('gift tender is treated as non-cash and included applied', () => {
    const p = computeTenderPlan({ total: 175, paymentMethod: 'CASH', payments: [
      { method: 'GIFT', amount: 120, reference: 'GC1' },
      { method: 'CASH', amount: 100 },
    ]});
    expect(sum(p.paymentRows)).toBe(175);
    expect(p.paymentRows.find((r) => r.method === 'GIFT')).toEqual({ method: 'GIFT', amount: 120, reference: 'GC1' });
    expect(p.paymentRows.find((r) => r.method === 'CASH')!.amount).toBe(55); // 100 − 45 change
    expect(p.changeDue).toBe(45);
  });

  it('cash exactly covering leaves no cash row dropped (applied still sums to total)', () => {
    const p = computeTenderPlan({ total: 50, paymentMethod: 'CASH', payments: [{ method: 'CASH', amount: 50 }] });
    expect(sum(p.paymentRows)).toBe(50);
    expect(p.changeDue).toBe(0);
  });

  it('two cash tenders consolidate into one applied cash row', () => {
    const p = computeTenderPlan({ total: 100, paymentMethod: 'CASH', payments: [
      { method: 'CASH', amount: 60 }, { method: 'CASH', amount: 40 },
    ]});
    const cashRows = p.paymentRows.filter((r) => r.method === 'CASH');
    expect(cashRows.length).toBe(1);
    expect(cashRows[0].amount).toBe(100);
  });
});
