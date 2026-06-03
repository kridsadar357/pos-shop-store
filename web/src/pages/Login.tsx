import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { isBackStore, useAuth } from '../store/auth';
import { toast } from '../components/Toast';
import { ServerConnect } from '../components/ServerConnect';
import { LangToggle } from '../components/LangToggle';
import { getApiBase } from '../api/client';
import { th } from '../lib/th';

const QUICK = [
  { username: 'admin', password: 'admin123', label: 'Admin' },
  { username: 'manager', password: 'manager123', label: 'Manager' },
  { username: 'cashier', password: 'cashier123', label: 'Cashier' },
];

export default function Login() {
  const { login, loading } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showServer, setShowServer] = useState(false);

  async function submit(u: string, p: string) {
    try {
      await login(u, p);
      const role = useAuth.getState().user?.role;
      navigate(isBackStore(role) ? '/back' : '/pos');
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-ink-900 p-12 text-white lg:flex">
        {/* ambient emerald glow */}
        <div className="pointer-events-none absolute -left-24 -top-24 h-96 w-96 rounded-full bg-brand-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 right-0 h-96 w-96 rounded-full bg-brand-600/15 blur-3xl" />
        <div className="relative flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-brand-400 to-brand-600 text-xl font-extrabold shadow-glow">P</div>
          <span className="text-lg font-bold">POS Shop Store</span>
        </div>
        <div className="relative">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-brand-200 ring-1 ring-white/10">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-400" /> Enterprise Point of Sale
          </div>
          <h1 className="text-[2.6rem] font-extrabold leading-[1.1] tracking-tight">
            Retail &amp; Wholesale,<br />one clean register.
          </h1>
          <p className="mt-4 max-w-md text-slate-300/90">
            Lightning-fast checkout with barcode auto-scan, cash &amp; PromptPay QR payments,
            shift control, members, and a professional inventory back-office with full stock traceability.
          </p>
          <div className="mt-9 grid max-w-md grid-cols-3 gap-3">
            {[
              { k: 'QR', v: 'PromptPay + amount' },
              { k: '↺', v: 'Backtrack ledger' },
              { k: '⚡', v: 'Auto-scan' },
            ].map((f) => (
              <div key={f.v} className="rounded-2xl bg-white/5 p-3.5 ring-1 ring-white/10">
                <div className="text-2xl font-bold text-brand-300">{f.k}</div>
                <div className="mt-1 text-xs text-slate-400">{f.v}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="relative text-xs text-slate-500">Enterprise POS • PostgreSQL • React</div>
      </div>

      <div className="flex items-center justify-center bg-gradient-to-br from-slate-50 to-brand-50/40 p-6">
        <div className="card w-full max-w-sm animate-rise p-8">
          <div className="mb-3 flex justify-end"><LangToggle /></div>
          <h2 className="text-2xl font-extrabold tracking-tight">Welcome back</h2>
          <p className="mt-1 text-sm text-slate-500">Sign in to your register.</p>

          <form
            className="mt-6 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              submit(username, password);
            }}
          >
            <div>
              <label className="label">Username</label>
              <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
            </div>
            <div>
              <label className="label">Password</label>
              <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <button className="btn-primary w-full" disabled={loading}>
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <div className="mt-6">
            <div className="mb-2 text-center text-xs font-semibold uppercase tracking-wide text-slate-400">
              Quick demo login
            </div>
            <div className="grid grid-cols-3 gap-2">
              {QUICK.map((q) => (
                <button key={q.username} className="btn-ghost text-xs" onClick={() => submit(q.username, q.password)}>
                  {q.label}
                </button>
              ))}
            </div>
          </div>

          <button onClick={() => setShowServer(true)} className="mt-6 flex w-full items-center justify-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-brand-600">
            <i className="fa-solid fa-server" /> {th.serverConnect}
            {getApiBase() && <span className="truncate font-normal text-slate-400">· {getApiBase()}</span>}
          </button>
        </div>
      </div>
      {showServer && <ServerConnect onClose={() => setShowServer(false)} />}
    </div>
  );
}
