import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../store/auth';
import { useBranch } from '../store/branch';
import { api } from '../api/client';
import { ProductImage } from './ProductImage';
import { ChangePasswordModal } from './ChangePasswordModal';
import { money } from '../lib/format';
import { toast } from './Toast';
import type { Member, Product } from '../types';

interface StockAlert { id: number; sku: string; name: string; category: string; stockQty: number; reorderLevel: number; unit: string; }

interface NavItem { to: string; label: string; icon: string; end?: boolean; adminOnly?: boolean; }
interface NavGroup { title: string; items: NavItem[]; }

const GROUPS: NavGroup[] = [
  {
    title: 'ภาพรวม',
    items: [{ to: '/back', label: 'แดชบอร์ด', icon: 'fa-gauge-high', end: true }],
  },
  {
    title: 'การขาย',
    items: [
      { to: '/back/sales', label: 'รายการขาย', icon: 'fa-receipt' },
      { to: '/back/quotations', label: 'ใบเสนอราคา', icon: 'fa-file-lines' },
      { to: '/back/layaways', label: 'ออมก่อนรับ / มัดจำ', icon: 'fa-piggy-bank' },
      { to: '/back/returns', label: 'การคืนสินค้า', icon: 'fa-rotate-left' },
      { to: '/back/promotions', label: 'การตลาด', icon: 'fa-bullhorn' },
      { to: '/back/gift-cards', label: 'บัตรของขวัญ', icon: 'fa-gift' },
    ],
  },
  {
    title: 'สินค้าคงคลัง',
    items: [
      { to: '/back/products', label: 'สินค้า', icon: 'fa-box' },
      { to: '/back/labels', label: 'พิมพ์ป้ายราคา/บาร์โค้ด', icon: 'fa-barcode' },
      { to: '/back/movements', label: 'คลังสินค้า', icon: 'fa-warehouse' },
      { to: '/back/transfers', label: 'โอนสินค้าระหว่างสาขา', icon: 'fa-right-left' },
      { to: '/back/purchase-orders', label: 'ใบสั่งซื้อ', icon: 'fa-file-invoice-dollar' },
      { to: '/back/receive', label: 'จัดซื้อ / รับเข้า', icon: 'fa-truck-ramp-box' },
    ],
  },
  {
    title: 'ลูกค้าและคู่ค้า',
    items: [
      { to: '/back/members', label: 'ลูกค้า / สมาชิก', icon: 'fa-users' },
      { to: '/back/suppliers', label: 'ผู้จำหน่าย', icon: 'fa-handshake' },
    ],
  },
  {
    title: 'การเงินและรายงาน',
    items: [
      { to: '/back/shifts', label: 'การเงิน / กะ', icon: 'fa-cash-register' },
      { to: '/back/expenses', label: 'ค่าใช้จ่าย', icon: 'fa-money-bill-wave' },
      { to: '/back/payables', label: 'เจ้าหนี้การค้า', icon: 'fa-file-invoice-dollar' },
      { to: '/back/reports', label: 'รายงาน', icon: 'fa-chart-line' },
    ],
  },
  {
    title: 'ตั้งค่าระบบ',
    items: [
      { to: '/back/settings', label: 'ตั้งค่า', icon: 'fa-gear' },
      { to: '/back/branches', label: 'สาขา', icon: 'fa-code-branch', adminOnly: true },
      { to: '/back/users', label: 'ผู้ใช้งานระบบ', icon: 'fa-user-shield', adminOnly: true },
      { to: '/back/audit', label: 'บันทึกการใช้งาน', icon: 'fa-clipboard-list', adminOnly: true },
      { to: '/back/backup', label: 'สำรอง / กู้คืนข้อมูล', icon: 'fa-database', adminOnly: true },
    ],
  },
];

/** Pages whose access can be granted/revoked for the MANAGER role (admin-only pages
 *  are always ADMIN-exclusive; the dashboard is always available). */
export const MANAGER_RESTRICTABLE_PAGES = GROUPS.flatMap((g) => g.items)
  .filter((n) => !n.adminOnly && n.to !== '/back')
  .map((n) => ({ to: n.to, label: n.label }));

export function BackLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const isAdmin = user?.role === 'ADMIN';
  const location = useLocation();

  // Manager page permissions (ADMIN = unrestricted; empty config = full access).
  const [allowed, setAllowed] = useState<Set<string> | null>(null);
  useEffect(() => {
    if (isAdmin || user?.role !== 'MANAGER') { setAllowed(null); return; }
    api<{ managerPages?: string }>('/settings')
      .then((s) => {
        const list = (() => { try { return JSON.parse(s.managerPages || '[]'); } catch { return []; } })();
        setAllowed(Array.isArray(list) && list.length ? new Set<string>(list) : null);
      })
      .catch(() => setAllowed(null));
  }, [isAdmin, user?.role]);

  const canAccess = (to: string) => allowed === null || to === '/back' || allowed.has(to);

  // Cmd/Ctrl+K opens global search.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setSearchOpen(true); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="flex h-screen overflow-hidden bg-transparent">
      {/* Sidebar */}
      <aside className="flex w-64 flex-col bg-gradient-to-b from-ink-950 via-ink-900 to-ink-950 text-slate-300">
        <div className="flex items-center gap-3 px-5 py-5">
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-brand-400 to-brand-600 text-lg text-white shadow-glow">
            <i className="fa-solid fa-store" />
          </div>
          <div className="leading-tight">
            <div className="text-base font-extrabold text-white">POS Suite</div>
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand-300">Enterprise</div>
          </div>
        </div>

        <nav className="flex-1 space-y-4 overflow-y-auto px-3 pb-3">
          {GROUPS.map((g) => {
            const items = g.items.filter((n) => (!n.adminOnly || isAdmin) && canAccess(n.to));
            if (!items.length) return null;
            return (
              <div key={g.title}>
                <div className="px-3 pb-1.5 text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500">{g.title}</div>
                <div className="space-y-0.5">
                  {items.map((n) => (
                    <NavLink
                      key={n.to}
                      to={n.to}
                      end={n.end}
                      className={({ isActive }) =>
                        `group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                          isActive
                            ? 'bg-gradient-to-r from-brand-600 to-brand-500 text-white shadow-glow'
                            : 'text-slate-300/90 hover:bg-white/5 hover:text-white'
                        }`
                      }
                    >
                      {({ isActive }) => (
                        <>
                          {isActive && <span className="absolute -left-3 h-6 w-1 rounded-r-full bg-brand-300" />}
                          <i className={`fa-solid ${n.icon} w-5 text-center text-[15px] ${isActive ? 'text-white' : 'text-slate-400 group-hover:text-brand-300'}`} />
                          {n.label}
                        </>
                      )}
                    </NavLink>
                  ))}
                </div>
              </div>
            );
          })}
        </nav>

        {/* Branch + user + version */}
        <div className="space-y-2 border-t border-white/10 p-3">
          <BranchSwitcher />
          <div className="flex items-center gap-2.5 rounded-xl px-1 py-1">
            <div className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-sm font-bold text-white">{user?.name?.charAt(0)}</div>
            <div className="min-w-0 leading-tight">
              <div className="truncate text-sm font-bold text-white">{user?.name}</div>
              <div className="truncate text-[11px] text-slate-400">{user?.role === 'ADMIN' ? 'ผู้ดูแลระบบ' : user?.role === 'MANAGER' ? 'ผู้จัดการ' : 'แคชเชียร์'}</div>
            </div>
          </div>
          <div className="px-1 text-[10px] text-slate-500">เวอร์ชัน 2.7.0</div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex items-center gap-2 border-b border-slate-200 bg-white px-6 py-2.5">
          <div className="ml-auto flex items-center gap-2">
            {/* Quick "go to POS" — opens the cashier sell screen, sits next to search */}
            <button
              onClick={() => navigate('/pos')}
              className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-600 to-brand-500 px-4 py-2 text-sm font-bold text-white shadow-glow transition hover:brightness-110"
              title="ไปหน้าขาย (POS)"
            >
              <i className="fa-solid fa-cash-register" /> หน้าขาย
            </button>
            <button onClick={() => setSearchOpen(true)} className="flex h-9 items-center gap-2 rounded-xl px-3 text-slate-500 ring-1 ring-slate-200 hover:bg-slate-50" title="ค้นหา (⌘K)">
              <i className="fa-solid fa-magnifying-glass" />
              <span className="hidden text-xs text-slate-400 lg:inline">ค้นหา</span>
              <kbd className="hidden rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-400 lg:inline">⌘K</kbd>
            </button>
            <Notifications />
            <button onClick={() => navigate('/back/settings?tab=manual')} className="grid h-9 w-9 place-items-center rounded-xl text-slate-500 ring-1 ring-slate-200 hover:bg-slate-50" title="ช่วยเหลือ / คู่มือใช้งาน"><i className="fa-regular fa-circle-question" /></button>
            <div className="relative">
              <button onClick={() => setMenuOpen((v) => !v)} className="flex items-center gap-2 rounded-xl bg-slate-50 px-2 py-1.5 ring-1 ring-slate-200 hover:bg-slate-100">
                <div className="grid h-7 w-7 place-items-center rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-xs font-bold text-white">{user?.name?.charAt(0)}</div>
                <div className="leading-tight text-left">
                  <div className="text-xs font-bold text-ink-900">{user?.name}</div>
                  <div className="text-[10px] text-slate-400">{user?.role === 'ADMIN' ? 'ผู้ดูแลระบบ' : user?.role}</div>
                </div>
                <i className="fa-solid fa-chevron-down text-[10px] text-slate-400" />
              </button>
              {menuOpen && (
                <div className="absolute right-0 z-30 mt-1 w-44 overflow-hidden rounded-xl bg-white py-1 shadow-pop ring-1 ring-slate-200" onMouseLeave={() => setMenuOpen(false)}>
                  <button className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm hover:bg-slate-50" onClick={() => { setMenuOpen(false); navigate('/back/settings'); }}><i className="fa-solid fa-gear w-4 text-slate-400" /> ตั้งค่า</button>
                  <button className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm hover:bg-slate-50" onClick={() => { setMenuOpen(false); setPwOpen(true); }}><i className="fa-solid fa-key w-4 text-slate-400" /> เปลี่ยนรหัสผ่าน</button>
                  <button className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-rose-600 hover:bg-rose-50" onClick={() => { logout(); navigate('/login'); }}><i className="fa-solid fa-right-from-bracket w-4" /> ออกจากระบบ</button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-auto p-6">
          <div className="mx-auto h-full max-w-[1500px] animate-rise">
            {canAccess(location.pathname) ? (
              <Outlet />
            ) : (
              <div className="grid h-full place-items-center text-center text-slate-400">
                <div>
                  <i className="fa-solid fa-lock text-4xl text-slate-300" />
                  <p className="mt-3 text-lg font-bold text-slate-500">ไม่มีสิทธิ์เข้าถึงหน้านี้</p>
                  <p className="text-sm">โปรดติดต่อผู้ดูแลระบบเพื่อขอสิทธิ์</p>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>

      {searchOpen && <SearchPalette onClose={() => setSearchOpen(false)} navigate={navigate} />}
      {pwOpen && <ChangePasswordModal onClose={() => setPwOpen(false)} />}
    </div>
  );
}

/** Global command-palette search across products and members (⌘K). */
function SearchPalette({ onClose, navigate }: { onClose: () => void; navigate: (to: string) => void }) {
  const [q, setQ] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    const term = q.trim();
    if (!term) { setProducts([]); setMembers([]); return; }
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const [p, m] = await Promise.all([
          api<Product[]>('/products', { query: { q: term } }).catch(() => []),
          api<Member[]>('/members', { query: { q: term } }).catch(() => []),
        ]);
        setProducts(p.slice(0, 6));
        setMembers(m.slice(0, 5));
      } finally { setLoading(false); }
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  const go = (to: string) => { onClose(); navigate(to); };
  const term = q.trim();
  const empty = term && !loading && !products.length && !members.length;

  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center bg-black/50 p-4 pt-[12vh]" onClick={onClose}>
      <div className="w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-pop ring-1 ring-slate-200" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
          <i className="fa-solid fa-magnifying-glass text-slate-400" />
          <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาสินค้า, สมาชิก, บิล…"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400" />
          {loading && <i className="fa-solid fa-spinner fa-spin text-slate-300" />}
          <kbd className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-400">ESC</kbd>
        </div>

        <div className="max-h-[55vh] overflow-auto">
          {!term && (
            <div className="px-4 py-10 text-center text-sm text-slate-400">
              <i className="fa-solid fa-keyboard mb-2 block text-2xl" />พิมพ์เพื่อค้นหาสินค้าและสมาชิก
            </div>
          )}
          {empty && <div className="px-4 py-10 text-center text-sm text-slate-400">ไม่พบผลลัพธ์สำหรับ “{term}”</div>}

          {products.length > 0 && (
            <>
              <Grp label="สินค้า" />
              {products.map((p) => (
                <button key={p.id} onClick={() => go(`/back/products?q=${encodeURIComponent(p.sku)}`)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-50">
                  <ProductImage src={p.imageUrl} name={p.name} className="h-9 w-9 rounded-lg ring-1 ring-slate-200" />
                  <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium text-ink-900">{p.name}</div><div className="text-xs text-slate-400">{p.sku} · คงเหลือ {p.stockQty} {p.unit}</div></div>
                  <span className="text-sm font-semibold text-slate-600">{money(p.retailPrice)}</span>
                </button>
              ))}
            </>
          )}
          {members.length > 0 && (
            <>
              <Grp label="สมาชิก" />
              {members.map((m) => (
                <button key={m.id} onClick={() => go(`/back/members?q=${encodeURIComponent(m.phone || m.name)}`)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-50">
                  <div className="grid h-9 w-9 place-items-center rounded-full bg-brand-50 text-brand-600"><i className="fa-solid fa-user" /></div>
                  <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium text-ink-900">{m.name}</div><div className="text-xs text-slate-400">{m.phone} {m.code ? `· ${m.code}` : ''}</div></div>
                </button>
              ))}
            </>
          )}

          {term && (
            <button onClick={() => go(`/back/sales`)} className="flex w-full items-center gap-3 border-t border-slate-100 px-4 py-2.5 text-left text-sm text-brand-600 hover:bg-slate-50">
              <i className="fa-solid fa-receipt w-9 text-center" /> ค้นหาในรายการขายทั้งหมด
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Grp({ label }: { label: string }) {
  return <div className="bg-slate-50 px-4 py-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</div>;
}

/** Sidebar branch selector (Phase 1 multi-branch). */
function BranchSwitcher() {
  const { branches, activeId, setActive, active } = useBranch();
  const current = active();
  return (
    <div className="rounded-xl bg-white/5 p-2.5 ring-1 ring-white/10">
      <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> สาขาปัจจุบัน
      </div>
      {branches.length > 1 ? (
        <select
          value={activeId ?? current?.id ?? ''}
          onChange={(e) => setActive(Number(e.target.value))}
          className="mt-2 w-full rounded-lg bg-white/10 px-2 py-1.5 text-xs font-semibold text-white outline-none ring-1 ring-white/10 hover:bg-white/15"
        >
          {branches.map((b) => <option key={b.id} value={b.id} className="text-slate-900">{b.name}{b.isDefault ? ' (สำนักงานใหญ่)' : ''}</option>)}
        </select>
      ) : (
        <div className="mt-1 truncate text-sm font-bold text-white">{current?.name ?? 'สำนักงานใหญ่'}</div>
      )}
    </div>
  );
}

/** Topbar notifications — live low-stock / reorder alerts from the inventory. */
function Notifications() {
  const navigate = useNavigate();
  const [alerts, setAlerts] = useState<StockAlert[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const load = () => api<StockAlert[]>('/reports/low-stock').then(setAlerts).catch(() => {});
  useEffect(() => {
    load();
    const t = setInterval(load, 60_000); // refresh every minute
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (!open) return;
    load();
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const out = alerts.filter((a) => a.stockQty <= 0);
  const low = alerts.filter((a) => a.stockQty > 0);
  const count = alerts.length;

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((v) => !v)} className="relative grid h-9 w-9 place-items-center rounded-xl text-slate-500 ring-1 ring-slate-200 hover:bg-slate-50" title="การแจ้งเตือน">
        <i className="fa-regular fa-bell" />
        {count > 0 && <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white">{count > 99 ? '99+' : count}</span>}
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-80 overflow-hidden rounded-2xl bg-white shadow-pop ring-1 ring-slate-200">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <span className="font-bold text-ink-900">การแจ้งเตือน</span>
            <span className="chip bg-rose-50 text-rose-600">{count}</span>
          </div>
          <div className="max-h-80 overflow-auto">
            {count === 0 ? (
              <div className="flex flex-col items-center px-4 py-10 text-center text-slate-400">
                <i className="fa-regular fa-bell-slash mb-2 text-2xl" />
                <span className="text-sm">ไม่มีการแจ้งเตือน</span>
              </div>
            ) : (
              <>
                {out.length > 0 && <div className="bg-slate-50 px-4 py-1.5 text-[10px] font-bold uppercase tracking-wide text-rose-500">หมดสต็อก ({out.length})</div>}
                {out.map((a) => <AlertRow key={a.id} a={a} tone="rose" onClick={() => { setOpen(false); navigate('/back/products'); }} />)}
                {low.length > 0 && <div className="bg-slate-50 px-4 py-1.5 text-[10px] font-bold uppercase tracking-wide text-amber-600">ใกล้หมด / ถึงจุดสั่งซื้อ ({low.length})</div>}
                {low.map((a) => <AlertRow key={a.id} a={a} tone="amber" onClick={() => { setOpen(false); navigate('/back/products'); }} />)}
              </>
            )}
          </div>
          <button className="w-full border-t border-slate-100 py-2.5 text-center text-sm font-semibold text-brand-600 hover:bg-slate-50" onClick={() => { setOpen(false); navigate('/back/reports'); }}>
            ดูรายงานสต็อกทั้งหมด
          </button>
        </div>
      )}
    </div>
  );
}

function AlertRow({ a, tone, onClick }: { a: StockAlert; tone: 'rose' | 'amber'; onClick: () => void }) {
  const cls = tone === 'rose' ? 'bg-rose-50 text-rose-500' : 'bg-amber-50 text-amber-600';
  return (
    <button onClick={onClick} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-50">
      <div className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${cls}`}><i className={`fa-solid ${tone === 'rose' ? 'fa-circle-exclamation' : 'fa-triangle-exclamation'}`} /></div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-ink-900">{a.name}</div>
        <div className="text-xs text-slate-400">{tone === 'rose' ? 'หมดสต็อก' : `เหลือ ${a.stockQty} ${a.unit}`} · จุดสั่งซื้อ {a.reorderLevel}</div>
      </div>
    </button>
  );
}
