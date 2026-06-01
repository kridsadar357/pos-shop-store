import { useEffect, useMemo, useState } from 'react';
import { api } from '../../api/client';
import { Modal } from '../../components/Modal';
import { DataTable } from '../../components/DataTable';
import { ListToolbar } from '../../components/ListToolbar';
import { makeExporters, type Column } from '../../lib/export';
import { toast } from '../../components/Toast';

interface Supplier { id: number; name: string; phone: string; email: string; note: string; }
const empty = { name: '', phone: '', email: '', note: '' };
type Form = typeof empty;

export default function Suppliers() {
  const [items, setItems] = useState<Supplier[]>([]);
  const [q, setQ] = useState('');
  const [contactFilter, setContactFilter] = useState('');
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [form, setForm] = useState<Form | null>(null);

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
            <td className="px-4 py-3 text-right"><button className="text-sm font-semibold text-brand-600" onClick={() => openEdit(s)}>แก้ไข</button></td>
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
    </div>
  );
}
