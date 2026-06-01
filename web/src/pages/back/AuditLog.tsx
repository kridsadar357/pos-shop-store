import { useEffect, useMemo, useState } from 'react';
import { api } from '../../api/client';
import { DataTable } from '../../components/DataTable';
import { ListToolbar } from '../../components/ListToolbar';
import { makeExporters, type Column } from '../../lib/export';
import { dateTime } from '../../lib/format';
import type { AuditLog as Log } from '../../types';

function today() { return new Date().toISOString().slice(0, 10); }

const METHOD_CHIP: Record<string, string> = {
  POST: 'bg-emerald-50 text-emerald-700',
  PUT: 'bg-sky-50 text-sky-700',
  PATCH: 'bg-sky-50 text-sky-700',
  DELETE: 'bg-rose-50 text-rose-700',
};

function statusClass(s: number) {
  if (s >= 500) return 'text-rose-600';
  if (s >= 400) return 'text-amber-600';
  return 'text-emerald-600';
}

export default function AuditLog() {
  const [rows, setRows] = useState<Log[]>([]);
  const [q, setQ] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [method, setMethod] = useState('');

  async function load() {
    const query: Record<string, string> = {};
    if (from) query.from = new Date(`${from}T00:00:00`).toISOString();
    if (to) query.to = new Date(`${to}T23:59:59`).toISOString();
    if (method) query.method = method;
    if (q.trim()) query.q = q.trim();
    setRows(await api<Log[]>('/audit', { query }));
  }
  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [q, from, to, method]);

  const filterCount = [from, to, method].filter(Boolean).length;

  const columns: Column<Log>[] = [
    { label: 'เวลา', value: (l) => dateTime(l.createdAt) },
    { label: 'ผู้ใช้', value: (l) => l.userName || '(ไม่ระบุ)' },
    { label: 'บทบาท', value: (l) => l.role },
    { label: 'การกระทำ', value: (l) => l.action },
    { label: 'Method', value: (l) => l.method },
    { label: 'Path', value: (l) => l.path },
    { label: 'สถานะ', value: (l) => l.status },
    { label: 'IP', value: (l) => l.ip },
  ];
  const exporters = makeExporters({ filename: 'audit-log', title: 'บันทึกการใช้งานระบบ', columns, rows: () => rows });

  return (
    <div className="flex h-full flex-col gap-4">
      <ListToolbar
        title="บันทึกการใช้งาน (Audit Log)"
        subtitle="ประวัติการเปลี่ยนแปลงข้อมูลทั้งหมดในระบบ — ใครทำอะไร เมื่อไหร่"
        icon={<i className="fa-solid fa-clipboard-list" />}
        q={q} setQ={setQ} placeholder="ค้นหาผู้ใช้ / การกระทำ / path…"
        dateRange={
          <div className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 ring-1 ring-slate-200">
            <i className="fa-regular fa-calendar text-slate-400" />
            <input type="date" className="bg-transparent text-sm outline-none" value={from} max={to || today()} onChange={(e) => setFrom(e.target.value)} />
            <span className="text-slate-300">—</span>
            <input type="date" className="bg-transparent text-sm outline-none" value={to} min={from} max={today()} onChange={(e) => setTo(e.target.value)} />
          </div>
        }
        exports={exporters}
        filterCount={filterCount}
        onResetFilter={() => { setFrom(''); setTo(''); setMethod(''); }}
        filter={
          <div>
            <label className="label">Method</label>
            <select className="input" value={method} onChange={(e) => setMethod(e.target.value)}>
              <option value="">ทั้งหมด</option>
              {['POST', 'PUT', 'PATCH', 'DELETE'].map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
        }
      />

      <DataTable
        rows={rows}
        colCount={7}
        empty="ยังไม่มีบันทึกการใช้งาน"
        head={<tr><th className="px-4 py-3">เวลา</th><th className="px-4 py-3">ผู้ใช้</th><th className="px-4 py-3">การกระทำ</th><th className="px-4 py-3">Method</th><th className="px-4 py-3">Path</th><th className="px-4 py-3 text-right">สถานะ</th><th className="px-4 py-3">IP</th></tr>}
        renderRow={(l) => (
          <tr key={l.id} className="hover:bg-slate-50">
            <td className="px-4 py-3 whitespace-nowrap text-slate-500">{dateTime(l.createdAt)}</td>
            <td className="px-4 py-3">
              <div className="font-semibold">{l.userName || '(ไม่ระบุ)'}</div>
              {l.role && <div className="text-[11px] text-slate-400">{l.role}</div>}
            </td>
            <td className="px-4 py-3 font-medium">{l.action}</td>
            <td className="px-4 py-3"><span className={`chip ${METHOD_CHIP[l.method] ?? 'bg-slate-100 text-slate-500'}`}>{l.method}</span></td>
            <td className="px-4 py-3 font-mono text-xs text-slate-500">{l.path}</td>
            <td className={`px-4 py-3 text-right font-bold ${statusClass(l.status)}`}>{l.status}</td>
            <td className="px-4 py-3 font-mono text-xs text-slate-400">{l.ip}</td>
          </tr>
        )}
      />
    </div>
  );
}
