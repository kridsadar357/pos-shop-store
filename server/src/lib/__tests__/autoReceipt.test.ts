import { describe, it, expect } from 'vitest';
import { shouldEmailReceipt, shouldSmsReceipt } from '../autoReceipt.js';

const member = { email: 'a@b.com', phone: '0812345678' };

describe('shouldEmailReceipt', () => {
  it('true only when enabled + SMTP configured + member has email', () => {
    expect(shouldEmailReceipt({ autoReceiptEmail: true, smtpHost: 'smtp.x' }, member)).toBe(true);
  });
  it('false when disabled', () => {
    expect(shouldEmailReceipt({ autoReceiptEmail: false, smtpHost: 'smtp.x' }, member)).toBe(false);
  });
  it('false when SMTP not configured', () => {
    expect(shouldEmailReceipt({ autoReceiptEmail: true, smtpHost: '' }, member)).toBe(false);
  });
  it('false when member has no email', () => {
    expect(shouldEmailReceipt({ autoReceiptEmail: true, smtpHost: 'smtp.x' }, { email: '', phone: '08' })).toBe(false);
    expect(shouldEmailReceipt({ autoReceiptEmail: true, smtpHost: 'smtp.x' }, null)).toBe(false);
  });
});

describe('shouldSmsReceipt', () => {
  it('true only when enabled + gateway configured + member has phone', () => {
    expect(shouldSmsReceipt({ autoReceiptSms: true, smsApiUrl: 'https://sms' }, member)).toBe(true);
  });
  it('false when gateway not configured or no phone or disabled', () => {
    expect(shouldSmsReceipt({ autoReceiptSms: true, smsApiUrl: '' }, member)).toBe(false);
    expect(shouldSmsReceipt({ autoReceiptSms: true, smsApiUrl: 'https://sms' }, { phone: '' })).toBe(false);
    expect(shouldSmsReceipt({ autoReceiptSms: false, smsApiUrl: 'https://sms' }, member)).toBe(false);
  });
});
