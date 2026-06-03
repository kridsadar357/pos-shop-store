// Decides whether to auto-send a receipt to the member after a completed sale. Pure + tested;
// the checkout route fires the actual send (fire-and-forget) based on these.

export interface AutoReceiptSetting {
  autoReceiptEmail?: boolean;
  autoReceiptSms?: boolean;
  smtpHost?: string;
  smsApiUrl?: string;
}
export interface AutoReceiptMember {
  email?: string | null;
  phone?: string | null;
}

/** Email the receipt only when enabled, the channel is configured (SMTP host set), and the
 *  member has an email. */
export function shouldEmailReceipt(setting: AutoReceiptSetting, member: AutoReceiptMember | null | undefined): boolean {
  return !!setting.autoReceiptEmail && !!setting.smtpHost?.trim() && !!member?.email?.trim();
}

/** SMS the receipt only when enabled, the SMS gateway is configured, and the member has a phone. */
export function shouldSmsReceipt(setting: AutoReceiptSetting, member: AutoReceiptMember | null | undefined): boolean {
  return !!setting.autoReceiptSms && !!setting.smsApiUrl?.trim() && !!member?.phone?.trim();
}
