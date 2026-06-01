import { useState } from 'react';
import { api } from '../api/client';
import { toast } from './Toast';

/** Self-service password change for the signed-in user (any role). */
export function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (next.length < 4) return toast.error('รหัสผ่านใหม่ต้องมีอย่างน้อย 4 ตัวอักษร');
    if (next !== confirm) return toast.error('รหัสผ่านใหม่ทั้งสองช่องไม่ตรงกัน');
    setBusy(true);
    try {
      await api('/auth/change-password', { method: 'POST', body: { currentPassword: current, newPassword: next } });
      toast.success('เปลี่ยนรหัสผ่านเรียบร้อย');
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/60 p-4" onClick={onClose}>
      <div className="card w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-xl font-bold"><i className="fa-solid fa-key mr-2 text-brand-600" />เปลี่ยนรหัสผ่าน</h3>
        <div className="mt-4 space-y-3">
          <div><label className="label">รหัสผ่านปัจจุบัน</label><input type="password" className="input" autoFocus value={current} onChange={(e) => setCurrent(e.target.value)} /></div>
          <div><label className="label">รหัสผ่านใหม่</label><input type="password" className="input" value={next} onChange={(e) => setNext(e.target.value)} /></div>
          <div><label className="label">ยืนยันรหัสผ่านใหม่</label><input type="password" className="input" value={confirm} onChange={(e) => setConfirm(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} /></div>
        </div>
        <div className="mt-5 flex gap-2">
          <button className="btn-ghost flex-1" onClick={onClose} disabled={busy}>ยกเลิก</button>
          <button className="btn-primary flex-1" disabled={busy || !current || !next} onClick={submit}>บันทึก</button>
        </div>
      </div>
    </div>
  );
}
