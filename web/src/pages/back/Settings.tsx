import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, uploadFile, resolveUrl } from '../../api/client';
import { QRCanvas } from '../../components/QRCode';
import { PageHeader } from '../../components/ui';
import { MANAGER_RESTRICTABLE_PAGES } from '../../components/BackLayout';
import { useAuth } from '../../store/auth';
import { toast } from '../../components/Toast';
import { money, num } from '../../lib/format';
import type { LicenseState, Setting } from '../../types';

type TabKey = 'general' | 'display' | 'printer' | 'email' | 'license' | 'manual';
const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: 'general', label: 'ทั่วไป', icon: 'fa-gear' },
  { key: 'display', label: 'จอแสดงลูกค้า', icon: 'fa-display' },
  { key: 'printer', label: 'เครื่องพิมพ์ & ใบเสร็จ', icon: 'fa-print' },
  { key: 'email', label: 'อีเมล (SMTP)', icon: 'fa-envelope' },
  { key: 'license', label: 'ไลเซนส์', icon: 'fa-key' },
  { key: 'manual', label: 'คู่มือใช้งาน', icon: 'fa-book-open' },
];

export default function Settings() {
  const [searchParams] = useSearchParams();
  const initialTab = (TABS.some((t) => t.key === searchParams.get('tab')) ? searchParams.get('tab') : 'general') as TabKey;
  const [s, setS] = useState<Setting | null>(null);
  const [tab, setTab] = useState<TabKey>(initialTab);

  useEffect(() => { api<Setting>('/settings').then(setS); }, []);
  if (!s) return null;

  const set = (patch: Partial<Setting>) => setS({ ...s, ...patch });
  async function save() {
    if (!s) return;
    try {
      await api('/settings', { method: 'PUT', body: { ...s, taxRatePct: num(s.taxRatePct), pointsEarnBaht: num(s.pointsEarnBaht), pointsRedeemValue: num(s.pointsRedeemValue), escposCodepage: Math.round(num(s.escposCodepage)), secondaryRate: num(s.secondaryRate) } });
      toast.success('บันทึกการตั้งค่าแล้ว');
    } catch (e) { toast.error((e as Error).message); }
  }

  return (
    <div className="space-y-5">
      <PageHeader title="ตั้งค่า" subtitle="ข้อมูลร้าน จอลูกค้า เครื่องพิมพ์ ไลเซนส์ และคู่มือการใช้งาน" icon={<i className="fa-solid fa-gear" />} />

      <div className="flex flex-wrap gap-1.5 border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 rounded-t-xl px-4 py-2.5 text-sm font-semibold transition ${
              tab === t.key ? 'bg-white text-brand-700 ring-1 ring-slate-200 ring-b-0 -mb-px' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <i className={`fa-solid ${t.icon}`} /> {t.label}
          </button>
        ))}
      </div>

      {tab === 'general' && <GeneralTab s={s} set={set} save={save} />}
      {tab === 'display' && <DisplayTab s={s} />}
      {tab === 'printer' && <PrinterTab s={s} set={set} save={save} setS={setS} />}
      {tab === 'email' && <EmailTab s={s} set={set} />}
      {tab === 'license' && <LicenseTab />}
      {tab === 'manual' && <ManualTab />}
    </div>
  );
}

/* ─────────────────────────── General ─────────────────────────── */
function GeneralTab({ s, set, save }: { s: Setting; set: (p: Partial<Setting>) => void; save: () => void }) {
  const [preview, setPreview] = useState('');
  useEffect(() => {
    if (!s.promptPayId) return setPreview('');
    api<{ payload: string }>('/settings/promptpay', { query: { amount: 100 } }).then((r) => setPreview(r.payload)).catch(() => setPreview(''));
  }, [s.promptPayId, s.promptPayType]);

  return (
    <div className="grid max-w-5xl gap-4 lg:grid-cols-[1fr_300px]">
      <div className="card space-y-4 p-6">
        <div className="grid grid-cols-2 gap-3">
          <F label="ชื่อร้าน" className="col-span-2"><input className="input" value={s.storeName} onChange={(e) => set({ storeName: e.target.value })} /></F>
          <F label="เบอร์โทร"><input className="input" value={s.phone} onChange={(e) => set({ phone: e.target.value })} /></F>
          <F label="เลขผู้เสียภาษี"><input className="input" value={s.taxId} onChange={(e) => set({ taxId: e.target.value })} /></F>
          <F label="ที่อยู่" className="col-span-2"><input className="input" value={s.address} onChange={(e) => set({ address: e.target.value })} /></F>
        </div>
        <Section title="พร้อมเพย์ (การชำระแบบโอน)">
          <div className="grid grid-cols-2 gap-3">
            <F label="หมายเลขพร้อมเพย์"><input className="input" placeholder="เบอร์มือถือ หรือ เลขบัตร/ภาษี" value={s.promptPayId} onChange={(e) => set({ promptPayId: e.target.value })} /></F>
            <F label="ประเภทหมายเลข">
              <select className="input" value={s.promptPayType} onChange={(e) => set({ promptPayType: e.target.value as Setting['promptPayType'] })}>
                <option value="MSISDN">เบอร์มือถือ</option><option value="NATID">เลขบัตรประชาชน / ภาษี</option><option value="EWALLET">e-Wallet</option>
              </select>
            </F>
          </div>
        </Section>
        <Section title="ภาษี">
          <div className="grid grid-cols-2 gap-3">
            <F label="อัตราภาษี %"><input type="number" className="input" value={num(s.taxRatePct)} onChange={(e) => set({ taxRatePct: e.target.value as any })} /></F>
            <F label="รูปแบบภาษี">
              <select className="input" value={s.taxInclusive ? '1' : '0'} onChange={(e) => set({ taxInclusive: e.target.value === '1' })}>
                <option value="1">รวมในราคา (ราคารวมภาษีแล้ว)</option><option value="0">แยกต่างหาก (บวกภาษีเพิ่ม)</option>
              </select>
            </F>
          </div>
        </Section>
        <Section title="สมาชิก">
          <label className="flex items-center justify-between rounded-xl bg-slate-50 p-4">
            <div>
              <div className="text-sm font-semibold">สมาชิกได้ราคาส่ง</div>
              <div className="text-xs text-slate-400">เมื่อเปิด การเลือกสมาชิกตอนชำระเงินจะใช้ราคาส่งกับทุกรายการ</div>
            </div>
            <input type="checkbox" className="h-5 w-5 accent-brand-600" checked={s.memberGetsWholesale} onChange={(e) => set({ memberGetsWholesale: e.target.checked })} />
          </label>
        </Section>
        <Section title="แต้มสะสม (Loyalty)">
          <label className="flex items-center justify-between rounded-xl bg-slate-50 p-4">
            <div>
              <div className="text-sm font-semibold">เปิดใช้แต้มสะสม</div>
              <div className="text-xs text-slate-400">สมาชิกจะได้รับแต้มจากยอดซื้อ และนำแต้มมาแลกเป็นส่วนลดได้ที่หน้าขาย</div>
            </div>
            <input type="checkbox" className="h-5 w-5 accent-brand-600" checked={s.loyaltyEnabled} onChange={(e) => set({ loyaltyEnabled: e.target.checked })} />
          </label>
          {s.loyaltyEnabled && (
            <div className="mt-3 grid grid-cols-2 gap-3">
              <F label="ยอดซื้อต่อ 1 แต้ม (บาท)"><input type="number" className="input" value={num(s.pointsEarnBaht)} onChange={(e) => set({ pointsEarnBaht: e.target.value as any })} /></F>
              <F label="มูลค่า 1 แต้มเมื่อแลก (บาท)"><input type="number" className="input" value={num(s.pointsRedeemValue)} onChange={(e) => set({ pointsRedeemValue: e.target.value as any })} /></F>
              <p className="col-span-2 text-xs text-slate-400">
                <i className="fa-solid fa-circle-info mr-1" />
                ตัวอย่าง: ซื้อครบ {num(s.pointsEarnBaht) || 0} บาท ได้ 1 แต้ม · ใช้ 1 แต้มแทนเงิน {num(s.pointsRedeemValue) || 0} บาท
              </p>
            </div>
          )}
        </Section>
        <Section title="สกุลเงินที่สอง (แสดงผลโดยประมาณ)">
          <p className="mb-2 text-xs text-slate-400">แสดงยอดเงินโดยประมาณในอีกสกุลที่หน้าขายและใบเสร็จ (เหมาะกับร้านที่มีนักท่องเที่ยว) — ใช้แสดงผลเท่านั้น ไม่กระทบการบันทึกบัญชี</p>
          <div className="grid grid-cols-2 gap-3">
            <F label="สกุลเงิน (เว้นว่าง = ปิด)"><input className="input" placeholder="เช่น USD" value={s.secondaryCurrency} onChange={(e) => set({ secondaryCurrency: e.target.value.toUpperCase().slice(0, 4) })} /></F>
            <F label={`อัตรา (บาท ต่อ 1 ${s.secondaryCurrency || 'หน่วย'})`}><input type="number" className="input" value={num(s.secondaryRate) || ''} onChange={(e) => set({ secondaryRate: e.target.value as any })} /></F>
          </div>
          {s.secondaryCurrency && num(s.secondaryRate) > 0 && (
            <p className="mt-2 text-xs text-slate-400"><i className="fa-solid fa-circle-info mr-1" />ตัวอย่าง: 1,000 บาท ≈ {s.secondaryCurrency} {(1000 / num(s.secondaryRate)).toFixed(2)}</p>
          )}
        </Section>
        <ManagerPermissions s={s} set={set} />
        <button className="btn-primary w-full" onClick={save}>บันทึกการตั้งค่า</button>
      </div>
      <div className="card h-fit p-5 text-center">
        <h3 className="mb-3 font-bold">ตัวอย่าง QR พร้อมเพย์</h3>
        {preview ? (
          <><div className="inline-block rounded-xl bg-white p-2 ring-1 ring-slate-200"><QRCanvas value={preview} size={200} /></div><p className="mt-2 text-xs text-slate-500">ตัวอย่าง QR สำหรับ ฿100.00</p></>
        ) : <p className="py-10 text-sm text-slate-400">กรอกหมายเลขพร้อมเพย์เพื่อแสดงตัวอย่าง</p>}
      </div>
    </div>
  );
}

/* ─────────────────────── Customer Display ─────────────────────── */
function DisplayTab({ s }: { s: Setting }) {
  const [ips, setIps] = useState<string[]>([]);
  const [ip, setIp] = useState('');
  useEffect(() => {
    api<{ lanIps: string[] }>('/settings/network').then((r) => { setIps(r.lanIps); setIp(r.lanIps[0] || window.location.hostname); }).catch(() => setIp(window.location.hostname));
  }, []);

  const loc = window.location;
  const port = loc.port || (loc.protocol === 'https:' ? '443' : '80');
  const host = ip || loc.hostname;
  const displayUrl = `${loc.protocol}//${host}:${port}/display`;

  return (
    <div className="grid max-w-5xl gap-4 lg:grid-cols-[320px_1fr]">
      <div className="card flex flex-col items-center p-6 text-center">
        <h3 className="mb-1 font-bold">เปิดจอแสดงผลลูกค้า</h3>
        <p className="mb-4 text-xs text-slate-400">สแกนเพื่อเปิดบนแท็บเล็ต / จอที่สอง</p>
        <div className="rounded-2xl bg-white p-3 ring-1 ring-slate-200"><QRCanvas value={displayUrl} size={210} /></div>
        <code className="mt-4 block w-full break-all rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600 ring-1 ring-slate-200">{displayUrl}</code>
        <div className="mt-3 flex w-full gap-2">
          <button className="btn-ghost flex-1" onClick={() => { navigator.clipboard?.writeText(displayUrl); toast.success('คัดลอกลิงก์แล้ว'); }}><i className="fa-solid fa-copy mr-1.5" />คัดลอก</button>
          <button className="btn-primary flex-1" onClick={() => window.open('/display', 'pos-display', 'width=1280,height=800')}><i className="fa-solid fa-up-right-from-square mr-1.5" />เปิดจอ</button>
        </div>
      </div>

      <div className="card space-y-4 p-6">
        <Section title="ที่อยู่เครือข่าย (IP & Port)" first>
          <div className="grid grid-cols-2 gap-3">
            <F label="IP เครื่องเซิร์ฟเวอร์ (LAN)">
              {ips.length > 1 ? (
                <select className="input" value={ip} onChange={(e) => setIp(e.target.value)}>{ips.map((x) => <option key={x} value={x}>{x}</option>)}</select>
              ) : <input className="input" value={ip} onChange={(e) => setIp(e.target.value)} />}
            </F>
            <F label="พอร์ต"><input className="input bg-slate-50" value={port} readOnly /></F>
          </div>
          {!ips.length && <p className="text-xs text-amber-600">ไม่พบ IP ภายในเครือข่าย — ใช้ชื่อโฮสต์แทน</p>}
        </Section>

        <Section title="วิธีเชื่อมต่อจอแสดงผล">
          <ul className="space-y-2.5 text-sm text-slate-600">
            <Bullet icon="fa-tablet-screen-button" title="แท็บเล็ต / มือถือ (PWA)">เปิดเบราว์เซอร์ไปที่ลิงก์ด้านซ้าย แล้วเลือก “เพิ่มไปยังหน้าจอหลัก” เพื่อใช้งานแบบเต็มจอเหมือนแอป</Bullet>
            <Bullet icon="fa-display" title="จอที่สอง (Extended Screen)">ลากหน้าต่าง “เปิดจอ” ไปยังจอที่สองแล้วกดเต็มจอ (F11) — อัปเดตเรียลไทม์ผ่าน WebSocket</Bullet>
            <Bullet icon="fa-microchip" title="อุปกรณ์ IoT / ฝังตัว">อุปกรณ์ที่มีเบราว์เซอร์ในเครือข่ายเดียวกันเปิด URL นี้ได้ทันที (รองรับ kiosk mode)</Bullet>
          </ul>
        </Section>
        <div className="rounded-xl bg-brand-50 p-3 text-xs text-brand-700 ring-1 ring-brand-100"><i className="fa-solid fa-circle-info mr-1.5" />จอแสดงผลจะโชว์สรุปยอด รายการสินค้า และ QR พร้อมเพย์ พร้อมจำนวนเงินแบบเรียลไทม์ขณะคิดเงิน</div>
      </div>
    </div>
  );
}

/* ─────────────────────── Printer & Receipt ────────────────────── */
function PrinterTab({ s, set, save, setS }: { s: Setting; set: (p: Partial<Setting>) => void; save: () => void; setS: (s: Setting) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  async function uploadLogo(file: File) {
    try { const updated = await uploadFile<Setting>('/settings/logo', 'image', file); setS(updated); toast.success('อัปโหลดโลโก้แล้ว'); }
    catch (e) { toast.error((e as Error).message); }
  }
  return (
    <div className="grid max-w-5xl gap-4 lg:grid-cols-[1fr_300px]">
      <div className="card space-y-4 p-6">
        <Section title="การเชื่อมต่อเครื่องพิมพ์" first>
          <div className="grid grid-cols-2 gap-3">
            <F label="ชนิดเครื่องพิมพ์">
              <select className="input" value={s.printerType} onChange={(e) => set({ printerType: e.target.value as Setting['printerType'] })}>
                <option value="BROWSER">เบราว์เซอร์ (พิมพ์ผ่านหน้าจอ)</option>
                <option value="ESCPOS_NET">ESC/POS — เครือข่าย (LAN)</option>
                <option value="ESCPOS_USB">ESC/POS — USB</option>
              </select>
            </F>
            <F label="ขนาดกระดาษ">
              <select className="input" value={s.printerPaper} onChange={(e) => set({ printerPaper: e.target.value as Setting['printerPaper'] })}>
                <option value="80mm">80 มม.</option><option value="58mm">58 มม.</option>
              </select>
            </F>
            {s.printerType === 'ESCPOS_NET' && (
              <>
                <F label="ที่อยู่เครื่องพิมพ์ (IP:Port)" className="col-span-2"><input className="input" placeholder="192.168.1.50:9100" value={s.printerAddress} onChange={(e) => set({ printerAddress: e.target.value })} /></F>
                <F label="รหัสหน้าอักษรไทย (ESC t)"><input type="number" className="input" value={s.escposCodepage} onChange={(e) => set({ escposCodepage: Number(e.target.value) })} /></F>
                <label className="col-span-2 flex items-center justify-between rounded-xl bg-slate-50 p-3">
                  <span><span className="text-sm font-semibold">เปิดลิ้นชักเมื่อรับเงินสด</span><span className="block text-xs text-slate-400">ส่งสัญญาณเปิดลิ้นชักตอนพิมพ์ใบเสร็จเงินสด</span></span>
                  <input type="checkbox" className="h-5 w-5 accent-brand-600" checked={s.openDrawerOnCash} onChange={(e) => set({ openDrawerOnCash: e.target.checked })} />
                </label>
              </>
            )}
          </div>
          <p className="mt-2 text-xs text-slate-400">โหมดเบราว์เซอร์ใช้กล่องพิมพ์ของระบบ (เลือกเครื่องพิมพ์/บันทึก PDF ได้) — เหมาะกับเครื่องพิมพ์ความร้อนที่ติดตั้งไดรเวอร์แล้ว · โหมดเครือข่ายส่งคำสั่ง ESC/POS ไปยังเครื่องพิมพ์โดยตรง (พอร์ต 9100). รหัสหน้าอักษรไทยขึ้นกับรุ่นเครื่องพิมพ์ (ค่าทั่วไป 21 สำหรับ TIS-620)</p>
          {s.printerType === 'ESCPOS_NET' && (
            <div className="mt-3 flex gap-2">
              <button className="btn-ghost" onClick={async () => {
                try { await api('/print/test', { method: 'POST' }); toast.success('ส่งใบทดสอบไปยังเครื่องพิมพ์แล้ว'); }
                catch (e) { toast.error((e as Error).message); }
              }}><i className="fa-solid fa-vial mr-1.5" />พิมพ์ใบทดสอบ</button>
              <button className="btn-ghost" onClick={async () => {
                try { await api('/print/drawer', { method: 'POST' }); toast.success('ส่งคำสั่งเปิดลิ้นชักแล้ว'); }
                catch (e) { toast.error((e as Error).message); }
              }}><i className="fa-solid fa-cash-register mr-1.5" />ทดสอบเปิดลิ้นชัก</button>
            </div>
          )}
        </Section>

        <Section title="จอแสดงผลลูกค้า (VFD)">
          <label className="flex items-center justify-between rounded-xl bg-slate-50 p-3">
            <span><span className="text-sm font-semibold">เปิดใช้งานจอแสดงผลลูกค้า (VFD)</span><span className="block text-xs text-slate-400">จอ 2 บรรทัด 20 ตัวอักษร (CD5220) แสดงรายการ/ยอดรวมให้ลูกค้าเห็น</span></span>
            <input type="checkbox" className="h-5 w-5 accent-brand-600" checked={s.vfdEnabled} onChange={(e) => set({ vfdEnabled: e.target.checked })} />
          </label>
          {s.vfdEnabled && (
            <div className="mt-3 space-y-3">
              <F label="ที่อยู่จอแสดงผล (IP:Port)"><input className="input" placeholder="192.168.1.60:9100" value={s.vfdAddress} onChange={(e) => set({ vfdAddress: e.target.value })} /></F>
              <p className="text-xs text-slate-400">จอ VFD ส่วนใหญ่เชื่อมต่อผ่านสายอนุกรม (serial) — ใช้ตัวแปลง serial-to-LAN หรือพอร์ตต่อพ่วงของเครื่องพิมพ์ (พอร์ต 9100). จอแสดงผลรองรับอักษรอังกฤษ/ตัวเลขเท่านั้น (อักษรไทยจะไม่แสดง)</p>
              <button className="btn-ghost" onClick={async () => {
                try { await api('/vfd/test', { method: 'POST' }); toast.success('ส่งข้อความทดสอบไปยังจอแสดงผลแล้ว'); }
                catch (e) { toast.error((e as Error).message); }
              }}><i className="fa-solid fa-vial mr-1.5" />ทดสอบจอแสดงผล</button>
            </div>
          )}
        </Section>

        <Section title="ออกแบบใบเสร็จ">
          <div className="space-y-3">
            <F label="โลโก้ร้าน">
              <div className="flex items-center gap-3">
                <div className="grid h-16 w-16 place-items-center overflow-hidden rounded-xl bg-slate-50 ring-1 ring-slate-200">
                  {s.receiptLogoUrl ? <img src={resolveUrl(s.receiptLogoUrl)} alt="logo" className="h-full w-full object-contain" /> : <i className="fa-solid fa-image text-slate-300" />}
                </div>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && uploadLogo(e.target.files[0])} />
                <button type="button" className="btn-ghost" onClick={() => fileRef.current?.click()}><i className="fa-solid fa-upload mr-1.5" />อัปโหลดโลโก้</button>
                {s.receiptLogoUrl && <button type="button" className="text-sm font-semibold text-rose-600" onClick={() => set({ receiptLogoUrl: null })}>ลบ</button>}
              </div>
            </F>
            <F label="ข้อความหัวใบเสร็จ (Header)"><textarea className="input" rows={2} placeholder="เช่น สาขาสุขุมวิท · ใบเสร็จรับเงิน/ใบกำกับภาษีอย่างย่อ" value={s.receiptHeader} onChange={(e) => set({ receiptHeader: e.target.value })} /></F>
            <F label="ข้อความท้ายใบเสร็จ (Footer)"><textarea className="input" rows={2} value={s.receiptFooter} onChange={(e) => set({ receiptFooter: e.target.value })} /></F>
            <label className="flex items-center justify-between rounded-xl bg-slate-50 p-3">
              <div><div className="text-sm font-semibold">แสดง QR พร้อมเพย์ท้ายใบเสร็จ</div><div className="text-xs text-slate-400">พิมพ์ QR พร้อมยอดเงินของบิลให้ลูกค้าสแกนจ่าย</div></div>
              <input type="checkbox" className="h-5 w-5 accent-brand-600" checked={s.receiptShowQR} onChange={(e) => set({ receiptShowQR: e.target.checked })} />
            </label>
          </div>
        </Section>
        <button className="btn-primary w-full" onClick={save}>บันทึกการตั้งค่า</button>
      </div>

      {/* Live mini receipt preview */}
      <div className="card h-fit p-5">
        <h3 className="mb-3 text-center font-bold">ตัวอย่างใบเสร็จ</h3>
        <div className="mx-auto w-[260px] rounded-lg bg-white p-4 font-mono text-[11px] leading-relaxed text-slate-700 shadow-card ring-1 ring-slate-200">
          <div className="text-center">
            {s.receiptLogoUrl && <img src={resolveUrl(s.receiptLogoUrl)} alt="" className="mx-auto mb-1 h-10 object-contain" />}
            <div className="text-sm font-bold">{s.storeName || 'ชื่อร้าน'}</div>
            {s.address && <div>{s.address}</div>}
            {s.phone && <div>โทร. {s.phone}</div>}
            {s.receiptHeader && <div className="mt-1 whitespace-pre-line">{s.receiptHeader}</div>}
          </div>
          <Dashed /><div className="flex justify-between"><span>สินค้า A x2</span><span>50.00</span></div>
          <div className="flex justify-between"><span>สินค้า B x1</span><span>30.00</span></div>
          <Dashed /><div className="flex justify-between font-bold"><span>ยอดสุทธิ</span><span>{money(80)}</span></div>
          <Dashed />
          {s.receiptShowQR && s.promptPayId && <div className="my-2 flex flex-col items-center"><QRCanvas value={`demo-${s.promptPayId}`} size={92} /><span className="mt-1 text-[10px]">PromptPay ฿80.00</span></div>}
          <div className="mt-1 text-center">{s.receiptFooter || 'ขอบคุณที่ใช้บริการ'}</div>
        </div>
        <p className="mt-2 text-center text-[11px] text-slate-400">กระดาษ {s.printerPaper}</p>
      </div>
    </div>
  );
}

/* ─────────────────────────── Email (SMTP) ────────────────────── */
function EmailTab({ s, set }: { s: Setting; set: (p: Partial<Setting>) => void }) {
  const [pass, setPass] = useState('');
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState(false);
  const [smsKey, setSmsKey] = useState('');
  const [smsTo, setSmsTo] = useState('');

  async function saveSms() {
    setBusy(true);
    try {
      const body: Record<string, unknown> = { smsApiUrl: s.smsApiUrl, smsSender: s.smsSender };
      if (smsKey.trim()) body.smsApiKey = smsKey.trim();
      const updated = await api<Setting>('/settings', { method: 'PUT', body });
      set({ smsApiKeySet: updated.smsApiKeySet });
      setSmsKey('');
      toast.success('บันทึกการตั้งค่า SMS แล้ว');
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }
  async function sendSmsTest() {
    if (!smsTo.trim()) return toast.error('กรอกเบอร์ผู้รับสำหรับทดสอบ');
    setBusy(true);
    try { await api('/settings/sms-test', { method: 'POST', body: { to: smsTo.trim() } }); toast.success(`ส่ง SMS ทดสอบไปยัง ${smsTo.trim()} แล้ว`); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }

  async function saveEmail() {
    setBusy(true);
    try {
      const body: Record<string, unknown> = {
        smtpHost: s.smtpHost, smtpPort: num(s.smtpPort) || 587, smtpSecure: s.smtpSecure,
        smtpUser: s.smtpUser, smtpFrom: s.smtpFrom,
        reportEmailEnabled: s.reportEmailEnabled, reportEmailTo: s.reportEmailTo,
        reportEmailHour: Math.round(num(s.reportEmailHour)),
      };
      if (pass.trim()) body.smtpPass = pass.trim();
      const updated = await api<Setting>('/settings', { method: 'PUT', body });
      set({ smtpPassSet: updated.smtpPassSet });
      setPass('');
      toast.success('บันทึกการตั้งค่าอีเมลแล้ว');
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }
  async function sendTest() {
    if (!to.trim()) return toast.error('กรอกอีเมลผู้รับสำหรับทดสอบ');
    setBusy(true);
    try { await api('/settings/email-test', { method: 'POST', body: { to: to.trim() } }); toast.success(`ส่งอีเมลทดสอบไปยัง ${to.trim()} แล้ว`); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }
  async function sendReportNow() {
    setBusy(true);
    try { const r = await api<{ to: string }>('/reports/email-daily', { method: 'POST', body: {} }); toast.success(`ส่งสรุปยอดขายวันนี้ไปยัง ${r.to} แล้ว`); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <div className="card max-w-2xl space-y-4 p-6">
      <Section title="เซิร์ฟเวอร์อีเมลขาออก (SMTP)" first>
        <p className="mb-3 text-xs text-slate-400"><i className="fa-solid fa-circle-info mr-1" />ใช้สำหรับส่งใบเสร็จทางอีเมลให้ลูกค้า เว้นว่าง “โฮสต์” เพื่อปิดการส่งอีเมล (เช่น Gmail ใช้ smtp.gmail.com พอร์ต 587 และรหัสผ่านแอป)</p>
        <div className="grid grid-cols-2 gap-3">
          <F label="โฮสต์ SMTP" className="col-span-2"><input className="input" placeholder="smtp.gmail.com" value={s.smtpHost} onChange={(e) => set({ smtpHost: e.target.value })} /></F>
          <F label="พอร์ต"><input type="number" className="input" value={s.smtpPort || ''} onChange={(e) => set({ smtpPort: Number(e.target.value) })} /></F>
          <F label="การเข้ารหัส">
            <select className="input" value={s.smtpSecure ? '1' : '0'} onChange={(e) => set({ smtpSecure: e.target.value === '1' })}>
              <option value="0">STARTTLS (พอร์ต 587)</option>
              <option value="1">SSL/TLS (พอร์ต 465)</option>
            </select>
          </F>
          <F label="ชื่อผู้ใช้ (อีเมล)" className="col-span-2"><input className="input" placeholder="you@gmail.com" value={s.smtpUser} onChange={(e) => set({ smtpUser: e.target.value })} /></F>
          <F label={`รหัสผ่าน${s.smtpPassSet ? ' (ตั้งไว้แล้ว — เว้นว่างเพื่อคงเดิม)' : ''}`} className="col-span-2">
            <input type="password" className="input" placeholder={s.smtpPassSet ? '••••••••' : 'รหัสผ่าน / App password'} value={pass} onChange={(e) => setPass(e.target.value)} autoComplete="new-password" />
          </F>
          <F label="ชื่อผู้ส่ง (From) — เว้นว่างเพื่อใช้ชื่อร้าน" className="col-span-2"><input className="input" placeholder={`${s.storeName} <${s.smtpUser || 'you@example.com'}>`} value={s.smtpFrom} onChange={(e) => set({ smtpFrom: e.target.value })} /></F>
        </div>
        <button className="btn-primary mt-4 w-full" onClick={saveEmail} disabled={busy}>บันทึกการตั้งค่าอีเมล</button>
      </Section>

      <Section title="ทดสอบการส่ง">
        <div className="flex items-end gap-2">
          <F label="ส่งอีเมลทดสอบไปยัง" className="flex-1"><input type="email" className="input" placeholder="customer@example.com" value={to} onChange={(e) => setTo(e.target.value)} /></F>
          <button className="btn-ghost" onClick={sendTest} disabled={busy}><i className="fa-solid fa-paper-plane mr-1.5" />ส่งทดสอบ</button>
        </div>
        <p className="mt-2 text-xs text-slate-400">บันทึกการตั้งค่าก่อนทดสอบ การส่งจะใช้ค่าที่บันทึกไว้ในระบบ</p>
      </Section>

      <Section title="เกตเวย์ SMS (ส่งใบเสร็จทาง SMS)">
        <p className="mb-3 text-xs text-slate-400"><i className="fa-solid fa-circle-info mr-1" />ระบบจะ POST JSON {`{ to, message, sender }`} ไปยัง URL ที่ตั้งไว้ (ชี้ไปยังผู้ให้บริการ SMS หรือตัวกลางของคุณ) เว้นว่าง URL เพื่อปิด การส่งใบเสร็จทาง SMS จะใช้เบอร์ของสมาชิกโดยอัตโนมัติ</p>
        <div className="grid grid-cols-2 gap-3">
          <F label="URL เกตเวย์ SMS" className="col-span-2"><input className="input" placeholder="https://sms.example.com/send" value={s.smsApiUrl} onChange={(e) => set({ smsApiUrl: e.target.value })} /></F>
          <F label={`API Key${s.smsApiKeySet ? ' (ตั้งไว้แล้ว — เว้นว่างเพื่อคงเดิม)' : ' (ส่งเป็น Bearer token)'}`}>
            <input type="password" className="input" placeholder={s.smsApiKeySet ? '••••••••' : 'optional'} value={smsKey} onChange={(e) => setSmsKey(e.target.value)} autoComplete="new-password" />
          </F>
          <F label="ชื่อผู้ส่ง (Sender ID)"><input className="input" placeholder="MyShop" value={s.smsSender} onChange={(e) => set({ smsSender: e.target.value })} /></F>
        </div>
        <button className="btn-primary mt-4 w-full" onClick={saveSms} disabled={busy}>บันทึกการตั้งค่า SMS</button>
        <div className="mt-3 flex items-end gap-2">
          <F label="ส่ง SMS ทดสอบไปยังเบอร์" className="flex-1"><input className="input" placeholder="0812345678" value={smsTo} onChange={(e) => setSmsTo(e.target.value)} /></F>
          <button className="btn-ghost" onClick={sendSmsTest} disabled={busy}><i className="fa-solid fa-comment-sms mr-1.5" />ส่งทดสอบ</button>
        </div>
      </Section>

      <Section title="สรุปยอดขายประจำวันอัตโนมัติ">
        <label className="flex items-center justify-between rounded-xl bg-slate-50 p-3">
          <div><div className="text-sm font-semibold">ส่งสรุปยอดขายทางอีเมลทุกวัน</div><div className="text-xs text-slate-400">ระบบจะส่งสรุปยอดขายของวันก่อนหน้าให้อัตโนมัติตามเวลาที่กำหนด</div></div>
          <input type="checkbox" className="h-5 w-5 accent-brand-600" checked={s.reportEmailEnabled} onChange={(e) => set({ reportEmailEnabled: e.target.checked })} />
        </label>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <F label="อีเมลผู้รับรายงาน" className="col-span-2"><input type="email" className="input" placeholder="owner@example.com" value={s.reportEmailTo} onChange={(e) => set({ reportEmailTo: e.target.value })} /></F>
          <F label="เวลาส่ง (ชั่วโมง 0–23)"><input type="number" min={0} max={23} className="input" value={s.reportEmailHour} onChange={(e) => set({ reportEmailHour: Number(e.target.value) })} /></F>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <button className="btn-primary" onClick={saveEmail} disabled={busy}>บันทึก</button>
          <button className="btn-ghost" onClick={sendReportNow} disabled={busy}><i className="fa-solid fa-chart-line mr-1.5" />ส่งสรุปวันนี้เลย</button>
        </div>
      </Section>
    </div>
  );
}

/* ───────────────────────────── License ───────────────────────── */
function LicenseTab() {
  const [lic, setLic] = useState<LicenseState | null>(null);
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() { setLic(await api<LicenseState>('/license/status')); }
  useEffect(() => { load(); }, []);

  async function activate() {
    if (!key.trim()) return;
    setBusy(true);
    try { await api('/license/activate', { method: 'POST', body: { key: key.trim() } }); toast.success('เปิดใช้งานไลเซนส์สำเร็จ'); setKey(''); load(); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }
  async function startDemo() {
    setBusy(true);
    try { await api('/license/demo', { method: 'POST' }); toast.success('เริ่มทดลองใช้แล้ว'); load(); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }
  async function revalidate() {
    setBusy(true);
    try { const r = await api<{ message: string }>('/license/revalidate', { method: 'POST' }); toast.success(r.message); load(); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }

  const STATUS: Record<string, { label: string; cls: string; icon: string }> = {
    ACTIVE: { label: 'เปิดใช้งานเต็มรูปแบบ', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200', icon: 'fa-circle-check' },
    DEMO: { label: 'กำลังทดลองใช้', cls: 'bg-amber-50 text-amber-700 ring-amber-200', icon: 'fa-hourglass-half' },
    EXPIRED: { label: 'หมดอายุแล้ว', cls: 'bg-rose-50 text-rose-700 ring-rose-200', icon: 'fa-circle-xmark' },
    INACTIVE: { label: 'ยังไม่เปิดใช้งาน', cls: 'bg-slate-100 text-slate-600 ring-slate-200', icon: 'fa-circle-minus' },
  };
  const st = lic ? STATUS[lic.status] : STATUS.INACTIVE;

  return (
    <div className="grid max-w-5xl gap-4 lg:grid-cols-2">
      <div className="card space-y-4 p-6">
        <div className={`flex items-center gap-3 rounded-xl p-4 ring-1 ${st.cls}`}>
          <i className={`fa-solid ${st.icon} text-2xl`} />
          <div>
            <div className="font-bold">{st.label}</div>
            {lic && (lic.status === 'DEMO' || lic.status === 'ACTIVE') && lic.expiresAt && (
              <div className="text-xs">เหลือ {lic.daysLeft} วัน · หมดอายุ {new Date(lic.expiresAt).toLocaleDateString('th-TH')}</div>
            )}
            {lic?.plan && <div className="text-xs opacity-80">{lic.plan}</div>}
          </div>
        </div>

        {lic?.status === 'ACTIVE' && (
          <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-2.5 text-sm ring-1 ring-slate-200">
            <span className={lic.needsRevalidation ? 'font-semibold text-amber-600' : 'text-slate-500'}>
              <i className="fa-solid fa-rotate mr-1.5" />
              {lic.needsRevalidation ? `ควรตรวจสอบไลเซนส์ออนไลน์อีกครั้ง (ผ่านมา ${lic.daysSinceCheck} วัน)` : 'ไลเซนส์ได้รับการตรวจสอบล่าสุดแล้ว'}
            </span>
            <button className="btn-ghost py-1" disabled={busy} onClick={revalidate}>ตรวจสอบอีกครั้ง</button>
          </div>
        )}

        <Section title="เปิดใช้งานด้วยรหัสไลเซนส์" first>
          <div className="flex gap-2">
            <input className="input font-mono" placeholder="21F3-D415-5156-6B1D" value={key} onChange={(e) => setKey(e.target.value)} />
            <button className="btn-primary whitespace-nowrap" disabled={busy || !key.trim()} onClick={activate}>{busy ? '…' : 'เปิดใช้งาน'}</button>
          </div>
          <p className="mt-2 break-all text-[11px] text-slate-400">ตรวจสอบผ่าน: https://ttmb-tech.com/license/api.php?product_id=&lt;KEY&gt;&amp;action=verify</p>
        </Section>

        {lic && lic.status === 'INACTIVE' && (
          <Section title="ยังไม่มีรหัส?">
            <button className="btn-ghost w-full" disabled={busy} onClick={startDemo}><i className="fa-solid fa-gift mr-1.5" />เริ่มทดลองใช้ฟรี {lic.demoDays} วัน</button>
          </Section>
        )}
      </div>

      <div className="card space-y-3 p-6 text-sm text-slate-600">
        <h3 className="font-bold text-ink-900">ไลเซนส์ครอบคลุมอะไรบ้าง</h3>
        <Feature ok>ใช้งานทุกฟีเจอร์: POS, สต็อก, สมาชิก, โปรโมชั่น, รายงาน</Feature>
        <Feature ok>อัปเดตเวอร์ชันและความปลอดภัย</Feature>
        <Feature ok>จอแสดงผลลูกค้า และการพิมพ์ใบเสร็จ</Feature>
        <Feature>เวอร์ชันทดลองใช้งานได้ครบ {lic?.demoDays ?? 14} วัน หลังจากนั้นต้องเปิดใช้งานด้วยรหัส</Feature>
        <div className="rounded-xl bg-slate-50 p-3 text-xs">ติดต่อขอรหัสไลเซนส์ได้ที่ผู้จำหน่ายระบบ (TTMB-Tech)</div>
      </div>
    </div>
  );
}

/* ───────────────────────────── Manual ────────────────────────── */
function ManualTab() {
  const items: { icon: string; title: string; body: string }[] = [
    { icon: 'fa-right-to-bracket', title: '1. เข้าสู่ระบบ & เปิดกะ', body: 'ล็อกอินด้วยบัญชีของคุณ จากนั้นที่หน้าขาย (POS) กด “เปิดกะ” พร้อมใส่เงินตั้งต้นในลิ้นชัก เพื่อเริ่มรับชำระเงิน' },
    { icon: 'fa-barcode', title: '2. ขายสินค้า', body: 'สแกนบาร์โค้ดได้ทันที (ระบบโฟกัสช่องสแกนอัตโนมัติ) หรือกดที่การ์ดสินค้าเพื่อเพิ่มลงตะกร้า · ปุ่ม “เช็คราคา” ดูราคาปลีก/ส่งโดยไม่เพิ่มลงตะกร้า' },
    { icon: 'fa-user-tag', title: '3. สมาชิก & ราคาส่ง', body: 'เลือกสมาชิกก่อนชำระเงินเพื่อรับราคาส่งอัตโนมัติ (ตั้งค่าได้ที่แท็บทั่วไป) และโปรโมชั่นจะถูกคำนวณให้เอง' },
    { icon: 'fa-money-bill-wave', title: '4. รับชำระเงิน', body: 'เลือกเงินสด (กรอกเงินรับ ระบบทอนให้) หรือโอน/พร้อมเพย์ (แสดง QR พร้อมยอด) จอลูกค้าจะโชว์สรุปและ QR แบบเรียลไทม์' },
    { icon: 'fa-pause', title: '5. พักบิล', body: 'กดพักบิลเพื่อเก็บรายการไว้ในกะ แล้วเรียกกลับมาปิดการขายภายหลังได้' },
    { icon: 'fa-box', title: '6. สินค้า & รับเข้า', body: 'จัดการสินค้าที่เมนูสินค้า · บันทึกรับสินค้าเข้าที่เมนูจัดซื้อ (สต็อกอัปเดตผ่านบัญชีเดินสินค้า ตรวจย้อนหลังได้ทั้งหมด)' },
    { icon: 'fa-clipboard-check', title: '7. นับสต็อก', body: 'เปิดรอบนับสต็อก กรอกจำนวนนับจริง ระบบบันทึกส่วนต่างและปรับยอดให้อัตโนมัติ' },
    { icon: 'fa-chart-line', title: '8. รายงาน & ปิดกะ', body: 'ดูยอดขาย กำไร และสต็อกที่เมนูรายงาน (ส่งออก Excel/PDF/CSV ได้) · ปิดกะเพื่อกระทบยอดเงินสดปลายวัน' },
  ];
  return (
    <div className="grid max-w-5xl gap-3 md:grid-cols-2">
      {items.map((it) => (
        <div key={it.title} className="card flex gap-3 p-4">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-brand-100"><i className={`fa-solid ${it.icon}`} /></div>
          <div><div className="font-bold text-ink-900">{it.title}</div><p className="mt-0.5 text-sm text-slate-500">{it.body}</p></div>
        </div>
      ))}
    </div>
  );
}

/* ───────────────────────────── helpers ───────────────────────── */
function F({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return <div className={className}><label className="label">{label}</label>{children}</div>;
}

/** ADMIN-only: choose which back-office pages a MANAGER may open (empty = all). */
function ManagerPermissions({ s, set }: { s: Setting; set: (p: Partial<Setting>) => void }) {
  const { user } = useAuth();
  if (user?.role !== 'ADMIN') return null;
  const allowed: string[] = (() => { try { return JSON.parse(s.managerPages || '[]'); } catch { return []; } })();
  const unrestricted = allowed.length === 0;
  const has = (to: string) => unrestricted || allowed.includes(to);
  function toggle(to: string) {
    // Materialize the full list first so unchecking one page restricts the rest.
    const base = unrestricted ? MANAGER_RESTRICTABLE_PAGES.map((p) => p.to) : [...allowed];
    const next = base.includes(to) ? base.filter((x) => x !== to) : [...base, to];
    set({ managerPages: JSON.stringify(next) });
  }
  return (
    <Section title="สิทธิ์ของผู้จัดการ (Manager)">
      <p className="mb-2 text-xs text-slate-400">เลือกหน้าที่ผู้จัดการเข้าถึงได้ (ผู้ดูแลระบบเข้าได้ทุกหน้าเสมอ · แดชบอร์ดเข้าได้เสมอ)</p>
      <div className="mb-2">
        <button className="text-xs font-semibold text-brand-600" onClick={() => set({ managerPages: '' })}>ให้สิทธิ์ทุกหน้า</button>
      </div>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
        {MANAGER_RESTRICTABLE_PAGES.map((p) => (
          <label key={p.to} className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm ring-1 ring-slate-200">
            <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={has(p.to)} onChange={() => toggle(p.to)} />
            <span className="truncate">{p.label}</span>
          </label>
        ))}
      </div>
    </Section>
  );
}
function Section({ title, children, first }: { title: string; children: React.ReactNode; first?: boolean }) {
  return <div className={first ? '' : 'border-t border-slate-100 pt-4'}><h3 className="mb-3 font-bold">{title}</h3>{children}</div>;
}
function Bullet({ icon, title, children }: { icon: string; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <i className={`fa-solid ${icon} mt-0.5 w-5 text-center text-brand-600`} />
      <span><span className="font-semibold text-ink-900">{title}</span> — {children}</span>
    </li>
  );
}
function Feature({ children, ok }: { children: React.ReactNode; ok?: boolean }) {
  return <div className="flex items-start gap-2"><i className={`fa-solid ${ok ? 'fa-check text-emerald-500' : 'fa-circle-info text-amber-500'} mt-0.5`} /><span>{children}</span></div>;
}
function Dashed() { return <div className="my-1.5 border-t border-dashed border-slate-300" />; }
