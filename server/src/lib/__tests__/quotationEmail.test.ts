import { describe, it, expect } from 'vitest';
import { buildQuotationEmail } from '../quotationEmail.js';

const store = { storeName: 'ร้านค้าส่ง', address: '9 ถ.การค้า', phone: '02-111', taxId: '0107', currency: 'THB' };
const q = {
  refNo: 'QT-000045',
  customerName: 'บริษัท ลูกค้า จำกัด',
  type: 'WHOLESALE',
  validUntil: new Date('2026-06-30T00:00:00Z'),
  note: 'ราคานี้รวม VAT',
  subtotal: 1000,
  discount: 100,
  taxAmount: 58.88,
  total: 900,
  items: [
    { nameSnapshot: 'กล่องสินค้า A', qty: 10, unitPrice: 50, lineTotal: 500 },
    { nameSnapshot: 'กล่องสินค้า B', qty: 5, unitPrice: 100, lineTotal: 500 },
  ],
};

describe('buildQuotationEmail', () => {
  it('builds subject, html, and text with customer, items, validity, and totals', () => {
    const m = buildQuotationEmail(q, store);
    expect(m.subject).toBe('ใบเสนอราคา QT-000045 · ร้านค้าส่ง');
    expect(m.html).toContain('ใบเสนอราคา');
    expect(m.html).toContain('บริษัท ลูกค้า จำกัด');
    for (const it of q.items) {
      expect(m.html).toContain(it.nameSnapshot);
      expect(m.text).toContain(it.nameSnapshot);
    }
    expect(m.html).toContain('900.00');
    expect(m.text).toContain('ยอดสุทธิ 900.00 THB');
    expect(m.html).toContain('−100.00'); // discount
    expect(m.html).toContain('ราคานี้รวม VAT'); // note
  });

  it('escapes HTML in fields (no injection)', () => {
    const m = buildQuotationEmail({ ...q, customerName: '<img src=x>' }, store);
    expect(m.html).not.toContain('<img src=x>');
    expect(m.html).toContain('&lt;img');
  });

  it('omits optional rows (no discount/note) cleanly', () => {
    const m = buildQuotationEmail({ ...q, discount: 0, note: '', validUntil: null }, store);
    expect(m.html).not.toContain('ส่วนลด');
    expect(m.html).not.toContain('หมายเหตุ');
    expect(m.html).not.toContain('ยืนราคาถึง');
  });
});
