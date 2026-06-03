import { lazy, Suspense, useEffect, useState } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { isBackStore, useAuth, type Role } from './store/auth';
import { useBranch } from './store/branch';
import { api, setOnUnauthorized } from './api/client';
import { ToastHost } from './components/Toast';
import type { LicenseState } from './types';

// Route-level code splitting: each surface loads its own chunk, keeping the
// POS / customer-display / login shell (the PWA-installed surfaces) lean and
// pushing heavy back-office libs (recharts, xlsx, jszip) into on-demand chunks.
const Login = lazy(() => import('./pages/Login'));
const Setup = lazy(() => import('./pages/Setup'));
const Display = lazy(() => import('./pages/Display'));
const POS = lazy(() => import('./pages/front/POS'));
const BackLayout = lazy(() => import('./components/BackLayout').then((m) => ({ default: m.BackLayout })));
const Dashboard = lazy(() => import('./pages/back/Dashboard'));
const Products = lazy(() => import('./pages/back/Products'));
const Receive = lazy(() => import('./pages/back/Receive'));
const PurchaseOrders = lazy(() => import('./pages/back/PurchaseOrders'));
const Transfers = lazy(() => import('./pages/back/Transfers'));
const StockCount = lazy(() => import('./pages/back/StockCount'));
const Movements = lazy(() => import('./pages/back/Movements'));
const Serials = lazy(() => import('./pages/back/Serials'));
const Reports = lazy(() => import('./pages/back/Reports'));
const CustomReports = lazy(() => import('./pages/back/CustomReports'));
const Sales = lazy(() => import('./pages/back/Sales'));
const Returns = lazy(() => import('./pages/back/Returns'));
const Members = lazy(() => import('./pages/back/Members'));
const Suppliers = lazy(() => import('./pages/back/Suppliers'));
const Promotions = lazy(() => import('./pages/back/Promotions'));
const Shifts = lazy(() => import('./pages/back/Shifts'));
const Expenses = lazy(() => import('./pages/back/Expenses'));
const Payables = lazy(() => import('./pages/back/Payables'));
const TaxInvoices = lazy(() => import('./pages/back/TaxInvoices'));
const Labels = lazy(() => import('./pages/back/Labels'));
const GiftCards = lazy(() => import('./pages/back/GiftCards'));
const Quotations = lazy(() => import('./pages/back/Quotations'));
const Layaways = lazy(() => import('./pages/back/Layaways'));
const Settings = lazy(() => import('./pages/back/Settings'));
const Users = lazy(() => import('./pages/back/Users'));
const Branches = lazy(() => import('./pages/back/Branches'));
const AuditLog = lazy(() => import('./pages/back/AuditLog'));
const Backup = lazy(() => import('./pages/back/Backup'));

function Loader() {
  return <div className="grid min-h-screen place-items-center bg-ink-950 text-brand-300"><i className="fa-solid fa-spinner fa-spin text-3xl" /></div>;
}

function Protected({ roles, children }: { roles: Role[]; children: JSX.Element }) {
  const user = useAuth((s) => s.user);
  if (!user) return <Navigate to="/login" replace />;
  if (!roles.includes(user.role)) {
    return <Navigate to={isBackStore(user.role) ? '/back' : '/pos'} replace />;
  }
  return children;
}

export default function App() {
  const { user, restore } = useAuth();
  const navigate = useNavigate();
  const [setupDone, setSetupDone] = useState<boolean | null>(null);
  const [license, setLicense] = useState<LicenseState | null>(null);

  const refreshLicense = () => api<LicenseState>('/license/status').then(setLicense).catch(() => {});

  useEffect(() => {
    restore();
    setOnUnauthorized(() => { useAuth.getState().logout(); navigate('/login'); });
    api<{ setupCompleted: boolean }>('/setup/status').then((r) => setSetupDone(r.setupCompleted)).catch(() => setSetupDone(true));
    refreshLicense();
  }, []);
  useEffect(() => { if (user) { refreshLicense(); useBranch.getState().load(); } }, [user]);

  // Wait until we know whether first-run setup is needed (avoids a flash).
  if (setupDone === null) {
    return <div className="grid min-h-screen place-items-center bg-ink-950 text-brand-300"><i className="fa-solid fa-spinner fa-spin text-3xl" /></div>;
  }

  // First-run installation wizard takes over everything until completed.
  if (!setupDone) {
    return (
      <>
        <Suspense fallback={<Loader />}>
          <Routes>
            <Route path="/setup" element={<Setup />} />
            <Route path="*" element={<Navigate to="/setup" replace />} />
          </Routes>
        </Suspense>
        <ToastHost />
      </>
    );
  }

  return (
    <>
      <Suspense fallback={<Loader />}>
      <Routes>
        <Route path="/setup" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={user ? <Navigate to={isBackStore(user.role) ? '/back' : '/pos'} replace /> : <Login />} />

        {/* Customer-facing second display — no auth, just listens for state. */}
        <Route path="/display" element={<Display />} />

        <Route path="/pos" element={<Protected roles={['CASHIER', 'MANAGER', 'ADMIN']}><POS /></Protected>} />

        <Route path="/back" element={<Protected roles={['ADMIN', 'MANAGER']}><BackLayout /></Protected>}>
          <Route index element={<Dashboard />} />
          <Route path="products" element={<Products />} />
          <Route path="receive" element={<Receive />} />
          <Route path="purchase-orders" element={<PurchaseOrders />} />
          <Route path="transfers" element={<Transfers />} />
          <Route path="stock-count" element={<StockCount />} />
          <Route path="movements" element={<Movements />} />
          <Route path="sales" element={<Sales />} />
          <Route path="returns" element={<Returns />} />
          <Route path="members" element={<Members />} />
          <Route path="suppliers" element={<Suppliers />} />
          <Route path="promotions" element={<Promotions />} />
          <Route path="shifts" element={<Shifts />} />
          <Route path="expenses" element={<Expenses />} />
          <Route path="payables" element={<Payables />} />
          <Route path="tax-invoices" element={<TaxInvoices />} />
          <Route path="labels" element={<Labels />} />
          <Route path="gift-cards" element={<GiftCards />} />
          <Route path="quotations" element={<Quotations />} />
          <Route path="layaways" element={<Layaways />} />
          <Route path="serials" element={<Serials />} />
          <Route path="reports" element={<Reports />} />
          <Route path="custom-reports" element={<CustomReports />} />
          <Route path="settings" element={<Settings />} />
          <Route path="branches" element={<Branches />} />
          <Route path="users" element={<Users />} />
          <Route path="audit" element={<AuditLog />} />
          <Route path="backup" element={<Backup />} />
        </Route>

        <Route path="*" element={<Navigate to={user ? (isBackStore(user.role) ? '/back' : '/pos') : '/login'} replace />} />
      </Routes>
      </Suspense>

      {user && <LicenseBadge license={license} />}
      <ToastHost />
    </>
  );
}

/** Demo-days pill, and a blocking overlay once the license/demo has expired. */
function LicenseBadge({ license }: { license: LicenseState | null }) {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  if (!license) return null;

  if (license.status === 'EXPIRED') {
    return (
      <div className="fixed inset-0 z-[100] grid place-items-center bg-black/70 p-4">
        <div className="max-w-sm rounded-2xl bg-white p-7 text-center shadow-pop">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-rose-50 text-3xl text-rose-500 ring-1 ring-rose-100"><i className="fa-solid fa-lock" /></div>
          <h2 className="mt-4 text-xl font-extrabold text-ink-900">ไลเซนส์หมดอายุ</h2>
          <p className="mt-1 text-sm text-slate-500">การทดลองใช้ {license.demoDays} วันสิ้นสุดแล้ว กรุณาเปิดใช้งานด้วยรหัสไลเซนส์เพื่อใช้งานต่อ</p>
          <div className="mt-5 flex gap-2">
            <button className="btn-ghost flex-1" onClick={() => { logout(); navigate('/login'); }}>ออกจากระบบ</button>
            {user?.role === 'ADMIN'
              ? <button className="btn-primary flex-1" onClick={() => navigate('/back/settings')}>เปิดใช้งานไลเซนส์</button>
              : <span className="flex-1 self-center text-xs text-slate-400">ติดต่อผู้ดูแลระบบ</span>}
          </div>
        </div>
      </div>
    );
  }

  if (license.status === 'DEMO') {
    return (
      <button
        onClick={() => user?.role === 'ADMIN' && navigate('/back/settings')}
        className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-full bg-amber-500 px-4 py-2 text-xs font-bold text-white shadow-pop transition hover:brightness-105"
        title="จัดการไลเซนส์"
      >
        <i className="fa-solid fa-hourglass-half" /> ทดลองใช้ · เหลือ {license.daysLeft} วัน
      </button>
    );
  }
  return null;
}
