import { describe, it, expect } from 'vitest';
import { shouldSendDailyReport } from '../dailyReport.js';
import { buildDailySummaryEmail } from '../dailyReportEmail.js';

const base = { reportEmailEnabled: true, reportEmailTo: 'a@b.com', reportEmailHour: 8, reportEmailLastSent: '' };
const at = (h: number) => { const d = new Date(2026, 5, 2, h, 0, 0); return d; };

describe('shouldSendDailyReport', () => {
  it('fires at the configured hour when enabled and not yet sent today', () => {
    expect(shouldSendDailyReport(base, at(8), '2026-06-02')).toBe(true);
  });
  it('does not fire at other hours', () => {
    expect(shouldSendDailyReport(base, at(9), '2026-06-02')).toBe(false);
  });
  it('does not fire twice the same day', () => {
    expect(shouldSendDailyReport({ ...base, reportEmailLastSent: '2026-06-02' }, at(8), '2026-06-02')).toBe(false);
  });
  it('does not fire when disabled or no recipient', () => {
    expect(shouldSendDailyReport({ ...base, reportEmailEnabled: false }, at(8), '2026-06-02')).toBe(false);
    expect(shouldSendDailyReport({ ...base, reportEmailTo: '  ' }, at(8), '2026-06-02')).toBe(false);
  });
});

describe('buildDailySummaryEmail', () => {
  const summary = {
    orders: 12, revenue: 4500, cost: 2000, tax: 294.39, grossProfit: 2205.61, expenses: 300,
    byMethod: [{ method: 'CASH', total: 3000 }, { method: 'TRANSFER', total: 1500 }],
    topItems: [{ name: 'น้ำดื่ม', qty: 30, revenue: 600 }, { name: '<b>ขนม</b>', qty: 10, revenue: 400 }],
  };
  it('builds subject/html/text with totals, methods, and items', () => {
    const m = buildDailySummaryEmail({ dateLabel: '2 มิถุนายน 2569', storeName: 'ร้านทดสอบ', currency: 'THB', summary });
    expect(m.subject).toContain('สรุปยอดขายประจำวัน');
    expect(m.html).toContain('4,500.00');
    expect(m.html).toContain('เงินสด');
    expect(m.html).toContain('น้ำดื่ม');
    expect(m.text).toContain('จำนวนบิล: 12');
    // HTML escaped (no raw tags from product names)
    expect(m.html).not.toContain('<b>ขนม</b>');
    expect(m.html).toContain('&lt;b&gt;');
  });
  it('handles an empty day gracefully', () => {
    const empty = { orders: 0, revenue: 0, cost: 0, tax: 0, grossProfit: 0, expenses: 0, byMethod: [], topItems: [] };
    const m = buildDailySummaryEmail({ dateLabel: 'วันนี้', storeName: 'ร้าน', summary: empty });
    expect(m.html).toContain('ไม่มีรายการ');
  });
});
