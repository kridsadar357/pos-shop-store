import { describe, it, expect } from 'vitest';
import { crc16, buildPromptPayPayload } from '../promptpay.js';
import { buildReceipt, buildDrawerKick } from '../escpos.js';

const hex = (b: Buffer) => b.toString('hex');

describe('promptpay', () => {
  it('CRC16-CCITT-FALSE matches the standard check value', () => {
    expect(crc16('123456789')).toBe('29B1'); // canonical CRC-16/CCITT-FALSE check value
  });

  it('builds a payload that starts with the version tag and ends with a CRC', () => {
    const p = buildPromptPayPayload({ id: '0812345678', type: 'MSISDN', amount: 100 });
    expect(p.startsWith('000201')).toBe(true);          // tag 00 = version "01"
    expect(p).toContain('5303764');                      // tag 53 currency THB (764)
    expect(p).toMatch(/6304[0-9A-F]{4}$/);               // ends with CRC tag 63 + 4 hex
    // CRC is self-consistent: recomputing over everything up to the CRC value reproduces it.
    const body = p.slice(0, -4);
    expect(crc16(body)).toBe(p.slice(-4));
  });

  it('encodes the exact amount in tag 54', () => {
    const p = buildPromptPayPayload({ id: '0812345678', amount: 100 });
    expect(p).toContain('5406100.00');                   // tag 54, len 06, "100.00"
  });

  it('throws without an id', () => {
    expect(() => buildPromptPayPayload({ id: '' } as any)).toThrow();
  });
});

describe('escpos', () => {
  const base: any = { storeName: 'X', address: '', phone: '', taxId: '', receiptHeader: '', receiptFooter: '', taxRatePct: 7, taxInclusive: true, printerPaper: '80mm', currency: 'THB' };
  const sale: any = { orderNo: 'S-1', createdAt: new Date(0), type: 'RETAIL', subtotal: 100, discount: 0, taxAmount: 6.5, total: 100, paymentMethod: 'CASH', cashReceived: 100, changeDue: 0, items: [{ nameSnapshot: 'x', qty: 1, unitPrice: 100, lineTotal: 100 }] };

  it('init uses the configured code page (ESC t)', () => {
    expect(hex(buildDrawerKick({ ...base, escposCodepage: 30 }))).toContain('1b741e'); // ESC t 0x1e (30)
    expect(hex(buildReceipt(sale, { ...base, escposCodepage: 21 }))).toContain('1b7415'); // ESC t 0x15 (21)
  });

  it('drawer kick emits the pulse sequence', () => {
    expect(hex(buildDrawerKick(base))).toContain('1b700019fa'); // ESC p 0 25 250
  });

  it('opens the drawer on a cash receipt only when enabled', () => {
    expect(hex(buildReceipt(sale, { ...base, openDrawerOnCash: true })).includes('1b700019fa')).toBe(true);
    expect(hex(buildReceipt(sale, { ...base, openDrawerOnCash: false })).includes('1b700019fa')).toBe(false);
    expect(hex(buildReceipt({ ...sale, paymentMethod: 'TRANSFER' }, base)).includes('1b700019fa')).toBe(false);
  });
});
