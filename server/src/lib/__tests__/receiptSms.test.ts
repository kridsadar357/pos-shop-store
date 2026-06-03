import { describe, it, expect } from 'vitest';
import { buildReceiptSms } from '../receiptSms.js';
import { isSmsConfigured } from '../sms.js';

describe('buildReceiptSms', () => {
  it('includes the store name, order no, and net total', () => {
    const m = buildReceiptSms({ orderNo: 'S-000123', total: 350 }, { storeName: 'ร้านโชห่วย', currency: 'THB' });
    expect(m).toContain('ร้านโชห่วย');
    expect(m).toContain('S-000123');
    expect(m).toContain('350.00 THB');
    expect(m).toContain('ขอบคุณ');
  });

  it('adds an earned-points line only when points were earned', () => {
    expect(buildReceiptSms({ orderNo: 'S-1', total: 10, pointsEarned: 5 }, { storeName: 'X' })).toContain('5 แต้ม');
    expect(buildReceiptSms({ orderNo: 'S-1', total: 10, pointsEarned: 0 }, { storeName: 'X' })).not.toContain('แต้ม');
  });

  it('defaults the currency to THB', () => {
    expect(buildReceiptSms({ orderNo: 'S-1', total: 99 }, { storeName: 'X' })).toContain('99.00 THB');
  });
});

describe('isSmsConfigured', () => {
  it('is true only when a gateway URL is set', () => {
    expect(isSmsConfigured({ smsApiUrl: '' })).toBe(false);
    expect(isSmsConfigured({ smsApiUrl: '   ' })).toBe(false);
    expect(isSmsConfigured({ smsApiUrl: 'https://sms.example/api' })).toBe(true);
  });
});
