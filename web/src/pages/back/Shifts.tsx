import { useEffect, useMemo, useState } from 'react';
import { api } from '../../api/client';
import { DataTable } from '../../components/DataTable';
import { ListToolbar } from '../../components/ListToolbar';
import { makeExporters, type Column } from '../../lib/export';
import { useBranch } from '../../store/branch';
import { ShiftReport } from '../../components/ShiftReport';
import { dateTime, money, num } from '../../lib/format';
import { toast } from '../../components/Toast';
import type { Setting, Shift } from '../../types';

function today() { return new Date().toISOString().slice(0, 10); }

export default function Shifts() {
  const branches = useBranch((s) => s.branches);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [branch, setBranch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [setting, setSetting] = useState<Setting | null>(null);
  const [report, setReport] = useState<Shift | null>(null);

  useEffect(() => {
    api<Shift[]>('/shifts').then(setShifts).catch(() => {});
    api<Setting>('/settings').then(setSetting).catch(() => {});
  }, []);

  async function openReport(id: number) {
    try {
      setReport(await api<Shift>(`/shifts/${id}`));
    } catch (e) { toast.error((e as Error).message); }
  }

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    const fromTs = from ? new Date(`${from}T00:00:00`).getTime() : -Infinity;
    const toTs = to ? new Date(`${to}T23:59:59`).getTime() : Infinity;
    return shifts.filter((s) => {
      if (term && !s.user?.name?.toLowerCase().includes(term)) return false;
      if (status && s.status !== status) return false;
      if (branch && s.branchId !== Number(branch)) return false;
      const ts = new Date(s.openedAt).getTime();
      return ts >= fromTs && ts <= toTs;
    });
  }, [shifts, q, status, branch, from, to]);

  const filterCount = [status, branch, from, to].filter(Boolean).length;

  const columns: Column<Shift>[] = [
    { label: '#', value: (s) => s.id },
    { label: 'แคชเชียร์', value: (s) => s.user?.name ?? '' },
    { label: 'เปิดกะ', value: (s) => dateTime(s.openedAt) },
    { label: 'ปิดกะ', value: (s) => (s.closedAt ? dateTime(s.closedAt) : '') },
    { label: 'เงินตั้งต้น', value: (s) => num(s.openingFloat), right: true },
    { label: 'ที่ควรมี', value: (s) => (s.expectedCash != null ? num(s.expectedCash) : ''), right: true },
    { label: 'นับจริง', value: (s) => (s.countedCash != null ? num(s.countedCash) : ''), right: true },
    { label: 'ส่วนต่าง', value: (s) => (s.cashDiff != null ? num(s.cashDiff) : ''), right: true },
    { label: 'สถานะ', value: (s) => (s.status === 'OPEN' ? 'เปิดอยู่' : 'ปิดแล้ว') },
  ];
  const exporters = makeExporters({ filename: 'shifts', title: 'รายงานกะการขาย', columns, rows: () => filtered });

  return (
    <div className="flex h-full flex-col gap-4">
      <ListToolbar
        title="การเงิน / กะการขาย"
        subtitle="รอบลิ้นชักเงินสดและการกระทบยอดเมื่อปิดกะ"
        icon={<i className="fa-solid fa-cash-register" />}
        q={q} setQ={setQ} placeholder="ค้นหาแคชเชียร์…"
        exports={exporters}
        filterCount={filterCount}
        onResetFilter={() => { setStatus(''); setBranch(''); setFrom(''); setTo(''); }}
        filter={
          <>
            {branches.length > 1 && (
              <div>
                <label className="label">สาขา</label>
                <select className="input" value={branch} onChange={(e) => setBranch(e.target.value)}>
                  <option value="">ทุกสาขา</option>
                  {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
            )}
            <div>
              <label className="label">สถานะกะ</label>
              <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="">ทั้งหมด</option>
                <option value="OPEN">เปิดอยู่</option>
                <option value="CLOSED">ปิดแล้ว</option>
              </select>
            </div>
            <div>
              <label className="label">ช่วงวันที่เปิดกะ</label>
              <div className="flex items-center gap-2">
                <input type="date" className="input" value={from} max={to || today()} onChange={(e) => setFrom(e.target.value)} />
                <span className="text-slate-300">—</span>
                <input type="date" className="input" value={to} min={from} max={today()} onChange={(e) => setTo(e.target.value)} />
              </div>
            </div>
          </>
        }
      />

      <DataTable
        rows={filtered}
        colCount={10}
        empty="ยังไม่มีกะการขาย"
        head={
          <tr>
            <th className="px-4 py-3">#</th>
            <th className="px-4 py-3">แคชเชียร์</th>
            <th className="px-4 py-3">เปิดกะ</th>
            <th className="px-4 py-3">ปิดกะ</th>
            <th className="px-4 py-3 text-right">เงินตั้งต้น</th>
            <th className="px-4 py-3 text-right">ที่ควรมี</th>
            <th className="px-4 py-3 text-right">นับจริง</th>
            <th className="px-4 py-3 text-right">ส่วนต่าง</th>
            <th className="px-4 py-3">สถานะ</th>
            <th />
          </tr>
        }
        renderRow={(s) => {
          const diff = s.cashDiff != null ? num(s.cashDiff) : null;
          return (
            <tr key={s.id} className="hover:bg-slate-50">
              <td className="px-4 py-3 font-semibold">{s.id}</td>
              <td className="px-4 py-3">{s.user?.name}</td>
              <td className="px-4 py-3 text-slate-500">{dateTime(s.openedAt)}</td>
              <td className="px-4 py-3 text-slate-500">{s.closedAt ? dateTime(s.closedAt) : '—'}</td>
              <td className="px-4 py-3 text-right">{money(s.openingFloat)}</td>
              <td className="px-4 py-3 text-right">{s.expectedCash != null ? money(s.expectedCash) : '—'}</td>
              <td className="px-4 py-3 text-right">{s.countedCash != null ? money(s.countedCash) : '—'}</td>
              <td className={`px-4 py-3 text-right font-semibold ${diff == null ? 'text-slate-400' : diff === 0 ? 'text-slate-600' : diff > 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                {diff == null ? '—' : `${diff > 0 ? '+' : ''}${money(diff)}`}
              </td>
              <td className="px-4 py-3"><span className={`chip ${s.status === 'OPEN' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{s.status === 'OPEN' ? 'เปิดอยู่' : 'ปิดแล้ว'}</span></td>
              <td className="px-4 py-3 text-right whitespace-nowrap">
                <button className="text-sm font-semibold text-brand-600" onClick={() => openReport(s.id)}>
                  <i className="fa-solid fa-print mr-1" />{s.status === 'OPEN' ? 'X' : 'Z'}
                </button>
              </td>
            </tr>
          );
        }}
      />

      {report && <ShiftReport shift={report} setting={setting} mode={report.status === 'CLOSED' ? 'Z' : 'X'} onDone={() => setReport(null)} />}
    </div>
  );
}
