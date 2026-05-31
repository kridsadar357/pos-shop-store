import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { QRCanvas } from '../../components/QRCode';
import { PageHeader } from '../../components/ui';
import { toast } from '../../components/Toast';
import { num } from '../../lib/format';
import type { Setting } from '../../types';

export default function Settings() {
  const [s, setS] = useState<Setting | null>(null);
  const [preview, setPreview] = useState('');

  useEffect(() => { api<Setting>('/settings').then(setS); }, []);
  useEffect(() => {
    if (!s?.promptPayId) return setPreview('');
    api<{ payload: string }>('/settings/promptpay', { query: { amount: 100 } })
      .then((r) => setPreview(r.payload))
      .catch(() => setPreview(''));
  }, [s?.promptPayId, s?.promptPayType]);

  if (!s) return null;

  async function save() {
    if (!s) return;
    try {
      await api('/settings', {
        method: 'PUT',
        body: { ...s, taxRatePct: num(s.taxRatePct) },
      });
      toast.success('บันทึกการตั้งค่าแล้ว');
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const set = (patch: Partial<Setting>) => setS({ ...s, ...patch });

  return (
    <div className="max-w-4xl space-y-4">
      <PageHeader title="ตั้งค่า" subtitle="ข้อมูลร้าน ภาษี สมาชิก และการตั้งค่าพร้อมเพย์" icon="⚙" />

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <div className="card space-y-4 p-6">
          <div className="grid grid-cols-2 gap-3">
            <F label="ชื่อร้าน" className="col-span-2"><input className="input" value={s.storeName} onChange={(e) => set({ storeName: e.target.value })} /></F>
            <F label="เบอร์โทร"><input className="input" value={s.phone} onChange={(e) => set({ phone: e.target.value })} /></F>
            <F label="เลขผู้เสียภาษี"><input className="input" value={s.taxId} onChange={(e) => set({ taxId: e.target.value })} /></F>
            <F label="ที่อยู่" className="col-span-2"><input className="input" value={s.address} onChange={(e) => set({ address: e.target.value })} /></F>
          </div>

          <div className="border-t border-slate-100 pt-4">
            <h3 className="mb-3 font-bold">พร้อมเพย์ (การชำระแบบโอน)</h3>
            <div className="grid grid-cols-2 gap-3">
              <F label="หมายเลขพร้อมเพย์"><input className="input" placeholder="เบอร์มือถือ หรือ เลขบัตร/ภาษี" value={s.promptPayId} onChange={(e) => set({ promptPayId: e.target.value })} /></F>
              <F label="ประเภทหมายเลข">
                <select className="input" value={s.promptPayType} onChange={(e) => set({ promptPayType: e.target.value as Setting['promptPayType'] })}>
                  <option value="MSISDN">เบอร์มือถือ</option>
                  <option value="NATID">เลขบัตรประชาชน / ภาษี</option>
                  <option value="EWALLET">e-Wallet</option>
                </select>
              </F>
            </div>
          </div>

          <div className="border-t border-slate-100 pt-4">
            <h3 className="mb-3 font-bold">ภาษี</h3>
            <div className="grid grid-cols-2 gap-3">
              <F label="อัตราภาษี %"><input type="number" className="input" value={num(s.taxRatePct)} onChange={(e) => set({ taxRatePct: e.target.value as any })} /></F>
              <F label="รูปแบบภาษี">
                <select className="input" value={s.taxInclusive ? '1' : '0'} onChange={(e) => set({ taxInclusive: e.target.value === '1' })}>
                  <option value="1">รวมในราคา (ราคารวมภาษีแล้ว)</option>
                  <option value="0">แยกต่างหาก (บวกภาษีเพิ่ม)</option>
                </select>
              </F>
              <F label="ข้อความท้ายใบเสร็จ" className="col-span-2"><input className="input" value={s.receiptFooter} onChange={(e) => set({ receiptFooter: e.target.value })} /></F>
            </div>
          </div>

          <div className="border-t border-slate-100 pt-4">
            <h3 className="mb-3 font-bold">สมาชิก</h3>
            <label className="flex items-center justify-between rounded-xl bg-slate-50 p-4">
              <div>
                <div className="text-sm font-semibold">สมาชิกได้ราคาส่ง</div>
                <div className="text-xs text-slate-400">เมื่อเปิด การเลือกสมาชิกตอนชำระเงินจะใช้ราคาส่งกับทุกรายการ</div>
              </div>
              <input
                type="checkbox"
                className="h-5 w-5 accent-brand-600"
                checked={s.memberGetsWholesale}
                onChange={(e) => set({ memberGetsWholesale: e.target.checked })}
              />
            </label>
          </div>

          <button className="btn-primary w-full" onClick={save}>บันทึกการตั้งค่า</button>
        </div>

        <div className="card h-fit p-5 text-center">
          <h3 className="mb-3 font-bold">ตัวอย่าง QR พร้อมเพย์</h3>
          {preview ? (
            <>
              <div className="inline-block rounded-xl bg-white p-2 ring-1 ring-slate-200"><QRCanvas value={preview} size={200} /></div>
              <p className="mt-2 text-xs text-slate-500">ตัวอย่าง QR สำหรับ ฿100.00</p>
            </>
          ) : (
            <p className="py-10 text-sm text-slate-400">กรอกหมายเลขพร้อมเพย์เพื่อแสดงตัวอย่าง</p>
          )}
        </div>
      </div>
    </div>
  );
}

function F({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return <div className={className}><label className="label">{label}</label>{children}</div>;
}
