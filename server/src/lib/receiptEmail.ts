const num = (d: unknown) => Number(d ?? 0);
const baht = (d: unknown) => num(d).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

const METHOD_TH: Record<string, string> = { CASH: 'เงินสด', TRANSFER: 'โอน/พร้อมเพย์', CARD: 'บัตร', CREDIT: 'เงินเชื่อ', GIFT: 'บัตรของขวัญ' };

export interface ReceiptEmailSale {
  orderNo: string;
  createdAt: Date | string;
  type: string;
  subtotal: unknown;
  discount: unknown;
  promoDiscount?: unknown;
  taxAmount: unknown;
  total: unknown;
  paymentMethod: string;
  pointsEarned?: number;
  items: { nameSnapshot: string; qty: number; unitPrice: unknown; lineTotal: unknown }[];
  payments?: { method: string; amount: unknown }[];
}
export interface ReceiptEmailStore {
  storeName: string;
  address?: string;
  phone?: string;
  taxId?: string;
  currency?: string;
  receiptFooter?: string;
}

/**
 * Pure builder for a receipt email. Renders a self-contained HTML document plus a
 * plain-text fallback and a subject line from an already-loaded sale + store
 * settings. No I/O, so it is unit-testable; the route handles fetching + sending.
 */
export function buildReceiptEmail(sale: ReceiptEmailSale, store: ReceiptEmailStore): { subject: string; html: string; text: string } {
  const cur = store.currency || 'THB';
  const when = new Date(sale.createdAt).toLocaleString('th-TH');
  const subject = `ใบเสร็จ ${sale.orderNo} · ${store.storeName}`;

  const rows = sale.items
    .map(
      (i) => `<tr>
        <td style="padding:6px 8px;border-bottom:1px solid #eee">${esc(i.nameSnapshot)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">${i.qty}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">${baht(i.unitPrice)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">${baht(i.lineTotal)}</td>
      </tr>`
    )
    .join('');

  const discount = num(sale.discount) + num(sale.promoDiscount);
  const totalsRow = (label: string, value: string, bold = false) =>
    `<tr><td colspan="3" style="padding:3px 8px;text-align:right;${bold ? 'font-weight:700;font-size:15px' : 'color:#555'}">${label}</td><td style="padding:3px 8px;text-align:right;${bold ? 'font-weight:700;font-size:15px' : 'color:#555'}">${value}</td></tr>`;

  const tenders = (sale.payments && sale.payments.length ? sale.payments : [{ method: sale.paymentMethod, amount: sale.total }])
    .map((p) => `${METHOD_TH[p.method] ?? p.method} ${baht(p.amount)} ${cur}`)
    .join(' · ');

  const html = `<!doctype html><html><body style="margin:0;background:#f5f5f5;font-family:Arial,'Helvetica Neue',sans-serif;color:#222">
    <div style="max-width:560px;margin:0 auto;padding:24px">
      <div style="background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.08)">
        <div style="background:#047857;color:#fff;padding:18px 20px">
          <div style="font-size:18px;font-weight:700">${esc(store.storeName)}</div>
          ${store.address ? `<div style="font-size:12px;opacity:.9">${esc(store.address)}</div>` : ''}
          ${store.phone ? `<div style="font-size:12px;opacity:.9">โทร ${esc(store.phone)}</div>` : ''}
          ${store.taxId ? `<div style="font-size:12px;opacity:.9">เลขประจำตัวผู้เสียภาษี ${esc(store.taxId)}</div>` : ''}
        </div>
        <div style="padding:16px 20px">
          <div style="display:flex;justify-content:space-between;font-size:13px;color:#555">
            <span>เลขที่ <b style="color:#222">${esc(sale.orderNo)}</b></span><span>${esc(when)}</span>
          </div>
          <table style="width:100%;border-collapse:collapse;margin-top:12px;font-size:13px">
            <thead><tr style="background:#f0fdf4;color:#047857">
              <th style="padding:6px 8px;text-align:left">รายการ</th>
              <th style="padding:6px 8px;text-align:right">จำนวน</th>
              <th style="padding:6px 8px;text-align:right">ราคา</th>
              <th style="padding:6px 8px;text-align:right">รวม</th>
            </tr></thead>
            <tbody>${rows}</tbody>
            <tfoot>
              ${totalsRow('ยอดรวม', `${baht(sale.subtotal)} ${cur}`)}
              ${discount > 0 ? totalsRow('ส่วนลด', `−${baht(discount)} ${cur}`) : ''}
              ${num(sale.taxAmount) > 0 ? totalsRow('ภาษีมูลค่าเพิ่ม', `${baht(sale.taxAmount)} ${cur}`) : ''}
              ${totalsRow('ยอดสุทธิ', `${baht(sale.total)} ${cur}`, true)}
            </tfoot>
          </table>
          <div style="margin-top:12px;font-size:12px;color:#555">ชำระโดย: ${esc(tenders)}</div>
          ${sale.pointsEarned ? `<div style="font-size:12px;color:#555">แต้มสะสมที่ได้รับ: ${sale.pointsEarned}</div>` : ''}
        </div>
        <div style="padding:14px 20px;border-top:1px solid #eee;text-align:center;font-size:12px;color:#888">
          ${esc(store.receiptFooter || 'ขอบคุณที่ใช้บริการ')}
        </div>
      </div>
    </div>
  </body></html>`;

  const textLines = [
    store.storeName,
    `ใบเสร็จ ${sale.orderNo}  ${when}`,
    '',
    ...sale.items.map((i) => `${i.nameSnapshot} x${i.qty}  ${baht(i.lineTotal)} ${cur}`),
    '',
    `ยอดรวม ${baht(sale.subtotal)} ${cur}`,
    ...(discount > 0 ? [`ส่วนลด -${baht(discount)} ${cur}`] : []),
    ...(num(sale.taxAmount) > 0 ? [`ภาษี ${baht(sale.taxAmount)} ${cur}`] : []),
    `ยอดสุทธิ ${baht(sale.total)} ${cur}`,
    `ชำระโดย: ${tenders}`,
    '',
    store.receiptFooter || 'ขอบคุณที่ใช้บริการ',
  ];

  return { subject, html, text: textLines.join('\n') };
}
