import type { DailySummary } from './dailyReport.js';

const baht = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

const METHOD_TH: Record<string, string> = { CASH: 'เงินสด', TRANSFER: 'โอน/พร้อมเพย์', CARD: 'บัตร', CREDIT: 'เงินเชื่อ', GIFT: 'บัตรของขวัญ' };

/**
 * Pure builder for the scheduled daily sales-summary email. No I/O.
 */
export function buildDailySummaryEmail(
  opts: { dateLabel: string; storeName: string; currency?: string; summary: DailySummary }
): { subject: string; html: string; text: string } {
  const { dateLabel, storeName, summary } = opts;
  const cur = opts.currency || 'THB';
  const subject = `สรุปยอดขายประจำวัน ${dateLabel} · ${storeName}`;

  const stat = (label: string, value: string, accent = '#222') =>
    `<td style="padding:10px 12px;background:#f8fafc;border-radius:10px">
      <div style="font-size:11px;color:#64748b">${label}</div>
      <div style="font-size:18px;font-weight:700;color:${accent}">${value}</div>
    </td>`;

  const methodRows = summary.byMethod.length
    ? summary.byMethod.map((m) => `<tr><td style="padding:4px 8px">${METHOD_TH[m.method] ?? esc(m.method)}</td><td style="padding:4px 8px;text-align:right">${baht(m.total)} ${cur}</td></tr>`).join('')
    : `<tr><td colspan="2" style="padding:4px 8px;color:#94a3b8">— ไม่มีรายการ —</td></tr>`;

  const itemRows = summary.topItems.length
    ? summary.topItems.map((i) => `<tr><td style="padding:4px 8px">${esc(i.name)}</td><td style="padding:4px 8px;text-align:right">${i.qty}</td><td style="padding:4px 8px;text-align:right">${baht(i.revenue)}</td></tr>`).join('')
    : `<tr><td colspan="3" style="padding:4px 8px;color:#94a3b8">— ไม่มีรายการ —</td></tr>`;

  const html = `<!doctype html><html><body style="margin:0;background:#f1f5f9;font-family:Arial,'Helvetica Neue',sans-serif;color:#222">
    <div style="max-width:600px;margin:0 auto;padding:24px">
      <div style="background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.08)">
        <div style="background:#047857;color:#fff;padding:18px 20px">
          <div style="font-size:18px;font-weight:700">${esc(storeName)}</div>
          <div style="font-size:13px;opacity:.9">สรุปยอดขายประจำวัน · ${esc(dateLabel)}</div>
        </div>
        <div style="padding:18px 20px">
          <table style="width:100%;border-spacing:8px;border-collapse:separate;margin:-8px"><tr>
            ${stat('จำนวนบิล', String(summary.orders))}
            ${stat('ยอดขายรวม', `${baht(summary.revenue)} ${cur}`, '#047857')}
            ${stat('กำไรขั้นต้น', `${baht(summary.grossProfit)} ${cur}`, '#047857')}
          </tr></table>
          <table style="width:100%;border-spacing:8px;border-collapse:separate;margin:-8px 0"><tr>
            ${stat('ภาษีมูลค่าเพิ่ม', `${baht(summary.tax)} ${cur}`)}
            ${stat('ต้นทุนสินค้า', `${baht(summary.cost)} ${cur}`)}
            ${stat('ค่าใช้จ่าย', `${baht(summary.expenses)} ${cur}`)}
          </tr></table>

          <h3 style="font-size:14px;margin:18px 0 6px">การรับชำระ</h3>
          <table style="width:100%;border-collapse:collapse;font-size:13px">${methodRows}</table>

          <h3 style="font-size:14px;margin:18px 0 6px">สินค้าขายดี (สูงสุด 5)</h3>
          <table style="width:100%;border-collapse:collapse;font-size:13px">
            <thead><tr style="color:#047857"><th style="padding:4px 8px;text-align:left">สินค้า</th><th style="padding:4px 8px;text-align:right">จำนวน</th><th style="padding:4px 8px;text-align:right">ยอดขาย</th></tr></thead>
            <tbody>${itemRows}</tbody>
          </table>
        </div>
        <div style="padding:12px 20px;border-top:1px solid #eee;text-align:center;font-size:11px;color:#94a3b8">
          อีเมลอัตโนมัติจากระบบ POS — ${esc(storeName)}
        </div>
      </div>
    </div>
  </body></html>`;

  const text = [
    `${storeName} — สรุปยอดขายประจำวัน ${dateLabel}`,
    '',
    `จำนวนบิล: ${summary.orders}`,
    `ยอดขายรวม: ${baht(summary.revenue)} ${cur}`,
    `กำไรขั้นต้น: ${baht(summary.grossProfit)} ${cur}`,
    `ภาษี: ${baht(summary.tax)} ${cur}  ต้นทุน: ${baht(summary.cost)} ${cur}  ค่าใช้จ่าย: ${baht(summary.expenses)} ${cur}`,
    '',
    'การรับชำระ:',
    ...summary.byMethod.map((m) => `  ${METHOD_TH[m.method] ?? m.method}: ${baht(m.total)} ${cur}`),
    '',
    'สินค้าขายดี:',
    ...summary.topItems.map((i) => `  ${i.name} x${i.qty} — ${baht(i.revenue)} ${cur}`),
  ].join('\n');

  return { subject, html, text };
}
