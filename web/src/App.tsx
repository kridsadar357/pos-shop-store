import { useEffect } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { isBackStore, useAuth, type Role } from './store/auth';
import { setOnUnauthorized } from './api/client';
import { ToastHost } from './components/Toast';
import { BackLayout } from './components/BackLayout';
import Login from './pages/Login';
import Display from './pages/Display';
import POS from './pages/front/POS';
import Dashboard from './pages/back/Dashboard';
import Products from './pages/back/Products';
import Receive from './pages/back/Receive';
import StockCount from './pages/back/StockCount';
import Movements from './pages/back/Movements';
import Reports from './pages/back/Reports';
import Sales from './pages/back/Sales';
import Members from './pages/back/Members';
import Suppliers from './pages/back/Suppliers';
import Promotions from './pages/back/Promotions';
import Shifts from './pages/back/Shifts';
import Settings from './pages/back/Settings';
import Users from './pages/back/Users';

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

  useEffect(() => {
    restore();
    setOnUnauthorized(() => {
      useAuth.getState().logout();
      navigate('/login');
    });
  }, []);

  return (
    <>
      <Routes>
        <Route
          path="/login"
          element={user ? <Navigate to={isBackStore(user.role) ? '/back' : '/pos'} replace /> : <Login />}
        />

        {/* Customer-facing second display — no auth, just listens for state. */}
        <Route path="/display" element={<Display />} />

        <Route
          path="/pos"
          element={
            <Protected roles={['CASHIER', 'MANAGER', 'ADMIN']}>
              <POS />
            </Protected>
          }
        />

        <Route
          path="/back"
          element={
            <Protected roles={['ADMIN', 'MANAGER']}>
              <BackLayout />
            </Protected>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="products" element={<Products />} />
          <Route path="receive" element={<Receive />} />
          <Route path="stock-count" element={<StockCount />} />
          <Route path="movements" element={<Movements />} />
          <Route path="sales" element={<Sales />} />
          <Route path="members" element={<Members />} />
          <Route path="suppliers" element={<Suppliers />} />
          <Route path="promotions" element={<Promotions />} />
          <Route path="shifts" element={<Shifts />} />
          <Route path="reports" element={<Reports />} />
          <Route path="settings" element={<Settings />} />
          <Route path="users" element={<Users />} />
        </Route>

        <Route path="*" element={<Navigate to={user ? (isBackStore(user.role) ? '/back' : '/pos') : '/login'} replace />} />
      </Routes>
      <ToastHost />
    </>
  );
}
