import { useEffect, useMemo, useState } from 'react';
import { api } from '../../api/client';
import { Modal } from '../../components/Modal';
import { DataTable } from '../../components/DataTable';
import { ListToolbar } from '../../components/ListToolbar';
import { makeExporters, type Column } from '../../lib/export';
import { toast } from '../../components/Toast';
import { money, dateTime } from '../../lib/format';

interface Supplier { id: number; name: string; phone: string; email: string; note: string; }
interface SupplierHistory {
  purchaseOrders: { id: number; refNo: string; status: string; createdAt: string; total: number; items: number; paid: number }[];
  stats: { poCount: number; totalOrdered: number; totalPaid: number; outstanding: number; lastOrder: string | null };
}
const PO_ST: Record<string, string> = { DRAFT: 'ร่าง', ORDERED: 'สั่งแล้ว', PARTIAL: 'รับบางส่วน', RECEIVED: 'รับครบ', CANCELLED: 'ยกเลิก' };
const empty = { name: '', phone: '', email: '', note: '' };
type Form = typeof empty;

export default function Suppliers() {
  const [items, setItems] = useState<Supplier[]>([]);
  const [q, setQ] = useState('');
  const [contactFilter, setContactFilter] = useState('');
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [historyFor, setHistoryFor] = useState<Supplier | null>(null);

  async function load() { setItems(await api<Supplier[]>('/suppliers')); }
  useEffect(() => { load(); }, []);

  function openNew() { setEditing(null); setForm({ ...empty }); }
  function openEdit(s: Supplier) { setEditing(s); setForm({ name: s.name, phone: s.phone, email: s.email, note: s.note }); }

  async function save() {
    if (!form) return;
    try {
      if (editing) await api(`/suppliers/${editing.id}`, { method: 'PUT', body: form });
      else await api('/suppliers', { method: 'POST', body: form });
      toast.success('บันทึกแล้ว');
      setForm(null);
      load();
    } catch (e) { toast.error((e as Error).message); }
  }

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return items.filter((s) => {
      if (term && !(s.name.toLowerCase().includes(term) || (s.phone || '').includes(term) || (s.email || '').toLowerCase().includes(term))) return false;
      if (contactFilter === 'phone' && !s.phone) return false;
      if (contactFilter === 'email' && !s.email) return false;
      return true;
    });
  }, [items, q, contactFilter]);

  const filterCount = [contactFilter].filter(Boolean).length;

  const columns: Column<Supplier>[] = [
    { label: 'ชื่อผู้จำหน่าย', value: (s) => s.name },
    { label: 'เบอร์โทร', value: (s) => s.phone || '' },
    { label: 'อีเมล', value: (s) => s.email || '' },
    { label: 'หมายเหตุ', value: (s) => s.note || '' },
  ];
  const exporters = makeExporters({ filename: 'suppliers', title: 'รายชื่อผู้จำหน่าย', columns, rows: () => filtered });

  return (
    <div className="flex h-full flex-col gap-4">
      <ListToolbar
        title="ผู้จำหน่าย"
        subtitle="จัดการซัพพลายเออร์ที่รับสินค้าเข้า"
        icon={<i className="fa-solid fa-handshake" />}
        q={q} setQ={setQ} placeholder="ค้นหาชื่อ / เบอร์โทร / อีเมล…"
        primary={<button className="btn-primary" onClick={openNew}><i className="fa-solid fa-plus mr-1.5" />เพิ่มผู้จำหน่าย</button>}
        exports={exporters}
        filterCount={filterCount}
        onResetFilter={() => setContactFilter('')}
        filter={
          <div>
            <label className="label">ข้อมูลติดต่อ</label>
            <select className="input" value={contactFilter} onChange={(e) => setContactFilter(e.target.value)}>
              <option value="">ทั้งหมด</option>
              <option value="phone">มีเบอร์โทร</option>
              <option value="email">มีอีเมล</option>
            </select>
          </div>
        }
      />

      <DataTable
        rows={filtered}
        colCount={5}
        empty="ยังไม่มีผู้จำหน่าย"
        head={<tr><th className="px-4 py-3">ชื่อผู้จำหน่าย</th><th className="px-4 py-3">เบอร์โทร</th><th className="px-4 py-3">อีเมล</th><th className="px-4 py-3">หมายเหตุ</th><th /></tr>}
        renderRow={(s) => (
          <tr key={s.id} className="hover:bg-slate-50">
            <td className="px-4 py-3 font-semibold">{s.name}</td>
            <td className="px-4 py-3">{s.phone || '—'}</td>
            <td className="px-4 py-3 text-slate-500">{s.email || '—'}</td>
            <td className="px-4 py-3 text-slate-500">{s.note || '—'}</td>
            <td className="px-4 py-3 text-right whitespace-nowrap">
              <button className="text-sm font-semibold text-sky-600" onClick={() => setHistoryFor(s)}>ประวัติ</button>
              <button className="ml-3 text-sm font-semibold text-brand-600" onClick={() => openEdit(s)}>แก้ไข</button>
            </td>
          </tr>
        )}
      />

      {form && (
        <Modal title={editing ? 'แก้ไขผู้จำหน่าย' : 'เพิ่มผู้จำหน่าย'} onClose={() => setForm(null)}>
          <div className="space-y-3">
            <div><label className="label">ชื่อผู้จำหน่าย</label><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">เบอร์โทร</label><input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
              <div><label className="label">อีเมล</label><input className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            </div>
            <div><label className="label">หมายเหตุ</label><input className="input" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></div>
          </div>
          <div className="mt-5 flex gap-2"><button className="btn-ghost flex-1" onClick={() => setForm(null)}>ยกเลิก</button><button className="btn-primary flex-1" disabled={!form.name} onClick={save}>บันทึก</button></div>
        </Modal>
      )}

      {historyFor && <HistoryModal supplier={historyFor} onClose={() => setHistoryFor(null)} />}
    </div>
  );
}

function HistoryModal({ supplier, onClose }: { supplier: Supplier; onClose: () => void }) {
  const [data, setData] = useState<SupplierHistory | null>(null);
  useEffect(() => { api<SupplierHistory>(`/suppliers/${supplier.id}/history`).then(setData).catch(() => setData({ purchaseOrders: [], stats: { poCount: 0, totalOrdered: 0, totalPaid: 0, outstanding: 0, lastOrder: null } })); }, [supplier.id]);

  return (
    <Modal title={`ประวัติการสั่งซื้อ · ${supplier.name}`} wide onClose={onClose}>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="ใบสั่งซื้อ" value={String(data?.stats.poCount ?? 0)} />
        <Tile label="ยอดสั่งซื้อสะสม" value={money(data?.stats.totalOrdered ?? 0)} tone="text-brand-700" />
        <Tile label="ชำระแล้ว" value={money(data?.stats.totalPaid ?? 0)} tone="text-emerald-600" />
        <Tile label="คงค้างชำระ" value={money(data?.stats.outstanding ?? 0)} tone="text-rose-600" />
      </div>
      <div className="mt-4 max-h-80 overflow-auto rounded-xl ring-1 ring-slate-100">
        {!data ? <p className="py-8 text-center text-sm text-slate-400">กำลังโหลด…</p>
          : data.purchaseOrders.length === 0 ? <p className="py-8 text-center text-sm text-slate-400">ยังไม่มีใบสั่งซื้อ</p>
          : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
                <tr><th className="px-3 py-2">เลขที่ PO</th><th className="px-3 py-2">วันที่</th><th className="px-3 py-2">สถานะ</th><th className="px-3 py-2 text-right">รายการ</th><th className="px-3 py-2 text-right">ยอดรวม</th><th className="px-3 py-2 text-right">ชำระแล้ว</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {data.purchaseOrders.map((po) => (
                  <tr key={po.id}>
                    <td className="px-3 py-2 font-mono text-xs font-semibold">{po.refNo}</td>
                    <td className="px-3 py-2 text-slate-500">{dateTime(po.createdAt)}</td>
                    <td className="px-3 py-2"><span className="chip bg-slate-100 text-slate-600">{PO_ST[po.status] ?? po.status}</span></td>
                    <td className="px-3 py-2 text-right">{po.items}</td>
                    <td className="px-3 py-2 text-right font-semibold">{money(po.total)}</td>
                    <td className="px-3 py-2 text-right text-emerald-600">{money(po.paid)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </div>
    </Modal>
  );
}

function Tile({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return <div className="rounded-xl bg-slate-50 p-3 text-center"><div className="text-[11px] text-slate-400">{label}</div><div className={`text-lg font-extrabold ${tone ?? 'text-ink-900'}`}>{value}</div></div>;
}
