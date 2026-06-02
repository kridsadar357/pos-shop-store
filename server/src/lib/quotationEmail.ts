const num = (d: unknown) => Number(d ?? 0);
const baht = (d: unknown) => num(d).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

export interface QuotationEmailDoc {
  refNo: string;
  customerName?: string;
  type?: string;
  validUntil?: Date | string | null;
  note?: string;
  subtotal: unknown;
  discount: unknown;
  taxAmount: unknown;
  total: unknown;
  items: { nameSnapshot: string; qty: number; unitPrice: unknown; lineTotal: unknown }[];
}
export interface QuotationEmailStore {
  storeName: string;
  address?: string;
  phone?: string;
  taxId?: string;
  currency?: string;
}

/**
 * Pure builder for a quotation email (proforma). Renders a self-contained HTML
 * document + plain-text fallback + subject from an already-loaded quotation and
 * store settings. No I/O, so it is unit-testable.
 */
export function buildQuotationEmail(q: QuotationEmailDoc, store: QuotationEmailStore): { subject: string; html: string; text: string } {
  const cur = store.currency || 'THB';
  const subject = `ใบเสนอราคา ${q.refNo} · ${store.storeName}`;
  const validLabel = q.validUntil ? new Date(q.validUntil).toLocaleDateString('th-TH') : null;

  const rows = q.items
    .map(
      (i) => `<tr>
        <td style="padding:6px 8px;border-bottom:1px solid #eee">${esc(i.nameSnapshot)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">${i.qty}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">${baht(i.unitPrice)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">${baht(i.lineTotal)}</td>
      </tr>`
    )
    .join('');

  const totalsRow = (label: string, value: string, bold = false) =>
    `<tr><td colspan="3" style="padding:3px 8px;text-align:right;${bold ? 'font-weight:700;font-size:15px' : 'color:#555'}">${label}</td><td style="padding:3px 8px;text-align:right;${bold ? 'font-weight:700;font-size:15px' : 'color:#555'}">${value}</td></tr>`;

  const html = `<!doctype html><html><body style="margin:0;background:#f5f5f5;font-family:Arial,'Helvetica Neue',sans-serif;color:#222">
    <div style="max-width:580px;margin:0 auto;padding:24px">
      <div style="background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.08)">
        <div style="background:#047857;color:#fff;padding:18px 20px">
          <div style="font-size:18px;font-weight:700">${esc(store.storeName)}</div>
          ${store.address ? `<div style="font-size:12px;opacity:.9">${esc(store.address)}</div>` : ''}
          ${store.phone ? `<div style="font-size:12px;opacity:.9">โทร ${esc(store.phone)}</div>` : ''}
          ${store.taxId ? `<div style="font-size:12px;opacity:.9">เลขประจำตัวผู้เสียภาษี ${esc(store.taxId)}</div>` : ''}
        </div>
        <div style="padding:16px 20px">
          <div style="font-size:16px;font-weight:700;color:#047857">ใบเสนอราคา</div>
          <div style="margin-top:4px;font-size:13px;color:#555">
            เลขที่ <b style="color:#222">${esc(q.refNo)}</b>
            ${q.customerName ? `<br/>เรียน: ${esc(q.customerName)}` : ''}
            ${validLabel ? `<br/>ยืนราคาถึง: ${esc(validLabel)}` : ''}
          </div>
          <table style="width:100%;border-collapse:collapse;margin-top:12px;font-size:13px">
            <thead><tr style="background:#f0fdf4;color:#047857">
              <th style="padding:6px 8px;text-align:left">รายการ</th>
              <th style="padding:6px 8px;text-align:right">จำนวน</th>
              <th style="padding:6px 8px;text-align:right">ราคา/หน่วย</th>
              <th style="padding:6px 8px;text-align:right">รวม</th>
            </tr></thead>
            <tbody>${rows}</tbody>
            <tfoot>
              ${totalsRow('ยอดรวม', `${baht(q.subtotal)} ${cur}`)}
              ${num(q.discount) > 0 ? totalsRow('ส่วนลด', `−${baht(q.discount)} ${cur}`) : ''}
              ${num(q.taxAmount) > 0 ? totalsRow('ภาษีมูลค่าเพิ่ม', `${baht(q.taxAmount)} ${cur}`) : ''}
              ${totalsRow('ยอดสุทธิ', `${baht(q.total)} ${cur}`, true)}
            </tfoot>
          </table>
          ${q.note ? `<div style="margin-top:12px;font-size:12px;color:#555">หมายเหตุ: ${esc(q.note)}</div>` : ''}
        </div>
        <div style="padding:14px 20px;border-top:1px solid #eee;text-align:center;font-size:12px;color:#888">
          ขอบคุณที่ให้ความสนใจ — ${esc(store.storeName)}
        </div>
      </div>
    </div>
  </body></html>`;

  const text = [
    store.storeName,
    `ใบเสนอราคา ${q.refNo}`,
    ...(q.customerName ? [`เรียน: ${q.customerName}`] : []),
    ...(validLabel ? [`ยืนราคาถึง: ${validLabel}`] : []),
    '',
    ...q.items.map((i) => `${i.nameSnapshot} x${i.qty}  ${baht(i.lineTotal)} ${cur}`),
    '',
    `ยอดรวม ${baht(q.subtotal)} ${cur}`,
    ...(num(q.discount) > 0 ? [`ส่วนลด -${baht(q.discount)} ${cur}`] : []),
    ...(num(q.taxAmount) > 0 ? [`ภาษี ${baht(q.taxAmount)} ${cur}`] : []),
    `ยอดสุทธิ ${baht(q.total)} ${cur}`,
    ...(q.note ? ['', `หมายเหตุ: ${q.note}`] : []),
  ].join('\n');

  return { subject, html, text };
}
