import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { PageHeader } from '../../components/ui';
import { dateTime, downloadCSV } from '../../lib/format';
import type { Movement } from '../../types';

const TYPES = ['', 'RECEIVE', 'SALE', 'RETURN', 'ADJUST', 'COUNT', 'VOID'];
const TYPE_TH: Record<string, string> = { '': 'ทุกประเภท', RECEIVE: 'รับเข้า', SALE: 'ขาย', RETURN: 'รับคืน', ADJUST: 'ปรับปรุง', COUNT: 'นับสต็อก', VOID: 'ยกเลิก' };
const COLOR: Record<string, string> = {
  RECEIVE: 'bg-emerald-50 text-emerald-700',
  SALE: 'bg-brand-50 text-brand-700',
  RETURN: 'bg-amber-50 text-amber-700',
  ADJUST: 'bg-violet-50 text-violet-700',
  COUNT: 'bg-cyan-50 text-cyan-700',
  VOID: 'bg-rose-50 text-rose-600',
};

export default function Movements() {
  const [rows, setRows] = useState<Movement[]>([]);
  const [type, setType] = useState('');
  const [q, setQ] = useState('');

  async function load() {
    setRows(await api<Movement[]>('/inventory/movements', { query: { type } }));
  }
  useEffect(() => { load(); }, [type]);

  const filtered = rows.filter((r) =>
    !q || r.product?.name.toLowerCase().includes(q.toLowerCase()) || r.product?.sku.toLowerCase().includes(q.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title="บัญชีสต็อก (คลังสินค้า)"
        subtitle="บันทึกความเคลื่อนไหวสต็อกทุกรายการ — ตรวจสอบย้อนหลังได้ทั้งหมด"
        icon="↺"
        actions={
          <button className="btn-ghost" onClick={() => downloadCSV('stock-ledger.csv', filtered.map((r) => ({
            date: r.createdAt, product: r.product?.name, sku: r.product?.sku, type: r.type, qty: r.qtyDelta, balance: r.balanceAfter, ref: r.refType, note: r.note, user: r.user?.name ?? '',
          })))}>ส่งออก CSV</button>
        }
      />

      <div className="flex flex-wrap gap-2">
        <input className="input max-w-xs" placeholder="กรองตามสินค้า…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input max-w-[160px]" value={type} onChange={(e) => setType(e.target.value)}>
          {TYPES.map((t) => <option key={t} value={t}>{TYPE_TH[t]}</option>)}
        </select>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
            <tr><th className="px-4 py-3">วันที่</th><th className="px-4 py-3">สินค้า</th><th className="px-4 py-3">ประเภท</th><th className="px-4 py-3 text-right">เปลี่ยนแปลง</th><th className="px-4 py-3 text-right">คงเหลือ</th><th className="px-4 py-3">อ้างอิง / หมายเหตุ</th><th className="px-4 py-3">ผู้ทำรายการ</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50">
                <td className="px-4 py-2.5 text-slate-500">{dateTime(r.createdAt)}</td>
                <td className="px-4 py-2.5"><div className="font-medium">{r.product?.name}</div><div className="text-xs text-slate-400">{r.product?.sku}</div></td>
                <td className="px-4 py-2.5"><span className={`chip ${COLOR[r.type] ?? 'bg-slate-100 text-slate-600'}`}>{TYPE_TH[r.type] ?? r.type}</span></td>
                <td className={`px-4 py-2.5 text-right font-semibold ${r.qtyDelta >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>{r.qtyDelta > 0 ? `+${r.qtyDelta}` : r.qtyDelta}</td>
                <td className="px-4 py-2.5 text-right font-semibold">{r.balanceAfter}</td>
                <td className="px-4 py-2.5 text-slate-500">{r.note || r.refType}</td>
                <td className="px-4 py-2.5 text-slate-500">{r.user?.name ?? '—'}</td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-400">ยังไม่มีรายการเคลื่อนไหว</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
