import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '../../api/client';
import { PageHeader } from '../../components/ui';
import { downloadCSV, money } from '../../lib/format';
import { useBranch } from '../../store/branch';
import type { Setting } from '../../types';

// Shared report meta (store name + date range) for PDF headers, avoids prop drilling.
const ReportMeta = createContext<{ store: string; range: string }>({ store: '', range: '' });

type Tab = 'summary' | 'pnl' | 'payments' | 'top' | 'category' | 'hourly' | 'tax' | 'low' | 'valuation' | 'z';
const TABS: { key: Tab; label: string }[] = [
  { key: 'summary', label: 'สรุปยอดขาย' },
  { key: 'pnl', label: 'กำไร-ขาดทุน (P&L)' },
  { key: 'payments', label: 'ช่องทางชำระเงิน' },
  { key: 'top', label: 'สินค้าขายดี' },
  { key: 'category', label: 'กำไรตามหมวดหมู่' },
  { key: 'hourly', label: 'ยอดขายรายชั่วโมง' },
  { key: 'tax', label: 'สรุปภาษี' },
  { key: 'low', label: 'สินค้าใกล้หมด' },
  { key: 'valuation', label: 'มูลค่าสินค้าคงเหลือ' },
  { key: 'z', label: 'รายงานปิดยอด (Z)' },
];
const PIE = ['#059669', '#f59e0b', '#3b82f6', '#ef4444'];

function todayISO() { return new Date().toISOString().slice(0, 10); }
function daysAgoISO(n: number) { return new Date(Date.now() - n * 864e5).toISOString().slice(0, 10); }

export default function Reports() {
  const branches = useBranch((s) => s.branches);
  const [tab, setTab] = useState<Tab>('summary');
  const [from, setFrom] = useState(daysAgoISO(30));
  const [to, setTo] = useState(todayISO());
  const [branchId, setBranchId] = useState('');
  const [data, setData] = useState<any>(null);
  const [store, setStore] = useState('POS Suite');

  useEffect(() => { api<Setting>('/settings').then((s) => setStore(s.storeName)).catch(() => {}); }, []);

  useEffect(() => {
    const b = branchId || undefined;
    const range = { from: new Date(from).toISOString(), to: new Date(to + 'T23:59:59').toISOString(), branchId: b };
    const endpoints: Record<Tab, () => Promise<any>> = {
      summary: () => api('/reports/summary', { query: range }),
      pnl: () => api('/reports/profit-loss', { query: range }),
      payments: () => api('/reports/payment-methods', { query: range }),
      top: () => api('/reports/top-products', { query: range }),
      category: () => api('/reports/profit-by-category', { query: range }),
      hourly: () => api('/reports/sales-by-hour', { query: range }),
      tax: () => api('/reports/tax-summary', { query: range }),
      low: () => api('/reports/low-stock', { query: { branchId: b } }),
      valuation: () => api('/reports/inventory-valuation', { query: { branchId: b } }),
      z: () => api('/reports/z-report', { query: { date: new Date(to).toISOString(), branchId: b } }),
    };
    setData(null); // avoid rendering a view with the previous tab's (mismatched) data
    endpoints[tab]().then(setData).catch(() => setData(null));
  }, [tab, from, to, branchId]);

  return (
    <ReportMeta.Provider value={{ store, range: `${from} – ${to}` }}>
    <div className="space-y-4">
      <PageHeader
        title="รายงาน"
        subtitle="ยอดขาย กำไร ช่องทางชำระเงิน และวิเคราะห์สินค้าคงคลัง"
        icon="📊"
        actions={
          <div className="flex items-center gap-2">
            {branches.length > 1 && (
              <select className="input w-auto" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
                <option value="">ทุกสาขา</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            )}
            <input type="date" className="input w-auto" value={from} onChange={(e) => setFrom(e.target.value)} />
            <span className="text-slate-400">→</span>
            <input type="date" className="input w-auto" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        }
      />

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => { setTab(t.key); setData(null); }} className={`rounded-xl px-4 py-2 text-sm font-semibold ${tab === t.key ? 'bg-brand-600 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {data && (
        <>
          {tab === 'summary' && <SummaryView d={data} />}
          {tab === 'pnl' && <PnlView d={data} />}
          {tab === 'payments' && <PaymentsView d={data} />}
          {tab === 'top' && <TableView title="สินค้าขายดี" rows={data} cols={[['name', 'สินค้า'], ['qty', 'ขายได้ (ชิ้น)'], ['revenue', 'ยอดขาย', true], ['profit', 'กำไร', true]]} file="top-products.csv" />}
          {tab === 'category' && <CategoryView d={data} />}
          {tab === 'hourly' && <HourlyView d={data} />}
          {tab === 'tax' && <TaxView d={data} />}
          {tab === 'low' && <TableView title="สินค้าใกล้หมด" rows={data} cols={[['name', 'สินค้า'], ['sku', 'SKU'], ['stockQty', 'คงเหลือ'], ['reorderLevel', 'จุดสั่งซื้อ ≤']]} file="low-stock.csv" />}
          {tab === 'valuation' && <ValuationView d={data} />}
          {tab === 'z' && <ZView d={data} />}
        </>
      )}
    </div>
    </ReportMeta.Provider>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return <div className="card p-5"><div className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</div><div className={`mt-2 text-2xl font-extrabold ${accent ?? ''}`}>{value}</div></div>;
}

function SummaryView({ d }: { d: any }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Stat label="รายได้" value={money(d.revenue)} accent="text-brand-700" />
        <Stat label="กำไรขั้นต้น" value={money(d.grossProfit)} accent="text-emerald-600" />
        <Stat label="อัตรากำไร" value={`${d.marginPct}%`} />
        <Stat label="จำนวนบิล" value={String(d.orders)} />
        <Stat label="เฉลี่ย/บิล" value={money(d.avgOrderValue)} />
      </div>
      <div className="card p-5">
        <div className="mb-3 flex items-center justify-between"><h3 className="font-bold">ยอดขายและกำไรรายวัน</h3>
          <button className="btn-ghost" onClick={() => downloadCSV('sales-summary.csv', d.byDay)}>ส่งออก CSV</button></div>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={d.byDay}>
              <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(x) => String(x).slice(5)} />
              <YAxis tick={{ fontSize: 11 }} width={48} />
              <Tooltip formatter={(v: number) => money(v)} />
              <Bar dataKey="revenue" fill="#1d57f5" radius={[4, 4, 0, 0]} />
              <Bar dataKey="profit" fill="#10b981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

function PnlView({ d }: { d: any }) {
  const profitable = d.netProfit >= 0;
  const csvRows = [
    { รายการ: 'รายได้ (รวม VAT)', จำนวน: d.revenue },
    { รายการ: 'หัก ภาษีมูลค่าเพิ่ม', จำนวน: -d.vat },
    { รายการ: 'รายได้สุทธิ (ก่อนต้นทุน)', จำนวน: d.netRevenue },
    { รายการ: 'หัก ต้นทุนขาย (COGS)', จำนวน: -d.cogs },
    { รายการ: 'กำไรขั้นต้น', จำนวน: d.grossProfit },
    ...d.expenses.map((e: any) => ({ รายการ: `หัก ค่าใช้จ่าย: ${e.category}`, จำนวน: -e.amount })),
    { รายการ: 'กำไรสุทธิ', จำนวน: d.netProfit },
  ];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="รายได้สุทธิ (ก่อนต้นทุน)" value={money(d.netRevenue)} accent="text-brand-700" />
        <Stat label="กำไรขั้นต้น" value={money(d.grossProfit)} accent="text-emerald-600" />
        <Stat label="ค่าใช้จ่ายรวม" value={money(d.totalExpenses)} accent="text-rose-600" />
        <Stat label="กำไรสุทธิ" value={money(d.netProfit)} accent={profitable ? 'text-emerald-600' : 'text-rose-600'} />
      </div>
      <div className="card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-bold">งบกำไร-ขาดทุน</h3>
          <button className="btn-ghost" onClick={() => downloadCSV('profit-loss.csv', csvRows)}>ส่งออก CSV</button>
        </div>
        <div className="mx-auto max-w-lg space-y-1 text-sm">
          <PnlRow label="รายได้ (รวม VAT)" value={d.revenue} />
          <PnlRow label="หัก ภาษีมูลค่าเพิ่ม" value={-d.vat} muted />
          <PnlRow label="รายได้สุทธิ (ก่อนต้นทุน)" value={d.netRevenue} bold border />
          <PnlRow label="หัก ต้นทุนสินค้าขาย (COGS)" value={-d.cogs} muted />
          <PnlRow label={`กำไรขั้นต้น (${d.grossMarginPct}%)`} value={d.grossProfit} bold border accent="text-emerald-700" />
          {d.expenses.length > 0 && <div className="pt-1 text-xs font-semibold uppercase tracking-wide text-slate-400">ค่าใช้จ่ายในการดำเนินงาน</div>}
          {d.expenses.map((e: any) => <PnlRow key={e.category} label={`  ${e.category}`} value={-e.amount} muted />)}
          {d.expenses.length > 0 && <PnlRow label="รวมค่าใช้จ่าย" value={-d.totalExpenses} border />}
          <div className="mt-1 flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
            <span className="text-base font-extrabold">กำไรสุทธิ ({d.netMarginPct}%)</span>
            <span className={`text-2xl font-extrabold ${profitable ? 'text-emerald-600' : 'text-rose-600'}`}>{money(d.netProfit)}</span>
          </div>
          <p className="pt-1 text-center text-[11px] text-slate-400">อิงจาก {d.orders} บิลที่ชำระแล้วในช่วงที่เลือก</p>
        </div>
      </div>
    </div>
  );
}

function PnlRow({ label, value, muted, bold, border, accent }: { label: string; value: number; muted?: boolean; bold?: boolean; border?: boolean; accent?: string }) {
  return (
    <div className={`flex items-center justify-between py-1 ${border ? 'border-t border-slate-200' : ''}`}>
      <span className={muted ? 'text-slate-500' : bold ? 'font-bold text-ink-900' : 'text-ink-800'}>{label}</span>
      <span className={`${bold ? 'font-extrabold' : 'font-semibold'} ${accent ?? (value < 0 ? 'text-rose-500' : 'text-ink-900')}`}>{money(value)}</span>
    </div>
  );
}

function PaymentsView({ d }: { d: { method: string; total: number; orders: number }[] }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="card p-5">
        <h3 className="mb-3 font-bold">ยอดขายตามช่องทางชำระเงิน</h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={d} dataKey="total" nameKey="method" outerRadius={90} label={(e: any) => e.method}>
                {d.map((_, i) => <Cell key={i} fill={PIE[i % PIE.length]} />)}
              </Pie>
              <Tooltip formatter={(v: number) => money(v)} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400"><tr><th className="px-4 py-3">ช่องทาง</th><th className="px-4 py-3 text-right">จำนวนบิล</th><th className="px-4 py-3 text-right">ยอดรวม</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {d.map((r) => <tr key={r.method}><td className="px-4 py-3 font-medium">{({ CASH: '💵 เงินสด', TRANSFER: '📱 โอนเงิน', CARD: '💳 บัตร', CREDIT: '🪙 เงินเชื่อ' } as Record<string, string>)[r.method] ?? r.method}</td><td className="px-4 py-3 text-right">{r.orders}</td><td className="px-4 py-3 text-right font-semibold">{money(r.total)}</td></tr>)}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ValuationView({ d }: { d: any }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        <Stat label="มูลค่าตามทุน" value={money(d.totalCost)} />
        <Stat label="มูลค่าตามราคาขาย" value={money(d.totalRetail)} accent="text-brand-700" />
        <Stat label="กำไรที่เป็นไปได้" value={money(d.potentialProfit)} accent="text-emerald-600" />
      </div>
      <TableView title="มูลค่าคงเหลือตามสินค้า" rows={d.rows} file="inventory-valuation.csv"
        cols={[['name', 'สินค้า'], ['stockQty', 'จำนวน'], ['cost', 'ทุน/หน่วย', true], ['costValue', 'มูลค่าทุน', true], ['retailValue', 'มูลค่าขาย', true]]} />
    </div>
  );
}

function ZView({ d }: { d: any }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="เงินสด" value={money(d.totalCash)} />
        <Stat label="โอน/ไม่ใช่เงินสด" value={money(d.totalTransfer)} />
        <Stat label="ยอดรวมทั้งหมด" value={money(d.grandTotal)} accent="text-brand-700" />
        <Stat label="บิลที่ยกเลิก" value={String(d.voids)} accent="text-rose-500" />
      </div>
      <TableView title={`รายงานปิดยอด ${d.date} (แยกตามแคชเชียร์)`} rows={d.byCashier} file={`z-report-${d.date}.csv`}
        cols={[['cashier', 'แคชเชียร์'], ['orders', 'จำนวนบิล'], ['cash', 'เงินสด', true], ['transfer', 'โอน', true], ['total', 'รวม', true]]} />
    </div>
  );
}

function CategoryView({ d }: { d: { category: string; qty: number; revenue: number; cost: number; profit: number; marginPct: number }[] }) {
  const totalProfit = d.reduce((s, r) => s + r.profit, 0);
  const totalRev = d.reduce((s, r) => s + r.revenue, 0);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        <Stat label="รายได้" value={money(totalRev)} accent="text-brand-700" />
        <Stat label="กำไรขั้นต้น" value={money(totalProfit)} accent="text-emerald-600" />
        <Stat label="จำนวนหมวดหมู่" value={String(d.length)} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-5">
          <h3 className="mb-3 font-bold">กำไรตามหมวดหมู่</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={d} layout="vertical" margin={{ left: 24 }}>
                <XAxis type="number" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="category" width={90} tick={{ fontSize: 11, fill: '#475569' }} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v: number) => money(v)} />
                <Bar dataKey="profit" fill="#059669" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <TableView title="แยกตามหมวดหมู่" rows={d} file="profit-by-category.csv"
          cols={[['category', 'หมวดหมู่'], ['qty', 'จำนวน'], ['revenue', 'รายได้', true], ['cost', 'ทุน', true], ['profit', 'กำไร', true], ['marginPct', 'อัตรากำไร %']]} />
      </div>
    </div>
  );
}

function HourlyView({ d }: { d: { hour: number; label: string; revenue: number; orders: number }[] }) {
  const peak = d.reduce((m, r) => (r.revenue > m.revenue ? r : m), d[0] ?? { label: '—', revenue: 0 });
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <Stat label="รายได้รวม" value={money(d.reduce((s, r) => s + r.revenue, 0))} accent="text-brand-700" />
        <Stat label="จำนวนบิลรวม" value={String(d.reduce((s, r) => s + r.orders, 0))} />
        <Stat label="ชั่วโมงขายดีสุด" value={peak.label} accent="text-emerald-600" />
      </div>
      <div className="card p-5">
        <div className="mb-3 flex items-center justify-between"><h3 className="font-bold">ยอดขายตามชั่วโมง</h3><button className="btn-ghost" onClick={() => downloadCSV('sales-by-hour.csv', d)}>ส่งออก CSV</button></div>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={d}>
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} interval={1} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} width={56} axisLine={false} tickLine={false} />
              <Tooltip formatter={(v: number, n) => (n === 'revenue' ? money(v) : v)} />
              <Bar dataKey="revenue" fill="#059669" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

function TaxView({ d }: { d: { taxInclusive: boolean; ratePct: number; grossSales: number; vat: number; netSales: number; orders: number; byDay: { date: string; sales: number; vat: number }[] } }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="ยอดขายรวม" value={money(d.grossSales)} accent="text-brand-700" />
        <Stat label={`VAT ${d.ratePct}% ${d.taxInclusive ? '(รวม)' : '(แยก)'}`} value={money(d.vat)} accent="text-orange-600" />
        <Stat label="ยอดก่อน VAT" value={money(d.netSales)} accent="text-emerald-600" />
        <Stat label="จำนวนบิล" value={String(d.orders)} />
      </div>
      <TableView title="VAT รายวัน" rows={d.byDay} file="tax-summary.csv"
        cols={[['date', 'วันที่'], ['sales', 'ยอดขาย', true], ['vat', 'VAT', true]]} />
    </div>
  );
}

type Col = [string, string, boolean?]; // [key, label, isMoney(sum in totals + right-align)]

/**
 * Excel-like report table: click a header to sort, sticky header, zebra rows,
 * a totals footer summing money columns, and CSV + PDF export.
 */
function TableView({ title, rows, cols, file }: { title: string; rows: any[]; cols: Col[]; file: string }) {
  const meta = useContext(ReportMeta);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [dir, setDir] = useState<'asc' | 'desc'>('desc');
  const [printing, setPrinting] = useState(false);

  const sorted = useMemo(() => {
    if (!sortKey) return rows;
    const r = [...rows].sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey];
      const cmp = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv), 'th');
      return dir === 'asc' ? cmp : -cmp;
    });
    return r;
  }, [rows, sortKey, dir]);

  const totals: Record<string, number> = {};
  cols.forEach(([k, , isMoney]) => { if (isMoney) totals[k] = rows.reduce((s, r) => s + (Number(r[k]) || 0), 0); });
  const hasTotals = cols.some(([, , m]) => m) && rows.length > 0;

  function toggleSort(k: string) {
    if (sortKey === k) setDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(k); setDir('desc'); }
  }

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3">
        <h3 className="font-bold">{title}</h3>
        <div className="flex gap-2">
          <button className="btn-ghost" onClick={() => downloadCSV(file, sorted)}>⬇ Excel/CSV</button>
          <button className="btn-ghost" onClick={() => setPrinting(true)}>🖨 PDF</button>
        </div>
      </div>
      <div className="max-h-[60vh] overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-slate-100 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>{cols.map(([k, l, m]) => (
              <th key={k} onClick={() => toggleSort(k)} className={`cursor-pointer select-none px-4 py-3 hover:bg-slate-200 ${m ? 'text-right' : ''}`}>
                {l}{sortKey === k ? (dir === 'asc' ? ' ▲' : ' ▼') : ''}
              </th>
            ))}</tr>
          </thead>
          <tbody>
            {sorted.map((r, i) => (
              <tr key={i} className={`border-t border-slate-100 ${i % 2 ? 'bg-slate-50/50' : ''} hover:bg-brand-50/40`}>
                {cols.map(([k, , isMoney]) => <td key={k} className={`px-4 py-2.5 ${isMoney ? 'text-right font-semibold tabular-nums' : ''}`}>{isMoney ? money(r[k]) : r[k]}</td>)}
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={cols.length} className="px-4 py-10 text-center text-slate-400">ไม่มีข้อมูล</td></tr>}
          </tbody>
          {hasTotals && (
            <tfoot className="sticky bottom-0 bg-slate-100">
              <tr className="border-t-2 border-slate-300 font-extrabold">
                {cols.map(([k, , isMoney], i) => <td key={k} className={`px-4 py-2.5 ${isMoney ? 'text-right tabular-nums' : ''}`}>{i === 0 ? 'รวม' : isMoney ? money(totals[k]) : ''}</td>)}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {printing && <ReportPrint title={title} cols={cols} rows={sorted} totals={hasTotals ? totals : null} meta={meta} onDone={() => setPrinting(false)} />}
    </div>
  );
}

/** Off-screen A4 report rendered for the browser's print → Save as PDF. Thai-safe. */
function ReportPrint({ title, cols, rows, totals, meta, onDone }: { title: string; cols: Col[]; rows: any[]; totals: Record<string, number> | null; meta: { store: string; range: string }; onDone: () => void }) {
  useEffect(() => {
    const done = () => { window.removeEventListener('afterprint', done); onDone(); };
    window.addEventListener('afterprint', done);
    const t = setTimeout(() => window.print(), 80);
    return () => { clearTimeout(t); window.removeEventListener('afterprint', done); };
  }, []);
  const printedAt = new Date().toLocaleString('th-TH');
  return (
    <div className="report-print">
      <div className="report-paper">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 8 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{meta.store}</div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>{title}</div>
            <div style={{ fontSize: 11, color: '#64748b' }}>ช่วง: {meta.range}</div>
          </div>
          <div style={{ fontSize: 10, color: '#64748b' }}>พิมพ์เมื่อ {printedAt}</div>
        </div>
        <table>
          <thead><tr>{cols.map(([k, l, m]) => <th key={k} style={m ? { textAlign: 'right' } : undefined}>{l}</th>)}</tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>{cols.map(([k, , m]) => <td key={k} style={m ? { textAlign: 'right' } : undefined}>{m ? money(r[k]) : r[k]}</td>)}</tr>
            ))}
          </tbody>
          {totals && (
            <tfoot><tr>{cols.map(([k, , m], i) => <td key={k} style={m ? { textAlign: 'right' } : undefined}>{i === 0 ? 'รวม' : m ? money(totals[k]) : ''}</td>)}</tr></tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
