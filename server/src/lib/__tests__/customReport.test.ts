import { describe, it, expect } from 'vitest';
import { normalizeConfig, runCustomReport, type ReportFact } from '../customReport.js';

const fact = (over: Partial<ReportFact>): ReportFact => ({
  saleId: 1,
  day: '2026-06-01',
  branch: 'สาขาหลัก',
  cashier: 'แอน',
  paymentMethod: 'เงินสด',
  type: 'ขายปลีก',
  category: 'เครื่องดื่ม',
  product: 'น้ำเปล่า',
  member: 'ลูกค้าทั่วไป',
  qty: 1,
  sales: 100,
  cost: 60,
  ...over,
});

describe('normalizeConfig', () => {
  it('drops unknown dims/metrics, de-dupes, caps groupBy at 2', () => {
    const c = normalizeConfig({
      groupBy: ['category', 'category', 'bogus', 'product', 'branch'],
      metrics: ['sales', 'sales', 'nope'],
    });
    expect(c.groupBy).toEqual(['category', 'product']);
    expect(c.metrics).toEqual(['sales']);
  });

  it('defaults metrics when none valid', () => {
    expect(normalizeConfig({ groupBy: ['day'], metrics: [] }).metrics).toEqual(['orders', 'sales', 'profit']);
  });

  it('throws when no valid dimension', () => {
    expect(() => normalizeConfig({ groupBy: ['bogus'], metrics: ['sales'] })).toThrow();
  });
});

describe('runCustomReport', () => {
  it('groups by one dimension and aggregates metrics', () => {
    const facts = [
      fact({ category: 'เครื่องดื่ม', sales: 100, cost: 60, qty: 2 }),
      fact({ category: 'เครื่องดื่ม', sales: 50, cost: 30, qty: 1, saleId: 2 }),
      fact({ category: 'ขนม', sales: 80, cost: 20, qty: 4, saleId: 3 }),
    ];
    const r = runCustomReport(facts, { groupBy: ['category'], metrics: ['orders', 'qty', 'sales', 'cost', 'profit', 'marginPct'] });
    const drinks = r.rows.find((x) => x.category === 'เครื่องดื่ม')!;
    expect(drinks.orders).toBe(2);
    expect(drinks.qty).toBe(3);
    expect(drinks.sales).toBe(150);
    expect(drinks.cost).toBe(90);
    expect(drinks.profit).toBe(60);
    expect(drinks.marginPct).toBe(40); // 60/150
    // totals across both categories
    expect(r.totals.sales).toBe(230);
    expect(r.totals.profit).toBe(120); // 230 sales − 110 cost
    expect(r.totals.orders).toBe(3);
  });

  it('counts orders as distinct sales (no double count across lines of one bill)', () => {
    const facts = [
      fact({ saleId: 7, product: 'A', sales: 10, cost: 5 }),
      fact({ saleId: 7, product: 'B', sales: 20, cost: 5 }),
    ];
    const r = runCustomReport(facts, { groupBy: ['branch'], metrics: ['orders', 'sales'] });
    expect(r.rows[0].orders).toBe(1);
    expect(r.rows[0].sales).toBe(30);
    expect(r.totals.orders).toBe(1);
  });

  it('supports two-dimension grouping (cross tab)', () => {
    const facts = [
      fact({ branch: 'A', category: 'x', sales: 10, cost: 0, saleId: 1 }),
      fact({ branch: 'A', category: 'y', sales: 20, cost: 0, saleId: 2 }),
      fact({ branch: 'B', category: 'x', sales: 30, cost: 0, saleId: 3 }),
    ];
    const r = runCustomReport(facts, { groupBy: ['branch', 'category'], metrics: ['sales'] });
    expect(r.rows).toHaveLength(3);
    expect(r.columns.map((c) => c.key)).toEqual(['branch', 'category', 'sales']);
  });

  it('derives the month dimension from the day', () => {
    const facts = [
      fact({ day: '2026-06-01', sales: 10, saleId: 1 }),
      fact({ day: '2026-06-20', sales: 10, saleId: 2 }),
      fact({ day: '2026-07-02', sales: 5, saleId: 3 }),
    ];
    const r = runCustomReport(facts, { groupBy: ['month'], metrics: ['sales'] });
    expect(r.rows.find((x) => x.month === '2026-06')!.sales).toBe(20);
    expect(r.rows.find((x) => x.month === '2026-07')!.sales).toBe(5);
  });

  it('sorts by the first metric descending by default', () => {
    const facts = [
      fact({ category: 'low', sales: 10, saleId: 1 }),
      fact({ category: 'high', sales: 90, saleId: 2 }),
    ];
    const r = runCustomReport(facts, { groupBy: ['category'], metrics: ['sales'] });
    expect(r.rows.map((x) => x.category)).toEqual(['high', 'low']);
  });

  it('honours an explicit sort config', () => {
    const facts = [
      fact({ category: 'b', sales: 90, saleId: 1 }),
      fact({ category: 'a', sales: 10, saleId: 2 }),
    ];
    const r = runCustomReport(facts, { groupBy: ['category'], metrics: ['sales'], sort: { key: 'category', dir: 'asc' } });
    expect(r.rows.map((x) => x.category)).toEqual(['a', 'b']);
  });
});
