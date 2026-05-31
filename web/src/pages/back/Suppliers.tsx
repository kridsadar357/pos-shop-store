import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { Modal } from '../../components/Modal';
import { PageHeader } from '../../components/ui';
import { toast } from '../../components/Toast';

interface Supplier { id: number; name: string; phone: string; email: string; note: string; }
const empty = { name: '', phone: '', email: '', note: '' };
type Form = typeof empty;

export default function Suppliers() {
  const [items, setItems] = useState<Supplier[]>([]);
  const [q, setQ] = useState('');
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

  const filtered = items.filter((s) => !q || s.name.includes(q) || s.phone.includes(q));

  return (
    <div className="space-y-4">
      <PageHeader
        title="ผู้จำหน่าย"
        subtitle="จัดการซัพพลายเออร์ที่รับสินค้าเข้า"
        icon="🚚"
        actions={<button className="btn-primary" onClick={openNew}>+ เพิ่มผู้จำหน่าย</button>}
      />

      <input className="input max-w-md" placeholder="ค้นหาชื่อ / เบอร์โทร…" value={q} onChange={(e) => setQ(e.target.value)} />

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
            <tr><th className="px-4 py-3">ชื่อผู้จำหน่าย</th><th className="px-4 py-3">เบอร์โทร</th><th className="px-4 py-3">อีเมล</th><th className="px-4 py-3">หมายเหตุ</th><th /></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map((s) => (
              <tr key={s.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-semibold">{s.name}</td>
                <td className="px-4 py-3">{s.phone || '—'}</td>
                <td className="px-4 py-3 text-slate-500">{s.email || '—'}</td>
                <td className="px-4 py-3 text-slate-500">{s.note || '—'}</td>
                <td className="px-4 py-3 text-right"><button className="text-sm font-semibold text-brand-600" onClick={() => openEdit(s)}>แก้ไข</button></td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-400">ยังไม่มีผู้จำหน่าย</td></tr>}
          </tbody>
        </table>
      </div>

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
