import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api } from '../../api/client';
import { money } from '../../lib/format';
import { PageHeader, StatCard, EmptyState } from '../../components/ui';

interface Summary {
  orders: number;
  revenue: number;
  grossProfit: number;
  marginPct: number;
  avgOrderValue: number;
  byDay: { date: string; revenue: number; orders: number; profit: number }[];
}
interface PayRow { method: string; total: number; orders: number; }
interface TopRow { productId: number; name: string; qty: number; revenue: number; }
type LowRow = { id: number; name: string; stockQty: number; reorderLevel: number; unit: string };

const PIE = ['#059669', '#f59e0b'];

/** % change of the most recent day vs the previous day (simple trend signal). */
function deltaOf(series: { revenue: number }[]) {
  if (series.length < 2) return null;
  const a = series[series.length - 2].revenue;
  const b = series[series.length - 1].revenue;
  if (!a) return null;
  return ((b - a) / a) * 100;
}

export default function Dashboard() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [pay, setPay] = useState<PayRow[]>([]);
  const [top, setTop] = useState<TopRow[]>([]);
  const [lowStock, setLowStock] = useState<LowRow[]>([]);

  useEffect(() => {
    const from = new Date(Date.now() - 14 * 864e5).toISOString();
    const q = { query: { from } };
    api<Summary>('/reports/summary', q).then(setSummary).catch(() => {});
    api<PayRow[]>('/reports/payment-methods', q).then(setPay).catch(() => {});
    api<TopRow[]>('/reports/top-products', { query: { from, limit: 5 } }).then(setTop).catch(() => {});
    api<LowRow[]>('/reports/low-stock').then(setLowStock).catch(() => {});
  }, []);

  const delta = summary ? deltaOf(summary.byDay) : null;
  const payTotal = pay.reduce((s, p) => s + p.total, 0);

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" subtitle="Performance overview · last 14 days" icon="▣" />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Revenue" value={money(summary?.revenue ?? 0)} icon="฿" accent="text-brand-700" delta={delta} hint="vs prev day" />
        <StatCard label="Gross profit" value={money(summary?.grossProfit ?? 0)} icon="↑" accent="text-emerald-600" hint={`${summary?.marginPct ?? 0}% margin`} />
        <StatCard label="Orders" value={String(summary?.orders ?? 0)} icon="🧾" />
        <StatCard label="Avg order" value={money(summary?.avgOrderValue ?? 0)} icon="∅" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Revenue trend */}
        <div className="card p-5 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-bold text-ink-900">Revenue trend</h2>
            <Link to="/back/reports" className="text-sm font-semibold text-brand-600 hover:text-brand-700">View reports →</Link>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={summary?.byDay ?? []} margin={{ left: -10, right: 6, top: 6 }}>
                <defs>
                  <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#059669" stopOpacity={0.32} />
                    <stop offset="100%" stopColor="#059669" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={(d) => String(d).slice(5)} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} width={56} axisLine={false} tickLine={false} />
                <Tooltip
                  formatter={(v: number) => money(v)}
                  contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', boxShadow: '0 8px 24px -8px rgba(16,24,40,.18)' }}
                />
                <Area type="monotone" dataKey="revenue" stroke="#059669" strokeWidth={2.5} fill="url(#rev)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Payment split */}
        <div className="card p-5">
          <h2 className="mb-2 font-bold text-ink-900">Payment mix</h2>
          {payTotal === 0 ? (
            <EmptyState icon="💳" title="No sales yet" />
          ) : (
            <>
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pay} dataKey="total" nameKey="method" innerRadius={42} outerRadius={66} paddingAngle={2}>
                      {pay.map((_, i) => <Cell key={i} fill={PIE[i % PIE.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v: number) => money(v)} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-2 space-y-1.5">
                {pay.map((p, i) => (
                  <div key={p.method} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: PIE[i % PIE.length] }} />
                      {p.method === 'CASH' ? 'Cash' : 'Transfer'}
                    </span>
                    <span className="font-semibold">{money(p.total)}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Top products */}
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4">
            <h2 className="font-bold text-ink-900">Top products</h2>
            <Link to="/back/reports" className="text-sm font-semibold text-brand-600">All →</Link>
          </div>
          {top.length === 0 ? (
            <EmptyState icon="🏆" title="No sales in range" />
          ) : (
            <div className="divide-y divide-slate-100">
              {top.map((t, i) => (
                <div key={t.productId} className="flex items-center gap-3 px-5 py-3">
                  <span className="grid h-7 w-7 place-items-center rounded-lg bg-slate-100 text-xs font-bold text-slate-500">{i + 1}</span>
                  <span className="flex-1 truncate text-sm font-medium">{t.name}</span>
                  <span className="text-xs text-slate-400">{t.qty} sold</span>
                  <span className="w-24 text-right text-sm font-semibold">{money(t.revenue)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Low stock */}
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4">
            <h2 className="font-bold text-ink-900">Low stock / reorder</h2>
            <Link to="/back/receive" className="text-sm font-semibold text-brand-600">Receive →</Link>
          </div>
          {lowStock.length === 0 ? (
            <EmptyState icon="✅" title="All stock levels healthy" />
          ) : (
            <div className="divide-y divide-slate-100">
              {lowStock.slice(0, 6).map((p) => (
                <div key={p.id} className="flex items-center justify-between px-5 py-3 text-sm">
                  <span className="font-medium">{p.name}</span>
                  <span className="chip bg-rose-50 text-rose-600">{p.stockQty} {p.unit} · reorder ≤ {p.reorderLevel}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
