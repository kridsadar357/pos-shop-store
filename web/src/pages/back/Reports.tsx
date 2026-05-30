import { useEffect, useState } from 'react';
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '../../api/client';
import { PageHeader } from '../../components/ui';
import { downloadCSV, money } from '../../lib/format';

type Tab = 'summary' | 'payments' | 'top' | 'category' | 'hourly' | 'tax' | 'low' | 'valuation' | 'z';
const TABS: { key: Tab; label: string }[] = [
  { key: 'summary', label: 'Sales Summary' },
  { key: 'payments', label: 'Payment Methods' },
  { key: 'top', label: 'Top Products' },
  { key: 'category', label: 'Profit by Category' },
  { key: 'hourly', label: 'Sales by Hour' },
  { key: 'tax', label: 'Tax Summary' },
  { key: 'low', label: 'Low Stock' },
  { key: 'valuation', label: 'Inventory Valuation' },
  { key: 'z', label: 'Daily Z-Report' },
];
const PIE = ['#059669', '#f59e0b', '#3b82f6', '#ef4444'];

function todayISO() { return new Date().toISOString().slice(0, 10); }
function daysAgoISO(n: number) { return new Date(Date.now() - n * 864e5).toISOString().slice(0, 10); }

export default function Reports() {
  const [tab, setTab] = useState<Tab>('summary');
  const [from, setFrom] = useState(daysAgoISO(30));
  const [to, setTo] = useState(todayISO());
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    const range = { from: new Date(from).toISOString(), to: new Date(to + 'T23:59:59').toISOString() };
    const endpoints: Record<Tab, () => Promise<any>> = {
      summary: () => api('/reports/summary', { query: range }),
      payments: () => api('/reports/payment-methods', { query: range }),
      top: () => api('/reports/top-products', { query: range }),
      category: () => api('/reports/profit-by-category', { query: range }),
      hourly: () => api('/reports/sales-by-hour', { query: range }),
      tax: () => api('/reports/tax-summary', { query: range }),
      low: () => api('/reports/low-stock'),
      valuation: () => api('/reports/inventory-valuation'),
      z: () => api('/reports/z-report', { query: { date: new Date(to).toISOString() } }),
    };
    setData(null); // avoid rendering a view with the previous tab's (mismatched) data
    endpoints[tab]().then(setData).catch(() => setData(null));
  }, [tab, from, to]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Reports"
        subtitle="Sales, profit, payments, and inventory analytics"
        icon="📊"
        actions={
          <div className="flex items-center gap-2">
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
          {tab === 'payments' && <PaymentsView d={data} />}
          {tab === 'top' && <TableView title="Top products" rows={data} cols={[['name', 'Product'], ['qty', 'Qty sold'], ['revenue', 'Revenue', true], ['profit', 'Profit', true]]} file="top-products.csv" />}
          {tab === 'category' && <CategoryView d={data} />}
          {tab === 'hourly' && <HourlyView d={data} />}
          {tab === 'tax' && <TaxView d={data} />}
          {tab === 'low' && <TableView title="Low stock" rows={data} cols={[['name', 'Product'], ['sku', 'SKU'], ['stockQty', 'Stock'], ['reorderLevel', 'Reorder ≤']]} file="low-stock.csv" />}
          {tab === 'valuation' && <ValuationView d={data} />}
          {tab === 'z' && <ZView d={data} />}
        </>
      )}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return <div className="card p-5"><div className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</div><div className={`mt-2 text-2xl font-extrabold ${accent ?? ''}`}>{value}</div></div>;
}

function SummaryView({ d }: { d: any }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Stat label="Revenue" value={money(d.revenue)} accent="text-brand-700" />
        <Stat label="Gross profit" value={money(d.grossProfit)} accent="text-emerald-600" />
        <Stat label="Margin" value={`${d.marginPct}%`} />
        <Stat label="Orders" value={String(d.orders)} />
        <Stat label="Avg order" value={money(d.avgOrderValue)} />
      </div>
      <div className="card p-5">
        <div className="mb-3 flex items-center justify-between"><h3 className="font-bold">Daily revenue & profit</h3>
          <button className="btn-ghost" onClick={() => downloadCSV('sales-summary.csv', d.byDay)}>Export CSV</button></div>
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

function PaymentsView({ d }: { d: { method: string; total: number; orders: number }[] }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="card p-5">
        <h3 className="mb-3 font-bold">Revenue by payment method</h3>
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
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400"><tr><th className="px-4 py-3">Method</th><th className="px-4 py-3 text-right">Orders</th><th className="px-4 py-3 text-right">Total</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {d.map((r) => <tr key={r.method}><td className="px-4 py-3 font-medium">{r.method === 'CASH' ? '💵 Cash' : '📱 Transfer'}</td><td className="px-4 py-3 text-right">{r.orders}</td><td className="px-4 py-3 text-right font-semibold">{money(r.total)}</td></tr>)}
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
        <Stat label="Stock cost value" value={money(d.totalCost)} />
        <Stat label="Stock retail value" value={money(d.totalRetail)} accent="text-brand-700" />
        <Stat label="Potential profit" value={money(d.potentialProfit)} accent="text-emerald-600" />
      </div>
      <TableView title="Valuation by product" rows={d.rows} file="inventory-valuation.csv"
        cols={[['name', 'Product'], ['stockQty', 'Qty'], ['cost', 'Unit cost', true], ['costValue', 'Cost value', true], ['retailValue', 'Retail value', true]]} />
    </div>
  );
}

function ZView({ d }: { d: any }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Cash" value={money(d.totalCash)} />
        <Stat label="Transfer" value={money(d.totalTransfer)} />
        <Stat label="Grand total" value={money(d.grandTotal)} accent="text-brand-700" />
        <Stat label="Voids" value={String(d.voids)} accent="text-rose-500" />
      </div>
      <TableView title={`Z-Report ${d.date} (by cashier)`} rows={d.byCashier} file={`z-report-${d.date}.csv`}
        cols={[['cashier', 'Cashier'], ['orders', 'Orders'], ['cash', 'Cash', true], ['transfer', 'Transfer', true], ['total', 'Total', true]]} />
    </div>
  );
}

function CategoryView({ d }: { d: { category: string; qty: number; revenue: number; cost: number; profit: number; marginPct: number }[] }) {
  const totalProfit = d.reduce((s, r) => s + r.profit, 0);
  const totalRev = d.reduce((s, r) => s + r.revenue, 0);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        <Stat label="Revenue" value={money(totalRev)} accent="text-brand-700" />
        <Stat label="Gross profit" value={money(totalProfit)} accent="text-emerald-600" />
        <Stat label="Categories" value={String(d.length)} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-5">
          <h3 className="mb-3 font-bold">Profit by category</h3>
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
        <TableView title="By category" rows={d} file="profit-by-category.csv"
          cols={[['category', 'Category'], ['qty', 'Qty'], ['revenue', 'Revenue', true], ['cost', 'Cost', true], ['profit', 'Profit', true], ['marginPct', 'Margin %']]} />
      </div>
    </div>
  );
}

function HourlyView({ d }: { d: { hour: number; label: string; revenue: number; orders: number }[] }) {
  const peak = d.reduce((m, r) => (r.revenue > m.revenue ? r : m), d[0] ?? { label: '—', revenue: 0 });
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <Stat label="Total revenue" value={money(d.reduce((s, r) => s + r.revenue, 0))} accent="text-brand-700" />
        <Stat label="Total orders" value={String(d.reduce((s, r) => s + r.orders, 0))} />
        <Stat label="Peak hour" value={peak.label} accent="text-emerald-600" />
      </div>
      <div className="card p-5">
        <div className="mb-3 flex items-center justify-between"><h3 className="font-bold">Revenue by hour of day</h3><button className="btn-ghost" onClick={() => downloadCSV('sales-by-hour.csv', d)}>Export CSV</button></div>
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
        <Stat label="Gross sales" value={money(d.grossSales)} accent="text-brand-700" />
        <Stat label={`VAT ${d.ratePct}% ${d.taxInclusive ? '(incl.)' : '(excl.)'}`} value={money(d.vat)} accent="text-orange-600" />
        <Stat label="Net sales (ex-VAT)" value={money(d.netSales)} accent="text-emerald-600" />
        <Stat label="Orders" value={String(d.orders)} />
      </div>
      <TableView title="VAT by day" rows={d.byDay} file="tax-summary.csv"
        cols={[['date', 'Date'], ['sales', 'Gross sales', true], ['vat', 'VAT', true]]} />
    </div>
  );
}

function TableView({ title, rows, cols, file }: { title: string; rows: any[]; cols: [string, string, boolean?][]; file: string }) {
  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3"><h3 className="font-bold">{title}</h3><button className="btn-ghost" onClick={() => downloadCSV(file, rows)}>Export CSV</button></div>
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
          <tr>{cols.map(([k, l, money]) => <th key={k} className={`px-4 py-3 ${money ? 'text-right' : ''}`}>{l}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r, i) => (
            <tr key={i} className="hover:bg-slate-50">
              {cols.map(([k, , isMoney]) => <td key={k} className={`px-4 py-2.5 ${isMoney ? 'text-right font-semibold' : ''}`}>{isMoney ? money(r[k]) : r[k]}</td>)}
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={cols.length} className="px-4 py-10 text-center text-slate-400">No data.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
