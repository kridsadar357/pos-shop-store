import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import { resolveUrl } from '../api/client';

/** A printable/exportable column definition shared by Excel / CSV / PDF. */
export interface Column<T> {
  label: string;
  value: (row: T) => string | number;
  /** right-align in the PDF table (numbers/money) */
  right?: boolean;
}

function rowsToObjects<T>(columns: Column<T>[], rows: T[]) {
  return rows.map((r) => Object.fromEntries(columns.map((c) => [c.label, c.value(r)])));
}

/** Real .xlsx workbook (UTF-8 — Thai-safe). */
export function exportExcel<T>(filename: string, sheetName: string, columns: Column<T>[], rows: T[]) {
  const ws = XLSX.utils.json_to_sheet(rowsToObjects(columns, rows));
  // auto-ish column widths
  ws['!cols'] = columns.map((c) => ({ wch: Math.max(c.label.length + 2, 14) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 30) || 'Sheet1');
  XLSX.writeFile(wb, filename);
}

/** CSV with a UTF-8 BOM so Excel opens Thai correctly. */
export function exportCSV<T>(filename: string, columns: Column<T>[], rows: T[]) {
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [
    columns.map((c) => esc(c.label)).join(','),
    ...rows.map((r) => columns.map((c) => esc(c.value(r))).join(',')),
  ];
  const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  download(blob, filename);
}

/**
 * Export to PDF via a styled, print-to-PDF document. We render real HTML using
 * the Prompt web font so Thai text comes out perfectly (jsPDF's built-in fonts
 * cannot render Thai). An off-screen iframe avoids popup blockers.
 */
export function printPDF<T>(opts: {
  title: string;
  subtitle?: string;
  columns: Column<T>[];
  rows: T[];
  storeName?: string;
}) {
  const { title, subtitle, columns, rows, storeName } = opts;
  const esc = (s: unknown) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!));
  const head = columns.map((c) => `<th class="${c.right ? 'r' : ''}">${esc(c.label)}</th>`).join('');
  const body = rows
    .map((row) => `<tr>${columns.map((c) => `<td class="${c.right ? 'r' : ''}">${esc(c.value(row))}</td>`).join('')}</tr>`)
    .join('');
  const printedAt = new Date().toLocaleString('th-TH');
  const html = `<!doctype html><html lang="th"><head><meta charset="utf-8">
<title>${esc(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Prompt:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  @page { size: A4 landscape; margin: 14mm; }
  * { font-family: 'Prompt', sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { margin: 0; color: #0f172a; }
  .doc-h { display:flex; align-items:flex-end; justify-content:space-between; border-bottom:2px solid #0f766e; padding-bottom:8px; margin-bottom:14px; }
  .doc-h h1 { font-size: 18px; margin: 0; font-weight: 700; }
  .doc-h .sub { font-size: 11px; color:#64748b; margin-top:2px; }
  .doc-h .store { font-size: 12px; font-weight:600; color:#0f766e; text-align:right; }
  .doc-h .when { font-size: 10px; color:#94a3b8; text-align:right; }
  table { width:100%; border-collapse: collapse; font-size: 10.5px; }
  thead th { background:#0f766e; color:#fff; text-align:left; padding:7px 8px; font-weight:600; }
  thead th.r, tbody td.r { text-align:right; }
  tbody td { padding:6px 8px; border-bottom:1px solid #e2e8f0; }
  tbody tr:nth-child(even) td { background:#f1f5f9; }
  .foot { margin-top:12px; font-size:10px; color:#94a3b8; text-align:right; }
</style></head>
<body>
  <div class="doc-h">
    <div><h1>${esc(title)}</h1>${subtitle ? `<div class="sub">${esc(subtitle)}</div>` : ''}</div>
    <div><div class="store">${esc(storeName || 'POS Suite')}</div><div class="when">พิมพ์เมื่อ ${esc(printedAt)} · ${rows.length} รายการ</div></div>
  </div>
  <table><thead><tr>${head}</tr></thead><tbody>${body || `<tr><td colspan="${columns.length}" style="text-align:center;color:#94a3b8;padding:24px">ไม่มีข้อมูล</td></tr>`}</tbody></table>
  <div class="foot">— จบรายงาน —</div>
</body></html>`;

  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);
  const doc = iframe.contentWindow!.document;
  doc.open();
  doc.write(html);
  doc.close();
  // Give the web font a moment to load, then print.
  const go = () => {
    iframe.contentWindow!.focus();
    iframe.contentWindow!.print();
    setTimeout(() => document.body.removeChild(iframe), 1000);
  };
  setTimeout(go, 350);
}

/**
 * Product export: a CSV of all products plus every product image, packed into a
 * single .zip. Images are fetched from the server uploads and stored under
 * images/<sku>.<ext>.
 */
export async function exportProductsZip<T extends { sku: string; name: string; imageUrl?: string | null }>(
  filename: string,
  columns: Column<T>[],
  rows: T[],
) {
  const zip = new JSZip();
  // CSV inside the zip (BOM for Excel)
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [
    columns.map((c) => esc(c.label)).join(','),
    ...rows.map((r) => columns.map((c) => esc(c.value(r))).join(',')),
  ].join('\n');
  zip.file('products.csv', '﻿' + csv);

  const imgFolder = zip.folder('images')!;
  const seen = new Set<string>();
  await Promise.all(
    rows
      .filter((r) => r.imageUrl)
      .map(async (r) => {
        try {
          const res = await fetch(resolveUrl(r.imageUrl!));
          if (!res.ok) return;
          const blob = await res.blob();
          const ext = (r.imageUrl!.split('.').pop() || 'jpg').split('?')[0].slice(0, 4);
          let base = (r.sku || r.name).replace(/[^\w.-]+/g, '_');
          let nameInZip = `${base}.${ext}`;
          let n = 1;
          while (seen.has(nameInZip)) nameInZip = `${base}_${n++}.${ext}`;
          seen.add(nameInZip);
          imgFolder.file(nameInZip, blob);
        } catch {
          /* skip unreachable images */
        }
      }),
  );

  const out = await zip.generateAsync({ type: 'blob' });
  download(out, filename);
}

/** Build Excel/CSV/PDF export handlers for a list page in one shot. */
export function makeExporters<T>(opts: {
  filename: string;
  title: string;
  subtitle?: string;
  columns: Column<T>[];
  rows: () => T[];
  storeName?: string;
}) {
  return {
    excel: () => exportExcel(`${opts.filename}.xlsx`, opts.title, opts.columns, opts.rows()),
    csv: () => exportCSV(`${opts.filename}.csv`, opts.columns, opts.rows()),
    pdf: () =>
      printPDF({ title: opts.title, subtitle: opts.subtitle, columns: opts.columns, rows: opts.rows(), storeName: opts.storeName }),
  };
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
