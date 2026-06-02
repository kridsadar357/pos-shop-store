import { useEffect, useMemo, useState } from 'react';
import { api } from '../../api/client';
import { DataTable } from '../../components/DataTable';
import { ListToolbar } from '../../components/ListToolbar';
import { makeExporters, type Column } from '../../lib/export';
import { dateTime, money } from '../../lib/format';
import type { TaxInvoiceRow } from '../../types';

function today() { return new Date().toISOString().slice(0, 10); }
function monthStart() { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10); }

export default function TaxInvoices() {
  const [rows, setRows] = useState<TaxInvoiceRow[]>([]);
  const [q, setQ] = useState('');
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());

  async function load() {
    const query: Record<string, string> = {};
    if (from) query.from = new Date(`${from}T00:00:00`).toISOString();
    if (to) query.to = new Date(`${to}T23:59:59`).toISOString();
    setRows(await api<TaxInvoiceRow[]>('/tax-invoices', { query }));
  }
  useEffect(() => { load(); }, [from, to]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((r) => r.number.toLowerCase().includes(term) || r.buyerName.toLowerCase().includes(term) || r.buyerTaxId.includes(term) || r.orderNo.toLowerCase().includes(term));
  }, [rows, q]);

  const totals = useMemo(() => filtered.reduce((a, r) => ({ base: a.base + r.base, vat: a.vat + r.vat, total: a.total + r.total }), { base: 0, vat: 0, total: 0 }), [filtered]);

  const columns: Column<TaxInvoiceRow>[] = [
    { label: 'เลขที่ใบกำกับ', value: (r) => r.number },
    { label: 'วันที่', value: (r) => dateTime(r.issuedAt) },
    { label: 'บิลอ้างอิง', value: (r) => r.orderNo },
    { label: 'ผู้ซื้อ', value: (r) => r.buyerName },
    { label: 'เลขผู้เสียภาษี', value: (r) => r.buyerTaxId },
    { label: 'สาขา', value: (r) => r.buyerBranch },
    { label: 'มูลค่าก่อนภาษี', value: (r) => r.base, right: true },
    { label: 'ภาษีมูลค่าเพิ่ม', value: (r) => r.vat, right: true },
    { label: 'รวม', value: (r) => r.total, right: true },
  ];
  const exporters = makeExporters({ filename: 'tax-invoices', title: 'รายงานภาษีขาย (ใบกำกับภาษี)', columns, rows: () => filtered });

  return (
    <div className="flex h-full flex-col gap-4">
      <ListToolbar
        title="รายงานภาษีขาย"
        subtitle="ทะเบียนใบกำกับภาษีที่ออก สำหรับยื่นภาษีมูลค่าเพิ่ม (ภ.พ.30)"
        icon={<i className="fa-solid fa-file-invoice" />}
        q={q} setQ={setQ} placeholder="ค้นหาเลขที่ / ผู้ซื้อ / เลขภาษี…"
        dateRange={
          <div className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 ring-1 ring-slate-200">
            <i className="fa-regular fa-calendar text-slate-400" />
            <input type="date" className="bg-transparent text-sm outline-none" value={from} max={to || today()} onChange={(e) => setFrom(e.target.value)} />
            <span className="text-slate-300">—</span>
            <input type="date" className="bg-transparent text-sm outline-none" value={to} min={from} max={today()} onChange={(e) => setTo(e.target.value)} />
          </div>
        }
        exports={exporters}
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi label="มูลค่าก่อนภาษี" value={money(totals.base)} />
        <Kpi label="ภาษีขายรวม (VAT)" value={money(totals.vat)} tone="text-brand-700" />
        <Kpi label="รวมทั้งสิ้น" value={money(totals.total)} />
      </div>

      <DataTable
        rows={filtered}
        colCount={9}
        empty="ไม่มีใบกำกับภาษีในช่วงนี้"
        head={<tr><th className="px-4 py-3">เลขที่</th><th className="px-4 py-3">วันที่</th><th className="px-4 py-3">บิล</th><th className="px-4 py-3">ผู้ซื้อ</th><th className="px-4 py-3">เลขภาษี</th><th className="px-4 py-3 text-right">ก่อนภาษี</th><th className="px-4 py-3 text-right">VAT</th><th className="px-4 py-3 text-right">รวม</th><th /></tr>}
        renderRow={(r) => (
          <tr key={r.id} className="hover:bg-slate-50">
            <td className="px-4 py-3 font-mono font-semibold">{r.number}</td>
            <td className="px-4 py-3 text-slate-500">{dateTime(r.issuedAt)}</td>
            <td className="px-4 py-3 font-mono text-xs text-slate-500">{r.orderNo}</td>
            <td className="px-4 py-3">{r.buyerName}</td>
            <td className="px-4 py-3 font-mono text-xs">{r.buyerTaxId || '—'}</td>
            <td className="px-4 py-3 text-right text-slate-500">{money(r.base)}</td>
            <td className="px-4 py-3 text-right">{money(r.vat)}</td>
            <td className="px-4 py-3 text-right font-bold">{money(r.total)}</td>
            <td />
          </tr>
        )}
      />
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="card flex flex-col justify-center p-4">
      <div className="text-xs font-semibold text-slate-400">{label}</div>
      <div className={`mt-1 text-2xl font-extrabold ${tone ?? 'text-ink-900'}`}>{value}</div>
    </div>
  );
}
