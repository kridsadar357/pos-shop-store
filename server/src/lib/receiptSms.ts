// Pure builder for the SMS receipt text (concise — SMS is short). Unit-tested.
const num = (d: unknown) => Number(d ?? 0);
const baht = (d: unknown) => num(d).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export interface ReceiptSmsSale {
  orderNo: string;
  total: unknown;
  pointsEarned?: number;
}
export interface ReceiptSmsStore {
  storeName: string;
  currency?: string;
}

/** A short receipt confirmation SMS, e.g. "ร้านโชห่วย\nใบเสร็จ S-000123\nยอดสุทธิ 350.00 THB\n...". */
export function buildReceiptSms(sale: ReceiptSmsSale, store: ReceiptSmsStore): string {
  const cur = store.currency || 'THB';
  const lines = [
    store.storeName || 'POS',
    `ใบเสร็จ ${sale.orderNo}`,
    `ยอดสุทธิ ${baht(sale.total)} ${cur}`,
  ];
  if (sale.pointsEarned && sale.pointsEarned > 0) lines.push(`รับ ${sale.pointsEarned} แต้ม`);
  lines.push('ขอบคุณที่ใช้บริการ');
  return lines.join('\n');
}
