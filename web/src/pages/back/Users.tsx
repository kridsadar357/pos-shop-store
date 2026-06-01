import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { Modal } from '../../components/Modal';
import { PageHeader } from '../../components/ui';
import { DataTable } from '../../components/DataTable';
import { toast } from '../../components/Toast';

interface U { id: number; username: string; name: string; role: string; isActive: boolean; }

export default function Users() {
  const [users, setUsers] = useState<U[]>([]);
  const [form, setForm] = useState<{ username: string; name: string; password: string; role: string } | null>(null);
  const [resetFor, setResetFor] = useState<U | null>(null);
  const [newPw, setNewPw] = useState('');

  async function load() { setUsers(await api<U[]>('/users')); }
  useEffect(() => { load(); }, []);

  async function create() {
    if (!form) return;
    try {
      await api('/users', { method: 'POST', body: form });
      toast.success('สร้างผู้ใช้แล้ว');
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

  async function resetPassword() {
    if (!resetFor) return;
    if (newPw.length < 4) return toast.error('รหัสผ่านต้องมีอย่างน้อย 4 ตัวอักษร');
    try {
      await api(`/users/${resetFor.id}`, { method: 'PUT', body: { password: newPw } });
      toast.success(`รีเซ็ตรหัสผ่านของ ${resetFor.name} แล้ว`);
      setResetFor(null);
      setNewPw('');
    } catch (e) { toast.error((e as Error).message); }
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <PageHeader
        title="ระบบ / ผู้ใช้งาน"
        subtitle="จัดการพนักงานและสิทธิ์การใช้งาน"
        icon="👤"
        actions={<button className="btn-primary" onClick={() => setForm({ username: '', name: '', password: '', role: 'CASHIER' })}>+ เพิ่มผู้ใช้</button>}
      />

      <DataTable
        rows={users}
        colCount={5}
        empty="ยังไม่มีผู้ใช้"
        head={<tr><th className="px-4 py-3">ชื่อ</th><th className="px-4 py-3">ชื่อผู้ใช้</th><th className="px-4 py-3">สิทธิ์</th><th className="px-4 py-3">สถานะ</th><th /></tr>}
        renderRow={(u) => (
          <tr key={u.id} className="hover:bg-slate-50">
            <td className="px-4 py-3 font-semibold">{u.name}</td>
            <td className="px-4 py-3 text-slate-500">{u.username}</td>
            <td className="px-4 py-3"><span className="chip bg-brand-50 text-brand-700">{({ ADMIN: 'ผู้ดูแลระบบ', MANAGER: 'ผู้จัดการ', CASHIER: 'แคชเชียร์' } as Record<string, string>)[u.role] ?? u.role}</span></td>
            <td className="px-4 py-3"><span className={`chip ${u.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{u.isActive ? 'ใช้งาน' : 'ปิดใช้งาน'}</span></td>
            <td className="px-4 py-3 text-right whitespace-nowrap">
              <button className="text-sm font-semibold text-amber-600" onClick={() => { setResetFor(u); setNewPw(''); }}>รีเซ็ตรหัสผ่าน</button>
              <button className="ml-3 text-sm font-semibold text-brand-600" onClick={() => toggle(u)}>{u.isActive ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}</button>
            </td>
          </tr>
        )}
      />

      {form && (
        <Modal title="เพิ่มผู้ใช้" onClose={() => setForm(null)}>
          <div className="space-y-3">
            <div><label className="label">ชื่อ</label><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div><label className="label">ชื่อผู้ใช้</label><input className="input" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} /></div>
            <div><label className="label">รหัสผ่าน</label><input className="input" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>
            <div><label className="label">สิทธิ์การใช้งาน</label>
              <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                <option value="CASHIER">แคชเชียร์</option><option value="MANAGER">ผู้จัดการ</option><option value="ADMIN">ผู้ดูแลระบบ</option>
              </select>
            </div>
          </div>
          <div className="mt-5 flex gap-2"><button className="btn-ghost flex-1" onClick={() => setForm(null)}>ยกเลิก</button><button className="btn-primary flex-1" onClick={create}>สร้าง</button></div>
        </Modal>
      )}

      {resetFor && (
        <Modal title={`รีเซ็ตรหัสผ่าน · ${resetFor.name}`} onClose={() => setResetFor(null)}>
          <div><label className="label">รหัสผ่านใหม่</label><input className="input" type="text" autoFocus value={newPw} onChange={(e) => setNewPw(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && resetPassword()} placeholder="อย่างน้อย 4 ตัวอักษร" /></div>
          <p className="mt-2 text-xs text-slate-400">ผู้ใช้จะเข้าสู่ระบบด้วยรหัสผ่านนี้ และควรเปลี่ยนเองภายหลัง</p>
          <div className="mt-5 flex gap-2"><button className="btn-ghost flex-1" onClick={() => setResetFor(null)}>ยกเลิก</button><button className="btn-primary flex-1" disabled={newPw.length < 4} onClick={resetPassword}>รีเซ็ต</button></div>
        </Modal>
      )}
    </div>
  );
}
