export function money(n: number | string, currency = 'THB'): string {
  const v = typeof n === 'string' ? Number(n) : n;
  return new Intl.NumberFormat('th-TH', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(isFinite(v) ? v : 0);
}

export function num(n: number | string): number {
  return typeof n === 'string' ? Number(n) : n;
}

export function dateTime(s: string): string {
  return new Date(s).toLocaleString('en-GB', { hour12: false });
}

export function toCSV(rows: Record<string, unknown>[]): string {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(','), ...rows.map((r) => headers.map((h) => escape(r[h])).join(','))].join('\n');
}

export function downloadCSV(filename: string, rows: Record<string, unknown>[]) {
  const blob = new Blob([toCSV(rows)], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
