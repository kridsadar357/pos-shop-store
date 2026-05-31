import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Area, AreaChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { api } from '../../api/client';
import { money } from '../../lib/format';
import { toast } from '../../components/Toast';

interface Kpi { value: number; deltaPct: number | null; series: { x: string; y: number }[]; }
interface Dash {
  kpis: { sales: Kpi; grossProfit: Kpi; orders: Kpi; newCustomers: Kpi; lowStock: Kpi; inventoryValue: Kpi };
  salesByDay: { date: string; sales: number; prev: number }[];
  byChannel: { name: string; value: number; pct: number }[];
  notifications: { tone: string; icon: string; title: string; detail: string }[];
  topProducts: { rank: number; name: string; category: string; qty: number; revenue: number }[];
  topCategories: { rank: number; name: string; revenue: number }[];
  finance: { revenue: number; cogs: number; grossProfit: number; marginPct: number };
}

function todayISO() { return new Date().toISOString().slice(0, 10); }
function daysAgoISO(n: number) { return new Date(Date.now() - n * 864e5).toISOString().slice(0, 10); }
const fmt = (n: number) => new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
const fmtInt = (n: number) => new Intl.NumberFormat('th-TH').format(n);

const CHAN = ['#6366f1', '#22c55e', '#ef4444', '#94a3b8'];
const NOTE_TONE: Record<string, string> = { amber: 'bg-amber-50 text-amber-600', rose: 'bg-rose-50 text-rose-600', blue: 'bg-blue-50 text-blue-600', violet: 'bg-violet-50 text-violet-600' };

export default function Dashboard() {
  const navigate = useNavigate();
  const [from, setFrom] = useState(daysAgoISO(23));
  const [to, setTo] = useState(todayISO());
  const [d, setD] = useState<Dash | null>(null);

  useEffect(() => {
    const range = { from: new Date(from).toISOString(), to: new Date(to + 'T23:59:59').toISOString() };
    api<Dash>('/reports/dashboard', { query: range }).then(setD).catch(() => setD(null));
  }, [from, to]);

  const k = d?.kpis;
  const channelTotal = d?.byChannel.reduce((s, c) => s + c.value, 0) ?? 0;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-ink-900">แดชบอร์ด</h1>
          <p className="text-sm text-slate-500">ภาพรวมของธุรกิจ</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-xl bg-white px-3 py-2 text-sm ring-1 ring-slate-200">
            <span className="text-slate-400">📅</span>
            <input type="date" className="bg-transparent text-sm outline-none" value={from} onChange={(e) => setFrom(e.target.value)} />
            <span className="text-slate-400">–</span>
            <input type="date" className="bg-transparent text-sm outline-none" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <button className="btn-ghost" onClick={() => toast.info('ตัวกรองเพิ่มเติมกำลังจะมาเร็ว ๆ นี้')}>⛃ ตัวกรอง</button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <KpiCard tone="blue" icon="🧾" label="ยอดขายรวม" value={fmt(k?.sales.value ?? 0)} kpi={k?.sales} color="#3b82f6" />
        <KpiCard tone="emerald" icon="📈" label="กำไรขั้นต้น" value={fmt(k?.grossProfit.value ?? 0)} kpi={k?.grossProfit} color="#22c55e" />
        <KpiCard tone="sky" icon="🛒" label="ใบสั่งขาย" value={fmtInt(k?.orders.value ?? 0)} kpi={k?.orders} color="#0ea5e9" />
        <KpiCard tone="violet" icon="👤" label="ลูกค้าใหม่" value={fmtInt(k?.newCustomers.value ?? 0)} kpi={k?.newCustomers} color="#8b5cf6" />
        <KpiCard tone="rose" icon="📦" label="สินค้าใกล้หมด" value={fmtInt(k?.lowStock.value ?? 0)} kpi={k?.lowStock} color="#ef4444" />
        <KpiCard tone="amber" icon="🧊" label="มูลค่าสินค้าคงเหลือ" value={fmtInt(k?.inventoryValue.value ?? 0)} kpi={k?.inventoryValue} color="#f59e0b" />
      </div>

      {/* Charts row */}
      <div className="grid gap-4 xl:grid-cols-3">
        <div className="card p-5 xl:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-bold text-ink-900">ยอดขายรวม</h2>
            <span className="text-sm text-slate-500">รวม <span className="font-extrabold text-ink-900">{fmt(d?.finance.revenue ?? 0)}</span> บาท</span>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={d?.salesByDay ?? []} margin={{ left: -8, right: 6, top: 6 }}>
                <defs>
                  <linearGradient id="dsales" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#3b82f6" stopOpacity={0.3} /><stop offset="100%" stopColor="#3b82f6" stopOpacity={0} /></linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={(x) => String(x).slice(5)} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} width={52} axisLine={false} tickLine={false} tickFormatter={(v) => (v >= 1000 ? `${v / 1000}K` : v)} />
                <Tooltip formatter={(v: number) => money(v)} contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0' }} />
                <Area type="monotone" dataKey="prev" name="ช่วงก่อนหน้า" stroke="#cbd5e1" strokeWidth={2} fill="transparent" />
                <Area type="monotone" dataKey="sales" name="ยอดขาย" stroke="#3b82f6" strokeWidth={2.5} fill="url(#dsales)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card p-5">
          <h2 className="mb-2 font-bold text-ink-900">ยอดขายตามช่องทาง</h2>
          {channelTotal === 0 ? (
            <div className="grid h-56 place-items-center text-sm text-slate-400">ยังไม่มีข้อมูล</div>
          ) : (
            <>
              <div className="relative h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={d?.byChannel} dataKey="value" nameKey="name" innerRadius={52} outerRadius={76} paddingAngle={2}>
                      {(d?.byChannel ?? []).map((_, i) => <Cell key={i} fill={CHAN[i % CHAN.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v: number) => money(v)} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 grid place-items-center">
                  <div className="text-center"><div className="text-[10px] text-slate-400">รวม</div><div className="text-sm font-extrabold">{fmt(channelTotal)}</div></div>
                </div>
              </div>
              <div className="mt-3 space-y-1.5">
                {d?.byChannel.map((c, i) => (
                  <div key={c.name} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: CHAN[i % CHAN.length] }} />{c.name}</span>
                    <span className="text-slate-500"><b className="text-ink-800">{c.pct}%</b> · {fmt(c.value)}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Notifications full-width-ish + bottom row */}
      <div className="grid gap-4 xl:grid-cols-3">
        {/* Best sellers */}
        <Panel title="สินค้าขายดี" sub="10 อันดับ" footer="ดูสินค้าขายดีทั้งหมด" onFooter={() => navigate('/back/reports')}>
          <table className="w-full text-sm">
            <thead><tr className="text-[11px] uppercase tracking-wide text-slate-400"><th className="px-2 py-2 text-left">#</th><th className="px-2 py-2 text-left">สินค้า</th><th className="px-2 py-2 text-left">หมวดหมู่</th><th className="px-2 py-2 text-right">ขายไป</th><th className="px-2 py-2 text-right">ยอดขาย</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {d?.topProducts.map((p) => (
                <tr key={p.rank}><td className="px-2 py-2 text-slate-400">{p.rank}</td><td className="px-2 py-2 font-medium">{p.name}</td><td className="px-2 py-2 text-slate-500">{p.category}</td><td className="px-2 py-2 text-right">{fmtInt(p.qty)}</td><td className="px-2 py-2 text-right font-semibold">{fmt(p.revenue)}</td></tr>
              ))}
              {!d?.topProducts.length && <tr><td colSpan={5} className="py-8 text-center text-slate-400">ยังไม่มีข้อมูล</td></tr>}
            </tbody>
          </table>
        </Panel>

        {/* Top categories (single-store: replaces multi-branch panel) */}
        <Panel title="หมวดหมู่ขายดีสูงสุด" sub="5 อันดับ" footer="ดูรายงานทั้งหมด" onFooter={() => navigate('/back/reports')}>
          <table className="w-full text-sm">
            <thead><tr className="text-[11px] uppercase tracking-wide text-slate-400"><th className="px-2 py-2 text-left">#</th><th className="px-2 py-2 text-left">หมวดหมู่</th><th className="px-2 py-2 text-right">ยอดขาย (บาท)</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {d?.topCategories.map((c) => (
                <tr key={c.rank}><td className="px-2 py-3 text-slate-400">{c.rank}</td><td className="px-2 py-3 font-medium">{c.name}</td><td className="px-2 py-3 text-right font-semibold">{fmt(c.revenue)}</td></tr>
              ))}
              {!d?.topCategories.length && <tr><td colSpan={3} className="py-8 text-center text-slate-400">ยังไม่มีข้อมูล</td></tr>}
            </tbody>
          </table>
        </Panel>

        {/* Finance overview */}
        <Panel title="ภาพรวมการเงิน" sub="ช่วงที่เลือก" footer="ดูรายงานการเงินทั้งหมด" onFooter={() => navigate('/back/reports')}>
          <div className="space-y-3 px-1 py-1 text-sm">
            <FinRow label="รายได้" value={fmt(d?.finance.revenue ?? 0)} cls="text-emerald-600" />
            <FinRow label="ต้นทุนขาย" value={`-${fmt(d?.finance.cogs ?? 0)}`} cls="text-rose-500" />
            <div className="border-t border-slate-100" />
            <FinRow label="กำไรขั้นต้น" value={fmt(d?.finance.grossProfit ?? 0)} bold />
            <FinRow label="อัตรากำไรขั้นต้น" value={`${d?.finance.marginPct ?? 0}%`} cls="text-emerald-600" bold />
          </div>
        </Panel>
      </div>

      {/* Notifications */}
      <div className="card p-5">
        <div className="mb-3 flex items-center justify-between"><h2 className="font-bold text-ink-900">การแจ้งเตือน</h2><button className="text-sm font-semibold text-brand-600" onClick={() => navigate('/back/movements')}>ดูทั้งหมด</button></div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {d?.notifications.map((n, i) => (
            <div key={i} className="flex items-start gap-3 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-100">
              <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg text-base ${NOTE_TONE[n.tone] ?? 'bg-slate-100 text-slate-500'}`}>{n.icon}</span>
              <div><div className="text-sm font-semibold text-ink-900">{n.title}</div><div className="text-xs text-slate-400">{n.detail}</div></div>
            </div>
          ))}
        </div>
      </div>

      {/* Frequent actions */}
      <div className="card p-5">
        <h2 className="mb-3 font-bold text-ink-900">เมนูที่ใช้งานบ่อย</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">
          <Quick icon="📦" label="เพิ่มสินค้า" onClick={() => navigate('/back/products')} />
          <Quick icon="👤" label="เพิ่มลูกค้า" onClick={() => navigate('/back/members')} />
          <Quick icon="🧾" label="เปิดหน้าขาย" onClick={() => navigate('/pos')} />
          <Quick icon="🛍️" label="รับสินค้า" onClick={() => navigate('/back/receive')} />
          <Quick icon="✓" label="นับสต็อก" onClick={() => navigate('/back/stock-count')} />
          <Quick icon="🎯" label="โปรโมชั่น" onClick={() => navigate('/back/promotions')} />
          <Quick icon="📊" label="รายงาน" onClick={() => navigate('/back/reports')} />
          <Quick icon="⚙️" label="ตั้งค่าระบบ" onClick={() => navigate('/back/settings')} />
        </div>
      </div>
    </div>
  );
}

const KPI_TONE: Record<string, string> = {
  blue: 'bg-blue-100 text-blue-600', emerald: 'bg-emerald-100 text-emerald-600', sky: 'bg-sky-100 text-sky-600',
  violet: 'bg-violet-100 text-violet-600', rose: 'bg-rose-100 text-rose-600', amber: 'bg-amber-100 text-amber-600',
};
function KpiCard({ tone, icon, label, value, kpi, color }: { tone: string; icon: string; label: string; value: string; kpi?: Kpi; color: string }) {
  const up = (kpi?.deltaPct ?? 0) >= 0;
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2">
        <span className={`grid h-9 w-9 place-items-center rounded-xl text-base ${KPI_TONE[tone]}`}>{icon}</span>
        <span className="text-xs font-semibold text-slate-400">{label}</span>
      </div>
      <div className="mt-2 text-xl font-extrabold tracking-tight text-ink-900">{value}</div>
      <div className="mt-1 flex items-center justify-between">
        {kpi?.deltaPct != null ? (
          <span className={`text-[11px] font-semibold ${up ? 'text-emerald-600' : 'text-rose-500'}`}>{up ? '▲' : '▼'} {Math.abs(kpi.deltaPct)}% จากช่วงก่อนหน้า</span>
        ) : <span className="text-[11px] text-slate-300">—</span>}
      </div>
      {!!kpi?.series.length && (
        <div className="mt-1 h-9">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={kpi.series}><Line type="monotone" dataKey="y" stroke={color} strokeWidth={2} dot={false} /></LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function Panel({ title, sub, footer, onFooter, children }: { title: string; sub?: string; footer?: string; onFooter?: () => void; children: React.ReactNode }) {
  return (
    <div className="card flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4"><h2 className="font-bold text-ink-900">{title}</h2>{sub && <span className="chip bg-slate-100 text-slate-500">{sub}</span>}</div>
      <div className="flex-1 px-4">{children}</div>
      {footer && <button onClick={onFooter} className="border-t border-slate-100 py-3 text-center text-sm font-semibold text-brand-600 hover:bg-slate-50">{footer}</button>}
    </div>
  );
}
function FinRow({ label, value, cls, bold }: { label: string; value: string; cls?: string; bold?: boolean }) {
  return <div className="flex items-center justify-between"><span className={`${bold ? 'font-bold text-ink-900' : 'text-slate-500'}`}>{label}</span><span className={`${bold ? 'font-extrabold' : 'font-semibold'} ${cls ?? 'text-ink-900'}`}>{value}</span></div>;
}
function Quick({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex flex-col items-center gap-2 rounded-xl bg-slate-50 px-2 py-3 ring-1 ring-slate-200 transition hover:-translate-y-0.5 hover:bg-white hover:shadow-card">
      <span className="grid h-10 w-10 place-items-center rounded-xl bg-white text-lg text-brand-600 ring-1 ring-slate-200">{icon}</span>
      <span className="text-xs font-semibold text-ink-800">{label}</span>
    </button>
  );
}
