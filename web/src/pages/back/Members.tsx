import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { Modal } from '../../components/Modal';
import { PageHeader } from '../../components/ui';
import { toast } from '../../components/Toast';
import type { Member } from '../../types';

const empty = { code: '', name: '', phone: '', email: '', note: '', isActive: true };
type Form = typeof empty;

export default function Members() {
  const [members, setMembers] = useState<Member[]>([]);
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<Member | null>(null);
  const [form, setForm] = useState<Form | null>(null);

  async function load() {
    setMembers(await api<Member[]>('/members', { query: { q } }));
  }
  useEffect(() => {
    const t = setTimeout(load, 150);
    return () => clearTimeout(t);
  }, [q]);

  function openNew() {
    setEditing(null);
    setForm({ ...empty });
  }
  function openEdit(m: Member) {
    setEditing(m);
    setForm({ code: m.code ?? '', name: m.name, phone: m.phone, email: m.email, note: m.note, isActive: m.isActive });
  }

  async function save() {
    if (!form) return;
    try {
      const body = { ...form, code: form.code || null };
      if (editing) await api(`/members/${editing.id}`, { method: 'PUT', body });
      else await api('/members', { method: 'POST', body });
      toast.success('บันทึกแล้ว');
      setForm(null);
      load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="ลูกค้า / สมาชิก"
        subtitle="สมาชิกสะสมแต้ม · มีสิทธิ์ได้ราคาส่ง (ตั้งค่าได้ในหน้าตั้งค่า)"
        icon="🪪"
        actions={<button className="btn-primary" onClick={openNew}>+ เพิ่มสมาชิก</button>}
      />

      <input className="input max-w-md" placeholder="ค้นหาชื่อ / เบอร์โทร / รหัส…" value={q} onChange={(e) => setQ(e.target.value)} />

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
            <tr><th className="px-4 py-3">รหัส</th><th className="px-4 py-3">ชื่อ</th><th className="px-4 py-3">เบอร์โทร</th><th className="px-4 py-3">อีเมล</th><th className="px-4 py-3">สถานะ</th><th /></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {members.map((m) => (
              <tr key={m.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-mono text-xs text-slate-500">{m.code ?? '—'}</td>
                <td className="px-4 py-3 font-semibold">{m.name}</td>
                <td className="px-4 py-3">{m.phone}</td>
                <td className="px-4 py-3 text-slate-500">{m.email || '—'}</td>
                <td className="px-4 py-3"><span className={`chip ${m.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{m.isActive ? 'ใช้งาน' : 'ปิดใช้งาน'}</span></td>
                <td className="px-4 py-3 text-right"><button className="text-sm font-semibold text-brand-600" onClick={() => openEdit(m)}>แก้ไข</button></td>
              </tr>
            ))}
            {members.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-400">ยังไม่มีสมาชิก</td></tr>}
          </tbody>
        </table>
      </div>

      {form && (
        <Modal title={editing ? 'แก้ไขสมาชิก' : 'เพิ่มสมาชิก'} onClose={() => setForm(null)}>
          <div className="space-y-3">
            <div><label className="label">ชื่อ</label><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">เบอร์โทร</label><input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
              <div><label className="label">รหัสสมาชิก</label><input className="input" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></div>
            </div>
            <div><label className="label">อีเมล</label><input className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div><label className="label">หมายเหตุ</label><input className="input" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></div>
            {editing && (
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-brand-600" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} /> ใช้งาน</label>
            )}
          </div>
          <div className="mt-5 flex gap-2"><button className="btn-ghost flex-1" onClick={() => setForm(null)}>ยกเลิก</button><button className="btn-primary flex-1" disabled={!form.name || !form.phone} onClick={save}>บันทึก</button></div>
        </Modal>
      )}
    </div>
  );
}
