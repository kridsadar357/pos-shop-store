import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../store/auth';

interface NavItem {
  to: string;
  label: string;
  icon: string;
  end?: boolean;
  adminOnly?: boolean;
}

const NAV_GROUPS: { section: string; items: NavItem[] }[] = [
  {
    section: 'Overview',
    items: [{ to: '/back', label: 'Dashboard', icon: '▣', end: true }],
  },
  {
    section: 'Catalog',
    items: [
      { to: '/back/products', label: 'Products & Stock', icon: '▦' },
      { to: '/back/members', label: 'Members', icon: '🪪' },
      { to: '/back/promotions', label: 'Promotions', icon: '🏷️' },
    ],
  },
  {
    section: 'Operations',
    items: [
      { to: '/back/receive', label: 'Receive Goods', icon: '⬇' },
      { to: '/back/stock-count', label: 'Stock Count', icon: '✓' },
      { to: '/back/movements', label: 'Stock Ledger', icon: '↺' },
      { to: '/back/sales', label: 'Sales', icon: '🧾' },
      { to: '/back/shifts', label: 'Shifts', icon: '🕒' },
    ],
  },
  {
    section: 'Insights',
    items: [{ to: '/back/reports', label: 'Reports', icon: '📊' }],
  },
  {
    section: 'Admin',
    items: [
      { to: '/back/settings', label: 'Settings', icon: '⚙' },
      { to: '/back/users', label: 'Users', icon: '👤', adminOnly: true },
    ],
  },
];

const ALL = NAV_GROUPS.flatMap((g) => g.items);

export function BackLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const active = [...ALL].sort((a, b) => b.to.length - a.to.length).find((n) => (n.end ? pathname === n.to : pathname.startsWith(n.to)));

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      {/* Sidebar */}
      <aside className="flex w-64 flex-col bg-ink-900 text-slate-300">
        <div className="flex items-center gap-3 px-5 py-5">
          <div className="grid h-10 w-10 place-items-center rounded-2xl bg-gradient-to-br from-brand-400 to-brand-600 text-lg font-extrabold text-white shadow-glow">P</div>
          <div>
            <div className="text-sm font-bold text-white">POS Back-office</div>
            <div className="text-[11px] text-slate-400">Retail &amp; Wholesale</div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 pb-3">
          {NAV_GROUPS.map((group) => {
            const items = group.items.filter((n) => !n.adminOnly || user?.role === 'ADMIN');
            if (!items.length) return null;
            return (
              <div key={group.section}>
                <div className="section-label">{group.section}</div>
                {items.map((n) => (
                  <NavLink
                    key={n.to}
                    to={n.to}
                    end={n.end}
                    className={({ isActive }) =>
                      `group mb-0.5 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                        isActive ? 'bg-white/10 text-white' : 'text-slate-300 hover:bg-white/5 hover:text-white'
                      }`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <span className={`grid h-7 w-7 place-items-center rounded-lg text-sm ${isActive ? 'bg-brand-500 text-white' : 'bg-white/5 text-slate-400 group-hover:text-slate-200'}`}>
                          {n.icon}
                        </span>
                        {n.label}
                      </>
                    )}
                  </NavLink>
                ))}
              </div>
            );
          })}
        </nav>

        <div className="border-t border-white/10 p-3">
          <button
            onClick={() => navigate('/pos')}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-brand-500 to-brand-600 px-3 py-2.5 text-sm font-bold text-white shadow-glow"
          >
            🛒 Open Front POS
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white/80 px-6 py-3 backdrop-blur">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{active && NAV_GROUPS.find((g) => g.items.includes(active))?.section}</div>
            <div className="text-sm font-bold text-ink-900">{active?.label ?? 'Back-office'}</div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-2.5 rounded-xl bg-slate-50 px-3 py-1.5 ring-1 ring-slate-200 sm:flex">
              <div className="grid h-7 w-7 place-items-center rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-xs font-bold text-white">
                {user?.name?.charAt(0)}
              </div>
              <div className="leading-tight">
                <div className="text-xs font-bold text-ink-900">{user?.name}</div>
                <div className="text-[10px] font-semibold uppercase tracking-wide text-brand-600">{user?.role}</div>
              </div>
            </div>
            <button onClick={() => { logout(); navigate('/login'); }} className="btn-ghost">Sign out</button>
          </div>
        </header>

        <main className="flex-1 overflow-auto p-6">
          <div className="mx-auto max-w-7xl animate-rise">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
