import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../store/auth';
import { toast } from './Toast';

interface NavItem { to?: string; label: string; icon: string; end?: boolean; adminOnly?: boolean; soon?: boolean; }

const NAV: NavItem[] = [
  { to: '/back', label: 'แดชบอร์ด', icon: '▦', end: true },
  { to: '/pos', label: 'หน้าร้าน (POS)', icon: '🛒' },
  { to: '/back/sales', label: 'การขาย', icon: '📈' },
  { to: '/back/products', label: 'สินค้า', icon: '📦' },
  { to: '/back/movements', label: 'คลังสินค้า', icon: '🏬' },
  { to: '/back/receive', label: 'จัดซื้อ', icon: '🛍️' },
  { to: '/back/members', label: 'ลูกค้า', icon: '👥' },
  { to: '/back/suppliers', label: 'ผู้จำหน่าย', icon: '🚚' },
  { to: '/back/shifts', label: 'การเงิน', icon: '💰' },
  { to: '/back/reports', label: 'รายงาน', icon: '📊' },
  { to: '/back/promotions', label: 'การตลาด', icon: '🎯' },
  { to: '/back/settings', label: 'ตั้งค่า', icon: '⚙️' },
  { to: '/back/users', label: 'ระบบ', icon: '🧩', adminOnly: true },
];

export function BackLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-slate-100">
      {/* Sidebar */}
      <aside className="flex w-64 flex-col bg-gradient-to-b from-ink-950 to-ink-900 text-slate-300">
        <div className="flex items-center gap-3 px-5 py-5">
          <div className="grid h-10 w-10 place-items-center rounded-2xl bg-gradient-to-br from-brand-400 to-brand-600 text-lg font-black text-white shadow-glow">◆</div>
          <div className="leading-tight">
            <div className="text-base font-extrabold text-white">POS Suite</div>
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand-300">Enterprise</div>
          </div>
        </div>

        <div className="px-4 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">เมนูหลัก</div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-3">
          {NAV.filter((n) => !n.adminOnly || user?.role === 'ADMIN').map((n) =>
            n.soon ? (
              <button key={n.label} onClick={() => toast.info('ฟีเจอร์นี้กำลังจะมาเร็ว ๆ นี้')}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-300/90 hover:bg-white/5 hover:text-white">
                <span className="w-5 text-center text-base">{n.icon}</span>{n.label}
              </button>
            ) : (
              <NavLink key={n.to} to={n.to!} end={n.end}
                className={({ isActive }) => `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${isActive ? 'bg-brand-600 text-white shadow-glow' : 'text-slate-300/90 hover:bg-white/5 hover:text-white'}`}>
                <span className="w-5 text-center text-base">{n.icon}</span>{n.label}
              </NavLink>
            )
          )}
        </nav>

        {/* Branch + user + version */}
        <div className="space-y-2 border-t border-white/10 p-3">
          <div className="rounded-xl bg-white/5 p-2.5 ring-1 ring-white/10">
            <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> สาขาเริ่มต้น (สำนักงานใหญ่)
            </div>
            <button onClick={() => toast.info('ระบบหลายสาขากำลังจะมาเร็ว ๆ นี้')} className="mt-2 w-full rounded-lg bg-white/10 py-1.5 text-xs font-semibold text-white hover:bg-white/15">เปลี่ยนสาขา</button>
          </div>
          <div className="flex items-center gap-2.5 rounded-xl px-1 py-1">
            <div className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-sm font-bold text-white">{user?.name?.charAt(0)}</div>
            <div className="min-w-0 leading-tight">
              <div className="truncate text-sm font-bold text-white">{user?.name}</div>
              <div className="truncate text-[11px] text-slate-400">{user?.role === 'ADMIN' ? 'ผู้ดูแลระบบ' : user?.role === 'MANAGER' ? 'ผู้จัดการ' : 'แคชเชียร์'}</div>
            </div>
          </div>
          <div className="px-1 text-[10px] text-slate-500">เวอร์ชัน 2.6.0</div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex items-center justify-end gap-2 border-b border-slate-200 bg-white px-6 py-2.5">
          <button className="grid h-9 w-9 place-items-center rounded-xl text-slate-500 ring-1 ring-slate-200 hover:bg-slate-50" title="ค้นหา">🔍</button>
          <button className="relative grid h-9 w-9 place-items-center rounded-xl text-slate-500 ring-1 ring-slate-200 hover:bg-slate-50" title="การแจ้งเตือน">
            🔔<span className="absolute -right-1 -top-1 grid h-4 w-4 place-items-center rounded-full bg-rose-500 text-[9px] font-bold text-white">5</span>
          </button>
          <button className="grid h-9 w-9 place-items-center rounded-xl text-slate-500 ring-1 ring-slate-200 hover:bg-slate-50" title="ช่วยเหลือ">?</button>
          <div className="relative">
            <button onClick={() => setMenuOpen((v) => !v)} className="flex items-center gap-2 rounded-xl bg-slate-50 px-2 py-1.5 ring-1 ring-slate-200 hover:bg-slate-100">
              <div className="grid h-7 w-7 place-items-center rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-xs font-bold text-white">{user?.name?.charAt(0)}</div>
              <div className="leading-tight text-left">
                <div className="text-xs font-bold text-ink-900">{user?.name}</div>
                <div className="text-[10px] text-slate-400">{user?.role === 'ADMIN' ? 'ผู้ดูแลระบบ' : user?.role}</div>
              </div>
              <span className="text-slate-400">▾</span>
            </button>
            {menuOpen && (
              <div className="absolute right-0 z-30 mt-1 w-44 overflow-hidden rounded-xl bg-white py-1 shadow-pop ring-1 ring-slate-200" onMouseLeave={() => setMenuOpen(false)}>
                <button className="block w-full px-4 py-2 text-left text-sm hover:bg-slate-50" onClick={() => { setMenuOpen(false); navigate('/back/settings'); }}>⚙️ ตั้งค่า</button>
                <button className="block w-full px-4 py-2 text-left text-sm text-rose-600 hover:bg-rose-50" onClick={() => { logout(); navigate('/login'); }}>⎋ ออกจากระบบ</button>
              </div>
            )}
          </div>
        </header>

        <main className="flex-1 overflow-auto p-6">
          <div className="mx-auto max-w-[1500px] animate-rise">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
