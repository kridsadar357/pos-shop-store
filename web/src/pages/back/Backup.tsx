import { useRef, useState } from 'react';
import { api } from '../../api/client';
import { toast } from '../../components/Toast';

export default function Backup() {
  const [busy, setBusy] = useState<'export' | 'restore' | null>(null);
  const [pending, setPending] = useState<{ name: string; payload: any; rows: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function doExport() {
    setBusy('export');
    try {
      const snapshot = await api<{ data: Record<string, unknown[]>; exportedAt: string }>('/backup/export');
      const blob = new Blob([JSON.stringify(snapshot)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      a.href = url;
      a.download = `pos-backup-${stamp}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('ดาวน์โหลดไฟล์สำรองแล้ว');
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(null); }
  }

  function pickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const payload = JSON.parse(String(reader.result));
        if (!payload?.data) throw new Error('ไฟล์ไม่ถูกต้อง');
        const rows = Object.values(payload.data as Record<string, unknown[]>).reduce((s, r) => s + (Array.isArray(r) ? r.length : 0), 0);
        setPending({ name: file.name, payload, rows });
      } catch { toast.error('อ่านไฟล์สำรองไม่สำเร็จ'); }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  async function doRestore() {
    if (!pending) return;
    if (!confirm('การกู้คืนจะลบข้อมูลปัจจุบันทั้งหมดและแทนที่ด้วยไฟล์สำรอง — ดำเนินการต่อ?')) return;
    setBusy('restore');
    try {
      await api('/backup/restore', { method: 'POST', body: pending.payload });
      toast.success('กู้คืนข้อมูลสำเร็จ — กำลังโหลดใหม่');
      setPending(null);
      setTimeout(() => window.location.reload(), 1200);
    } catch (e) { toast.error((e as Error).message); setBusy(null); }
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <div>
        <h1 className="text-xl font-extrabold text-ink-900"><i className="fa-solid fa-database mr-2 text-brand-600" />สำรอง / กู้คืนข้อมูล</h1>
        <p className="text-sm text-slate-400">ดาวน์โหลดสำเนาข้อมูลทั้งหมดเป็นไฟล์ หรือกู้คืนจากไฟล์สำรอง</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-6">
          <div className="mb-2 grid h-11 w-11 place-items-center rounded-xl bg-emerald-50 text-emerald-600"><i className="fa-solid fa-cloud-arrow-down text-lg" /></div>
          <h2 className="text-lg font-bold">สำรองข้อมูล (Export)</h2>
          <p className="mt-1 text-sm text-slate-500">บันทึกสำเนาข้อมูลทั้งหมด (สินค้า ลูกค้า การขาย สต็อก การตั้งค่า ฯลฯ) เป็นไฟล์ JSON เก็บไว้อย่างปลอดภัย</p>
          <button className="btn-primary mt-4 w-full" disabled={busy !== null} onClick={doExport}>
            <i className="fa-solid fa-download mr-1.5" />{busy === 'export' ? 'กำลังเตรียมไฟล์…' : 'ดาวน์โหลดไฟล์สำรอง'}
          </button>
        </div>

        <div className="card p-6">
          <div className="mb-2 grid h-11 w-11 place-items-center rounded-xl bg-rose-50 text-rose-600"><i className="fa-solid fa-cloud-arrow-up text-lg" /></div>
          <h2 className="text-lg font-bold">กู้คืนข้อมูล (Restore)</h2>
          <p className="mt-1 text-sm text-rose-500"><i className="fa-solid fa-triangle-exclamation mr-1" />คำเตือน: การกู้คืนจะลบข้อมูลปัจจุบันทั้งหมดและแทนที่ด้วยไฟล์สำรอง</p>
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={pickFile} />
          {!pending ? (
            <button className="mt-4 w-full rounded-xl bg-slate-100 py-2.5 font-bold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-200" disabled={busy !== null} onClick={() => fileRef.current?.click()}>
              <i className="fa-solid fa-file-arrow-up mr-1.5" />เลือกไฟล์สำรอง…
            </button>
          ) : (
            <div className="mt-4 rounded-xl bg-slate-50 p-3 text-sm ring-1 ring-slate-200">
              <div className="font-semibold">{pending.name}</div>
              <div className="text-slate-500">{pending.rows.toLocaleString()} แถว · {Object.keys(pending.payload.data).length} ตาราง</div>
              <div className="mt-3 flex gap-2">
                <button className="btn-ghost flex-1" disabled={busy !== null} onClick={() => setPending(null)}>ยกเลิก</button>
                <button className="btn-danger flex-1" disabled={busy !== null} onClick={doRestore}>{busy === 'restore' ? 'กำลังกู้คืน…' : 'กู้คืนข้อมูล'}</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
