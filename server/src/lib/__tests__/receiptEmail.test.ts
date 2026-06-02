import { describe, it, expect } from 'vitest';
import { buildReceiptEmail } from '../receiptEmail.js';

const store = { storeName: 'ร้านทดสอบ', address: '1 ถ.สุข', phone: '02-000', taxId: '0105500', currency: 'THB', receiptFooter: 'ขอบคุณครับ' };
const sale = {
  orderNo: 'S-000123',
  createdAt: new Date('2026-06-02T10:00:00Z'),
  type: 'RETAIL',
  subtotal: 200,
  discount: 20,
  promoDiscount: 0,
  taxAmount: 11.78,
  total: 180,
  paymentMethod: 'CASH',
  pointsEarned: 7,
  items: [
    { nameSnapshot: 'น้ำดื่ม', qty: 2, unitPrice: 50, lineTotal: 100 },
    { nameSnapshot: 'ขนม', qty: 1, unitPrice: 100, lineTotal: 100 },
  ],
  payments: [{ method: 'CASH', amount: 180 }],
};

describe('buildReceiptEmail', () => {
  it('builds a subject, HTML, and text from a sale', () => {
    const m = buildReceiptEmail(sale, store);
    expect(m.subject).toBe('ใบเสร็จ S-000123 · ร้านทดสอบ');
    // every line item appears in both renderings
    for (const it of sale.items) {
      expect(m.html).toContain(it.nameSnapshot);
      expect(m.text).toContain(it.nameSnapshot);
    }
    // store + footer present
    expect(m.html).toContain('ร้านทดสอบ');
    expect(m.html).toContain('ขอบคุณครับ');
    // formatted net total (200 − 20 = 180.00)
    expect(m.html).toContain('180.00');
    expect(m.text).toContain('ยอดสุทธิ 180.00 THB');
    // discount line shown (manual + promo)
    expect(m.html).toContain('−20.00');
    // earned points surfaced
    expect(m.html).toContain('7');
  });

  it('escapes HTML in product names (no injection)', () => {
    const m = buildReceiptEmail(
      { ...sale, items: [{ nameSnapshot: '<script>x</script>', qty: 1, unitPrice: 1, lineTotal: 1 }] },
      store
    );
    expect(m.html).not.toContain('<script>x</script>');
    expect(m.html).toContain('&lt;script&gt;');
  });

  it('falls back to paymentMethod when there are no split payments', () => {
    const { payments, ...noSplit } = sale;
    const m = buildReceiptEmail(noSplit, store);
    expect(m.text).toContain('เงินสด'); // CASH → Thai label
  });
});
