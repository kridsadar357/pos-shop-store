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
      toast.success('Saved');
      setForm(null);
      load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Members"
        subtitle="Loyalty members · eligible for wholesale pricing (configurable in Settings)"
        icon="🪪"
        actions={<button className="btn-primary" onClick={openNew}>+ New member</button>}
      />

      <input className="input max-w-md" placeholder="Search name / phone / code…" value={q} onChange={(e) => setQ(e.target.value)} />

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
            <tr><th className="px-4 py-3">Code</th><th className="px-4 py-3">Name</th><th className="px-4 py-3">Phone</th><th className="px-4 py-3">Email</th><th className="px-4 py-3">Status</th><th /></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {members.map((m) => (
              <tr key={m.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-mono text-xs text-slate-500">{m.code ?? '—'}</td>
                <td className="px-4 py-3 font-semibold">{m.name}</td>
                <td className="px-4 py-3">{m.phone}</td>
                <td className="px-4 py-3 text-slate-500">{m.email || '—'}</td>
                <td className="px-4 py-3"><span className={`chip ${m.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{m.isActive ? 'Active' : 'Inactive'}</span></td>
                <td className="px-4 py-3 text-right"><button className="text-sm font-semibold text-brand-600" onClick={() => openEdit(m)}>Edit</button></td>
              </tr>
            ))}
            {members.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-400">No members.</td></tr>}
          </tbody>
        </table>
      </div>

      {form && (
        <Modal title={editing ? 'Edit member' : 'New member'} onClose={() => setForm(null)}>
          <div className="space-y-3">
            <div><label className="label">Name</label><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Phone</label><input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
              <div><label className="label">Code</label><input className="input" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></div>
            </div>
            <div><label className="label">Email</label><input className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div><label className="label">Note</label><input className="input" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></div>
            {editing && (
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-brand-600" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} /> Active</label>
            )}
          </div>
          <div className="mt-5 flex gap-2"><button className="btn-ghost flex-1" onClick={() => setForm(null)}>Cancel</button><button className="btn-primary flex-1" disabled={!form.name || !form.phone} onClick={save}>Save</button></div>
        </Modal>
      )}
    </div>
  );
}
