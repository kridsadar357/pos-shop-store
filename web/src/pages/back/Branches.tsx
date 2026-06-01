import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { Modal } from '../../components/Modal';
import { DataTable } from '../../components/DataTable';
import { ListToolbar } from '../../components/ListToolbar';
import { toast } from '../../components/Toast';
import { useBranch, type Branch } from '../../store/branch';

const empty = {
  code: '', name: '', address: '', phone: '', isActive: true, isDefault: false,
  promptPayId: '', promptPayType: '', printerType: '', printerAddress: '', printerPaper: '', receiptHeader: '', receiptFooter: '',
};
type Form = typeof empty;

export default function Branches() {
  const reloadStore = useBranch((s) => s.load);
  const [items, setItems] = useState<Branch[]>([]);
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<Branch | null>(null);
  const [form, setForm] = useState<Form | null>(null);

  async function load() { setItems(await api<Branch[]>('/branches')); }
  useEffect(() => { load(); }, []);

  function openNew() { setEditing(null); setForm({ ...empty }); }
  function openEdit(b: Branch) {
    setEditing(b);
    setForm({
      code: b.code, name: b.name, address: b.address, phone: b.phone, isActive: b.isActive, isDefault: b.isDefault,
      promptPayId: b.promptPayId ?? '', promptPayType: b.promptPayType ?? '', printerType: b.printerType ?? '',
      printerAddress: b.printerAddress ?? '', printerPaper: b.printerPaper ?? '', receiptHeader: b.receiptHeader ?? '', receiptFooter: b.receiptFooter ?? '',
    });
  }

  async function save() {
    if (!form) return;
    try {
      if (editing) await api(`/branches/${editing.id}`, { method: 'PUT', body: form });
      else await api('/branches', { method: 'POST', body: form });
      toast.success('บันทึกสาขาแล้ว');
      setForm(null);
      load();
      reloadStore();
    } catch (e) { toast.error((e as Error).message); }
  }

  const filtered = items.filter((b) => !q || b.name.includes(q) || b.code.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="flex h-full flex-col gap-4">
      <ListToolbar
        title="สาขา"
        subtitle="จัดการสาขา/สถานที่ — การขายและกะจะถูกบันทึกแยกตามสาขา"
        icon={<i className="fa-solid fa-code-branch" />}
        q={q} setQ={setQ} placeholder="ค้นหาชื่อ / รหัสสาขา…"
        primary={<button className="btn-primary" onClick={openNew}><i className="fa-solid fa-plus mr-1.5" />เพิ่มสาขา</button>}
      />

      <DataTable
        rows={filtered}
        colCount={5}
        empty="ยังไม่มีสาขา"
        head={<tr><th className="px-4 py-3">รหัส</th><th className="px-4 py-3">ชื่อสาขา</th><th className="px-4 py-3">ติดต่อ</th><th className="px-4 py-3">สถานะ</th><th /></tr>}
        renderRow={(b) => (
          <tr key={b.id} className="hover:bg-slate-50">
            <td className="px-4 py-3 font-mono text-xs text-slate-500">{b.code}</td>
            <td className="px-4 py-3 font-semibold">{b.name} {b.isDefault && <span className="chip ml-1 bg-brand-50 text-brand-700">สำนักงานใหญ่</span>}</td>
            <td className="px-4 py-3 text-slate-500">{b.phone || '—'}{b.address ? ` · ${b.address}` : ''}</td>
            <td className="px-4 py-3"><span className={`chip ${b.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{b.isActive ? 'ใช้งาน' : 'ปิด'}</span></td>
            <td className="px-4 py-3 text-right"><button className="text-sm font-semibold text-brand-600" onClick={() => openEdit(b)}>แก้ไข</button></td>
          </tr>
        )}
      />

      {form && (
        <Modal title={editing ? 'แก้ไขสาขา' : 'เพิ่มสาขา'} wide onClose={() => setForm(null)}>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">รหัสสาขา</label><input className="input font-mono" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="เช่น BR03" /></div>
              <div><label className="label">เบอร์โทร</label><input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            </div>
            <div><label className="label">ชื่อสาขา</label><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div><label className="label">ที่อยู่</label><input className="input" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-brand-600" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} /> ใช้งาน</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-brand-600" checked={form.isDefault} onChange={(e) => setForm({ ...form, isDefault: e.target.checked })} /> ตั้งเป็นสำนักงานใหญ่</label>
            </div>

            <div className="border-t border-slate-100 pt-3">
              <div className="mb-2 text-sm font-bold text-ink-900">การตั้งค่าเฉพาะสาขา <span className="font-normal text-slate-400">(เว้นว่าง = ใช้ค่าเริ่มต้นของระบบ)</span></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">พร้อมเพย์ (เฉพาะสาขา)</label><input className="input" value={form.promptPayId} onChange={(e) => setForm({ ...form, promptPayId: e.target.value })} placeholder="เว้นว่าง = ใช้ค่ากลาง" /></div>
                <div><label className="label">ประเภทพร้อมเพย์</label>
                  <select className="input" value={form.promptPayType} onChange={(e) => setForm({ ...form, promptPayType: e.target.value })}>
                    <option value="">— ใช้ค่ากลาง —</option><option value="MSISDN">เบอร์มือถือ</option><option value="NATID">เลขบัตร/ภาษี</option><option value="EWALLET">e-Wallet</option>
                  </select>
                </div>
                <div><label className="label">ชนิดเครื่องพิมพ์</label>
                  <select className="input" value={form.printerType} onChange={(e) => setForm({ ...form, printerType: e.target.value })}>
                    <option value="">— ใช้ค่ากลาง —</option><option value="BROWSER">เบราว์เซอร์</option><option value="ESCPOS_NET">ESC/POS เครือข่าย</option><option value="ESCPOS_USB">ESC/POS USB</option>
                  </select>
                </div>
                <div><label className="label">ที่อยู่เครื่องพิมพ์ (IP:Port)</label><input className="input" value={form.printerAddress} onChange={(e) => setForm({ ...form, printerAddress: e.target.value })} placeholder="192.168.1.50:9100" /></div>
                <div><label className="label">หัวใบเสร็จ (เฉพาะสาขา)</label><input className="input" value={form.receiptHeader} onChange={(e) => setForm({ ...form, receiptHeader: e.target.value })} /></div>
                <div><label className="label">ท้ายใบเสร็จ (เฉพาะสาขา)</label><input className="input" value={form.receiptFooter} onChange={(e) => setForm({ ...form, receiptFooter: e.target.value })} /></div>
              </div>
            </div>
          </div>
          <div className="mt-5 flex gap-2"><button className="btn-ghost flex-1" onClick={() => setForm(null)}>ยกเลิก</button><button className="btn-primary flex-1" disabled={!form.code || !form.name} onClick={save}>บันทึก</button></div>
        </Modal>
      )}
    </div>
  );
}
