import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../store/auth';
import { useBranch } from '../../store/branch';
import { toast } from '../../components/Toast';
import { th } from '../../lib/th';

interface Item {
  label: string;
  icon: string;
  to?: string;
  active?: boolean;
  soon?: boolean;
}

const ITEMS: Item[] = [
  { label: 'หน้าขาย (POS)', icon: '🛍️', to: '/pos', active: true },
  { label: 'ออเดอร์ขาย', icon: '🧾', to: '/back/sales' },
  { label: 'ลูกค้า', icon: '👥', to: '/back/members' },
  { label: 'สินค้า', icon: '📦', to: '/back/products' },
  { label: 'คลังสินค้า', icon: '🏬', to: '/back/movements' },
  { label: 'จัดซื้อ', icon: '🛒', to: '/back/receive' },
  { label: 'โปรโมชั่น', icon: '🏷️', soon: true },
  { label: 'รายงาน', icon: '📊', to: '/back/reports' },
  { label: 'การเงิน', icon: '💰', to: '/back/shifts' },
  { label: 'ตั้งค่า', icon: '⚙️', to: '/back/settings' },
  { label: 'ระบบ', icon: '🧩', to: '/back/users' },
];

export function PosSidebar({ branch }: { branch?: string }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <aside className="flex h-screen w-60 shrink-0 flex-col bg-gradient-to-b from-ink-950 to-ink-900 text-slate-300">
      {/* Brand */}
      <div className="flex items-center gap-3 px-5 py-5">
        <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-brand-400 to-brand-600 text-xl font-black text-white shadow-glow">◆</div>
        <div className="leading-tight">
          <div className="text-base font-extrabold text-white">POS Suite</div>
          <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand-300">Enterprise</div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
        {ITEMS.map((it) => (
          <button
            key={it.label}
            onClick={() => (it.soon ? toast.info(th.comingSoon) : it.to && navigate(it.to))}
            className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
              it.active ? 'bg-brand-600 text-white shadow-glow' : 'text-slate-300/90 hover:bg-white/5 hover:text-white'
            }`}
          >
            <span className="w-5 text-center text-base">{it.icon}</span>
            {it.label}
          </button>
        ))}
      </nav>

      {/* User + branch */}
      <div className="space-y-3 border-t border-white/10 p-3">
        <div className="flex items-center gap-3 rounded-xl bg-white/5 p-2.5">
          <div className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-sm font-bold text-white">
            {user?.name?.charAt(0)}
          </div>
          <div className="min-w-0 leading-tight">
            <div className="truncate text-sm font-bold text-white">{user?.name}</div>
            <div className="truncate text-[11px] text-slate-400">{user?.username}@pos</div>
          </div>
        </div>
        <BranchSwitcher fallback={branch} />
        <button
          onClick={() => { logout(); navigate('/login'); }}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-rose-500/90 px-3 py-2.5 text-sm font-bold text-white hover:bg-rose-500"
        >
          ⎋ {th.signOut}
        </button>
      </div>
    </aside>
  );
}

function BranchSwitcher({ fallback }: { fallback?: string }) {
  const { branches, activeId, setActive, active } = useBranch();
  const cur = active();

  // No branch context yet (single-branch shop or not loaded) — show a static pill.
  if (branches.length <= 1) {
    return (
      <div className="flex w-full items-center gap-2 rounded-xl bg-white/5 px-3 py-2 text-xs font-semibold text-slate-300 ring-1 ring-white/10">
        <span>🏪</span>
        <span className="truncate">{cur?.name || fallback || th.branch}</span>
      </div>
    );
  }

  return (
    <label className="flex w-full items-center gap-2 rounded-xl bg-white/5 px-3 py-2 text-xs font-semibold text-slate-300 ring-1 ring-white/10 focus-within:ring-brand-400/60">
      <span>🏪</span>
      <select
        value={activeId ?? cur?.id}
        onChange={(e) => setActive(Number(e.target.value))}
        className="min-w-0 flex-1 cursor-pointer truncate bg-transparent font-semibold text-slate-200 outline-none [&>option]:text-slate-900"
        title={th.switchBranch}
      >
        {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
      </select>
      <span className="text-slate-500">▾</span>
    </label>
  );
}
