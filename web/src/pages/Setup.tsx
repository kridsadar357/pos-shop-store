import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { toast } from '../components/Toast';

const STEPS = ['ข้อมูลร้าน', 'ฐานข้อมูล', 'สร้างผู้ใช้', 'ไลเซนส์', 'สรุป'];

export default function Setup() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [phase, setPhase] = useState<'wizard' | 'installing' | 'done'>('wizard');
  const [busy, setBusy] = useState(false);

  const [shop, setShop] = useState({
    storeName: '', address: '', phone: '', taxId: '',
    promptPayId: '', promptPayType: 'MSISDN' as 'MSISDN' | 'NATID' | 'EWALLET',
    currency: 'THB', taxRatePct: 7, taxInclusive: true,
  });
  const [db, setDb] = useState({ host: 'localhost', port: '5432', database: 'pos', user: 'pos', password: '••••••••' });
  const [dbTest, setDbTest] = useState<{ ok: boolean; msg: string } | null>(null);
  const [admin, setAdmin] = useState({ username: 'admin', name: '', password: '', confirm: '' });
  const [license, setLicense] = useState<{ mode: 'activate' | 'demo' | 'skip'; key: string }>({ mode: 'demo', key: '' });

  const canNext = (): boolean => {
    if (step === 0) return shop.storeName.trim().length > 0;
    if (step === 2) return admin.username.trim().length > 0 && admin.name.trim().length > 0 && admin.password.length >= 4 && admin.password === admin.confirm;
    if (step === 3) return license.mode !== 'activate' || license.key.trim().length > 0;
    return true;
  };

  async function testDb() {
    setBusy(true);
    try {
      const r = await api<{ ok: boolean; ms: number; version: string }>('/setup/test-db', { method: 'POST', body: db });
      setDbTest({ ok: true, msg: `เชื่อมต่อสำเร็จ · ${r.version} · ${r.ms}ms` });
    } catch (e) { setDbTest({ ok: false, msg: (e as Error).message }); }
    finally { setBusy(false); }
  }

  async function install() {
    setPhase('installing');
    setBusy(true);
    try {
      await api('/setup/complete', {
        method: 'POST',
        body: {
          shop: { ...shop, taxRatePct: Number(shop.taxRatePct) },
          admin: { username: admin.username.trim(), name: admin.name.trim(), password: admin.password },
          license: { mode: license.mode, key: license.key.trim() || undefined },
        },
      });
      await new Promise((r) => setTimeout(r, 900)); // let the "installing" animation breathe
      setPhase('done');
    } catch (e) {
      toast.error((e as Error).message);
      setPhase('wizard');
    } finally { setBusy(false); }
  }

  if (phase === 'done') return <Congrats onLogin={() => navigate('/login')} />;
  if (phase === 'installing') return <Installing />;

  return (
    <div className="min-h-screen bg-gradient-to-br from-ink-950 via-ink-900 to-brand-900 p-4 text-slate-100">
      <div className="mx-auto max-w-3xl py-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-brand-400 to-brand-600 text-xl text-white shadow-glow"><i className="fa-solid fa-store" /></div>
          <div><div className="text-xl font-extrabold">ติดตั้ง POS Suite</div><div className="text-xs text-brand-200">ตั้งค่าครั้งแรกสำหรับร้านของคุณ</div></div>
        </div>

        {/* Stepper */}
        <div className="mb-6 flex items-center">
          {STEPS.map((label, i) => (
            <div key={label} className="flex flex-1 items-center last:flex-none">
              <div className="flex flex-col items-center">
                <div className={`grid h-9 w-9 place-items-center rounded-full text-sm font-bold transition ${i < step ? 'bg-brand-500 text-white' : i === step ? 'bg-white text-brand-700 ring-4 ring-brand-500/30' : 'bg-white/10 text-slate-400'}`}>
                  {i < step ? <i className="fa-solid fa-check" /> : i + 1}
                </div>
                <span className={`mt-1 text-[11px] ${i === step ? 'font-bold text-white' : 'text-slate-400'}`}>{label}</span>
              </div>
              {i < STEPS.length - 1 && <div className={`mx-1 h-0.5 flex-1 rounded ${i < step ? 'bg-brand-500' : 'bg-white/10'}`} />}
            </div>
          ))}
        </div>

        <div className="rounded-2xl bg-white p-6 text-slate-700 shadow-pop">
          {step === 0 && (
            <Step title="ข้อมูลร้าน" icon="fa-shop">
              <div className="grid grid-cols-2 gap-3">
                <Fld label="ชื่อร้าน *" className="col-span-2"><input className="input" value={shop.storeName} onChange={(e) => setShop({ ...shop, storeName: e.target.value })} placeholder="เช่น ร้านสะดวกซื้อ ABC" /></Fld>
                <Fld label="เบอร์โทร"><input className="input" value={shop.phone} onChange={(e) => setShop({ ...shop, phone: e.target.value })} /></Fld>
                <Fld label="เลขผู้เสียภาษี"><input className="input" value={shop.taxId} onChange={(e) => setShop({ ...shop, taxId: e.target.value })} /></Fld>
                <Fld label="ที่อยู่" className="col-span-2"><input className="input" value={shop.address} onChange={(e) => setShop({ ...shop, address: e.target.value })} /></Fld>
                <Fld label="หมายเลขพร้อมเพย์"><input className="input" value={shop.promptPayId} onChange={(e) => setShop({ ...shop, promptPayId: e.target.value })} /></Fld>
                <Fld label="อัตราภาษี %"><input type="number" className="input" value={shop.taxRatePct} onChange={(e) => setShop({ ...shop, taxRatePct: Number(e.target.value) })} /></Fld>
              </div>
            </Step>
          )}

          {step === 1 && (
            <Step title="การเชื่อมต่อฐานข้อมูล" icon="fa-database">
              <div className="grid grid-cols-2 gap-3">
                <Fld label="โฮสต์"><input className="input" value={db.host} onChange={(e) => { setDb({ ...db, host: e.target.value }); setDbTest(null); }} /></Fld>
                <Fld label="พอร์ต"><input className="input" value={db.port} onChange={(e) => { setDb({ ...db, port: e.target.value }); setDbTest(null); }} /></Fld>
                <Fld label="ฐานข้อมูล"><input className="input" value={db.database} onChange={(e) => setDb({ ...db, database: e.target.value })} /></Fld>
                <Fld label="ผู้ใช้"><input className="input" value={db.user} onChange={(e) => setDb({ ...db, user: e.target.value })} /></Fld>
                <Fld label="รหัสผ่าน" className="col-span-2"><input type="password" className="input" value={db.password} onChange={(e) => setDb({ ...db, password: e.target.value })} /></Fld>
              </div>
              <button className="btn-ghost mt-3" disabled={busy} onClick={testDb}><i className="fa-solid fa-plug mr-1.5" />ทดสอบการเชื่อมต่อ</button>
              {dbTest && (
                <div className={`mt-3 rounded-xl p-3 text-sm ring-1 ${dbTest.ok ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-rose-50 text-rose-700 ring-rose-200'}`}>
                  <i className={`fa-solid ${dbTest.ok ? 'fa-circle-check' : 'fa-triangle-exclamation'} mr-1.5`} />{dbTest.msg}
                </div>
              )}
              <p className="mt-2 text-xs text-slate-400">เซิร์ฟเวอร์เชื่อมต่อฐานข้อมูลผ่านไฟล์ตั้งค่า (.env / Docker) — ปุ่มนี้ทดสอบการเชื่อมต่อจริงของเซิร์ฟเวอร์</p>
            </Step>
          )}

          {step === 2 && (
            <Step title="สร้างบัญชีผู้ดูแลระบบ" icon="fa-user-shield">
              <div className="grid grid-cols-2 gap-3">
                <Fld label="ชื่อผู้ใช้ *"><input className="input" value={admin.username} onChange={(e) => setAdmin({ ...admin, username: e.target.value })} /></Fld>
                <Fld label="ชื่อ-นามสกุล *"><input className="input" value={admin.name} onChange={(e) => setAdmin({ ...admin, name: e.target.value })} /></Fld>
                <Fld label="รหัสผ่าน * (≥4)"><input type="password" className="input" value={admin.password} onChange={(e) => setAdmin({ ...admin, password: e.target.value })} /></Fld>
                <Fld label="ยืนยันรหัสผ่าน *"><input type="password" className="input" value={admin.confirm} onChange={(e) => setAdmin({ ...admin, confirm: e.target.value })} /></Fld>
              </div>
              {admin.confirm && admin.password !== admin.confirm && <p className="mt-2 text-xs text-rose-500">รหัสผ่านไม่ตรงกัน</p>}
            </Step>
          )}

          {step === 3 && (
            <Step title="เปิดใช้งานไลเซนส์" icon="fa-key">
              <div className="space-y-2">
                <Choice active={license.mode === 'activate'} onClick={() => setLicense({ ...license, mode: 'activate' })} icon="fa-key" title="มีรหัสไลเซนส์" desc="เปิดใช้งานเต็มรูปแบบด้วยรหัสที่ได้รับ" />
                {license.mode === 'activate' && <input className="input font-mono" placeholder="21F3-D415-5156-6B1D" value={license.key} onChange={(e) => setLicense({ ...license, key: e.target.value })} />}
                <Choice active={license.mode === 'demo'} onClick={() => setLicense({ ...license, mode: 'demo' })} icon="fa-gift" title="ทดลองใช้ฟรี 14 วัน" desc="ใช้งานครบทุกฟีเจอร์ 14 วัน แล้วค่อยเปิดใช้งานภายหลัง" />
                <Choice active={license.mode === 'skip'} onClick={() => setLicense({ ...license, mode: 'skip' })} icon="fa-forward" title="ข้ามไปก่อน" desc="ตั้งค่าไลเซนส์ภายหลังที่หน้าตั้งค่า" />
              </div>
            </Step>
          )}

          {step === 4 && (
            <Step title="สรุปข้อมูลการติดตั้ง" icon="fa-clipboard-check">
              <dl className="divide-y divide-slate-100 rounded-xl ring-1 ring-slate-200">
                <Row k="ชื่อร้าน" v={shop.storeName || '—'} />
                <Row k="เบอร์โทร / ภาษี" v={`${shop.phone || '—'} · ${shop.taxId || '—'}`} />
                <Row k="พร้อมเพย์" v={shop.promptPayId || '—'} />
                <Row k="ฐานข้อมูล" v={`${db.user}@${db.host}:${db.port}/${db.database}`} />
                <Row k="ผู้ดูแลระบบ" v={`${admin.name} (${admin.username})`} />
                <Row k="ไลเซนส์" v={license.mode === 'activate' ? `รหัส: ${license.key}` : license.mode === 'demo' ? 'ทดลองใช้ 14 วัน' : 'ข้ามไปก่อน'} />
              </dl>
              <p className="mt-3 text-xs text-slate-400">กด “ติดตั้งระบบ” เพื่อบันทึกการตั้งค่าและสร้างบัญชีผู้ดูแล</p>
            </Step>
          )}

          {/* Nav */}
          <div className="mt-6 flex items-center justify-between">
            <button className="btn-ghost" disabled={step === 0 || busy} onClick={() => setStep((s) => s - 1)}><i className="fa-solid fa-arrow-left mr-1.5" />ย้อนกลับ</button>
            {step < STEPS.length - 1 ? (
              <button className="btn-primary" disabled={!canNext()} onClick={() => setStep((s) => s + 1)}>ถัดไป<i className="fa-solid fa-arrow-right ml-1.5" /></button>
            ) : (
              <button className="btn-primary" disabled={busy} onClick={install}><i className="fa-solid fa-rocket mr-1.5" />ติดตั้งระบบ</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Installing() {
  return (
    <div className="grid min-h-screen place-items-center bg-gradient-to-br from-ink-950 via-ink-900 to-brand-900 text-white">
      <div className="text-center">
        <i className="fa-solid fa-gear fa-spin text-5xl text-brand-300" />
        <div className="mt-4 text-lg font-bold">กำลังติดตั้งระบบ…</div>
        <div className="text-sm text-slate-400">บันทึกการตั้งค่าและสร้างบัญชีผู้ดูแล</div>
      </div>
    </div>
  );
}

function Congrats({ onLogin }: { onLogin: () => void }) {
  return (
    <div className="grid min-h-screen place-items-center bg-gradient-to-br from-emerald-600 via-brand-600 to-brand-800 p-4 text-white">
      <div className="max-w-md text-center">
        <div className="mx-auto grid h-24 w-24 animate-rise place-items-center rounded-full bg-white/15 ring-4 ring-white/30"><i className="fa-solid fa-circle-check text-6xl" /></div>
        <h1 className="mt-6 text-3xl font-extrabold">ติดตั้งสำเร็จ! 🎉</h1>
        <p className="mt-2 text-white/85">ยินดีด้วย ระบบ POS Suite พร้อมใช้งานแล้ว<br />เข้าสู่ระบบด้วยบัญชีผู้ดูแลที่คุณสร้างไว้เพื่อเริ่มต้นใช้งาน</p>
        <button className="mt-8 rounded-xl bg-white px-8 py-3 font-bold text-brand-700 shadow-pop transition hover:brightness-95" onClick={onLogin}>
          เข้าสู่ระบบ <i className="fa-solid fa-arrow-right-to-bracket ml-1.5" />
        </button>
      </div>
    </div>
  );
}

/* helpers */
function Step({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-ink-900"><i className={`fa-solid ${icon} text-brand-600`} /> {title}</h2>
      {children}
    </div>
  );
}
function Fld({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return <div className={className}><label className="label">{label}</label>{children}</div>;
}
function Choice({ active, onClick, icon, title, desc }: { active: boolean; onClick: () => void; icon: string; title: string; desc: string }) {
  return (
    <button onClick={onClick} className={`flex w-full items-center gap-3 rounded-xl p-3 text-left ring-1 transition ${active ? 'bg-brand-50 ring-brand-300' : 'bg-white ring-slate-200 hover:bg-slate-50'}`}>
      <div className={`grid h-10 w-10 place-items-center rounded-xl ${active ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-500'}`}><i className={`fa-solid ${icon}`} /></div>
      <div className="flex-1"><div className="font-semibold text-ink-900">{title}</div><div className="text-xs text-slate-500">{desc}</div></div>
      <i className={`fa-solid ${active ? 'fa-circle-check text-brand-600' : 'fa-circle text-slate-300'}`} />
    </button>
  );
}
function Row({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between px-4 py-2.5 text-sm"><span className="text-slate-500">{k}</span><span className="font-medium text-ink-900">{v}</span></div>;
}
