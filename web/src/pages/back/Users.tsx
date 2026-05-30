import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { Modal } from '../../components/Modal';
import { PageHeader } from '../../components/ui';
import { toast } from '../../components/Toast';

interface U { id: number; username: string; name: string; role: string; isActive: boolean; }

export default function Users() {
  const [users, setUsers] = useState<U[]>([]);
  const [form, setForm] = useState<{ username: string; name: string; password: string; role: string } | null>(null);

  async function load() { setUsers(await api<U[]>('/users')); }
  useEffect(() => { load(); }, []);

  async function create() {
    if (!form) return;
    try {
      await api('/users', { method: 'POST', body: form });
      toast.success('User created');
      setForm(null);
      load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function toggle(u: U) {
    await api(`/users/${u.id}`, { method: 'PUT', body: { isActive: !u.isActive } });
    load();
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Users"
        subtitle="Manage staff and roles"
        icon="👤"
        actions={<button className="btn-primary" onClick={() => setForm({ username: '', name: '', password: '', role: 'CASHIER' })}>+ New user</button>}
      />

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
            <tr><th className="px-4 py-3">Name</th><th className="px-4 py-3">Username</th><th className="px-4 py-3">Role</th><th className="px-4 py-3">Status</th><th /></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-semibold">{u.name}</td>
                <td className="px-4 py-3 text-slate-500">{u.username}</td>
                <td className="px-4 py-3"><span className="chip bg-brand-50 text-brand-700">{u.role}</span></td>
                <td className="px-4 py-3"><span className={`chip ${u.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{u.isActive ? 'Active' : 'Disabled'}</span></td>
                <td className="px-4 py-3 text-right"><button className="text-sm font-semibold text-brand-600" onClick={() => toggle(u)}>{u.isActive ? 'Disable' : 'Enable'}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {form && (
        <Modal title="New user" onClose={() => setForm(null)}>
          <div className="space-y-3">
            <div><label className="label">Name</label><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div><label className="label">Username</label><input className="input" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} /></div>
            <div><label className="label">Password</label><input className="input" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>
            <div><label className="label">Role</label>
              <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                <option value="CASHIER">Cashier</option><option value="MANAGER">Manager</option><option value="ADMIN">Admin</option>
              </select>
            </div>
          </div>
          <div className="mt-5 flex gap-2"><button className="btn-ghost flex-1" onClick={() => setForm(null)}>Cancel</button><button className="btn-primary flex-1" onClick={create}>Create</button></div>
        </Modal>
      )}
    </div>
  );
}
