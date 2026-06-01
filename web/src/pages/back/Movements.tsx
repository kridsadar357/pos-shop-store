import { useEffect, useMemo, useState } from 'react';
import { api } from '../../api/client';
import { DataTable } from '../../components/DataTable';
import { ListToolbar } from '../../components/ListToolbar';
import { makeExporters, type Column } from '../../lib/export';
import { useBranch } from '../../store/branch';
import { dateTime } from '../../lib/format';
import type { Movement } from '../../types';

const TYPES = ['', 'RECEIVE', 'SALE', 'RETURN', 'ADJUST', 'COUNT', 'VOID', 'TRANSFER'];
const TYPE_TH: Record<string, string> = { '': 'ทุกประเภท', RECEIVE: 'รับเข้า', SALE: 'ขาย', RETURN: 'รับคืน', ADJUST: 'ปรับปรุง', COUNT: 'นับสต็อก', VOID: 'ยกเลิก', TRANSFER: 'โอนสาขา' };
const COLOR: Record<string, string> = {
  RECEIVE: 'bg-emerald-50 text-emerald-700',
  SALE: 'bg-brand-50 text-brand-700',
  RETURN: 'bg-amber-50 text-amber-700',
  ADJUST: 'bg-violet-50 text-violet-700',
  COUNT: 'bg-cyan-50 text-cyan-700',
  VOID: 'bg-rose-50 text-rose-600',
  TRANSFER: 'bg-indigo-50 text-indigo-700',
};

function today() { return new Date().toISOString().slice(0, 10); }
function daysAgo(n: number) { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); }

export default function Movements() {
  const branches = useBranch((s) => s.branches);
  const [rows, setRows] = useState<Movement[]>([]);
  const [type, setType] = useState('');
  const [branch, setBranch] = useState('');
  const [q, setQ] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  async function load() {
    setRows(await api<Movement[]>('/inventory/movements', { query: { type, branchId: branch || undefined } }));
  }
  useEffect(() => { load(); }, [type, branch]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    const fromTs = from ? new Date(`${from}T00:00:00`).getTime() : -Infinity;
    const toTs = to ? new Date(`${to}T23:59:59`).getTime() : Infinity;
    return rows.filter((r) => {
      if (term && !(r.product?.name.toLowerCase().includes(term) || r.product?.sku.toLowerCase().includes(term))) return false;
      const ts = new Date(r.createdAt).getTime();
      return ts >= fromTs && ts <= toTs;
    });
  }, [rows, q, from, to]);

  const filterCount = [type, branch, from, to].filter(Boolean).length;

  const columns: Column<Movement>[] = [
    { label: 'วันที่', value: (r) => dateTime(r.createdAt) },
    { label: 'สินค้า', value: (r) => r.product?.name ?? '' },
    { label: 'SKU', value: (r) => r.product?.sku ?? '' },
    { label: 'ประเภท', value: (r) => TYPE_TH[r.type] ?? r.type },
    { label: 'เปลี่ยนแปลง', value: (r) => r.qtyDelta, right: true },
    { label: 'คงเหลือ', value: (r) => r.balanceAfter, right: true },
    { label: 'อ้างอิง/หมายเหตุ', value: (r) => r.note || r.refType },
    { label: 'ผู้ทำรายการ', value: (r) => r.user?.name ?? '' },
  ];
  const exporters = makeExporters({ filename: 'stock-ledger', title: 'บัญชีเดินสินค้า (คลังสินค้า)', columns, rows: () => filtered });

  return (
    <div className="flex h-full flex-col gap-4">
      <ListToolbar
        title="บัญชีสต็อก (คลังสินค้า)"
        subtitle="บันทึกความเคลื่อนไหวสต็อกทุกรายการ — ตรวจสอบย้อนหลังได้ทั้งหมด"
        icon={<i className="fa-solid fa-warehouse" />}
        q={q} setQ={setQ} placeholder="กรองตามสินค้า / SKU…"
        exports={exporters}
        filterCount={filterCount}
        onResetFilter={() => { setType(''); setBranch(''); setFrom(''); setTo(''); }}
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
              <label className="label">ประเภทความเคลื่อนไหว</label>
              <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
                {TYPES.map((t) => <option key={t} value={t}>{TYPE_TH[t]}</option>)}
              </select>
            </div>
            <div>
              <label className="label">ช่วงวันที่</label>
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
        colCount={7}
        reserve={370}
        empty="ยังไม่มีรายการเคลื่อนไหว"
        head={<tr><th className="px-4 py-3">วันที่</th><th className="px-4 py-3">สินค้า</th><th className="px-4 py-3">ประเภท</th><th className="px-4 py-3 text-right">เปลี่ยนแปลง</th><th className="px-4 py-3 text-right">คงเหลือ</th><th className="px-4 py-3">อ้างอิง / หมายเหตุ</th><th className="px-4 py-3">ผู้ทำรายการ</th></tr>}
        renderRow={(r) => (
          <tr key={r.id} className="hover:bg-slate-50">
            <td className="px-4 py-2.5 text-slate-500">{dateTime(r.createdAt)}</td>
            <td className="px-4 py-2.5"><div className="font-medium">{r.product?.name}</div><div className="text-xs text-slate-400">{r.product?.sku}</div></td>
            <td className="px-4 py-2.5"><span className={`chip ${COLOR[r.type] ?? 'bg-slate-100 text-slate-600'}`}>{TYPE_TH[r.type] ?? r.type}</span></td>
            <td className={`px-4 py-2.5 text-right font-semibold ${r.qtyDelta >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>{r.qtyDelta > 0 ? `+${r.qtyDelta}` : r.qtyDelta}</td>
            <td className="px-4 py-2.5 text-right font-semibold">{r.balanceAfter}</td>
            <td className="px-4 py-2.5 text-slate-500">{r.note || r.refType}</td>
            <td className="px-4 py-2.5 text-slate-500">{r.user?.name ?? '—'}</td>
          </tr>
        )}
      />
    </div>
  );
}
