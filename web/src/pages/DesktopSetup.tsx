import { useState } from 'react';
import { setApiBase } from '../api/client';
import { toast } from '../components/Toast';
import { th } from '../lib/th';

// First-run setup wizard for the desktop app: pick whether THIS machine is the shop's
// server (hosts the API/DB) or a register that connects to one. Persists the role +
// server URL, then reloads so the rest of the app runs against it. (Auto-launching the
// local server in Server mode is a later phase — for now it points at localhost.)
const ROLE_KEY = 'pos_role';
const LOCAL_SERVER = 'http://localhost:4000';

export default function DesktopSetup() {
  const [role, setRole] = useState<'client' | 'server' | null>(null);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);

  async function finish(chosenRole: 'client' | 'server', base: string) {
    setBusy(true);
    try {
      const res = await fetch(`${base}/health`);
      const data = res.ok ? await res.json().catch(() => null) : null;
      if (!res.ok || !data?.ok) throw new Error(`HTTP ${res.status}`);
      setApiBase(base);
      localStorage.setItem(ROLE_KEY, chosenRole);
      // Tell the native Tauri shell the role too, so a Server terminal can launch the local
      // API server on next start (no-op in a plain browser — __TAURI__ is absent).
      try {
        const invoke = (window as unknown as { __TAURI__?: { core?: { invoke?: (cmd: string, args: unknown) => Promise<unknown> } } }).__TAURI__?.core?.invoke;
        if (invoke) await invoke('set_desktop_role', { role: chosenRole });
      } catch { /* native bridge optional */ }
      toast.success(th.serverSaved);
      setTimeout(() => location.reload(), 500);
    } catch (e) {
      toast.error(`${th.serverUnreachable} (${(e as Error).message})`);
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-gradient-to-br from-ink-950 to-ink-900 p-6 text-slate-200">
      <div className="card w-full max-w-lg bg-white p-8 text-ink-900">
        <div className="mb-1 flex items-center gap-2 text-brand-600">
          <i className="fa-solid fa-desktop text-xl" />
          <span className="text-xs font-bold uppercase tracking-[0.2em]">POS Suite · Desktop</span>
        </div>
        <h1 className="text-2xl font-extrabold tracking-tight">{th.desktopSetupTitle}</h1>
        <p className="mt-1 text-sm text-slate-500">{th.desktopSetupSub}</p>

        {!role && (
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <button onClick={() => setRole('server')} className="rounded-2xl p-5 text-left ring-1 ring-slate-200 transition hover:-translate-y-0.5 hover:ring-brand-300 hover:shadow-pop">
              <i className="fa-solid fa-server text-2xl text-brand-600" />
              <div className="mt-2 font-bold">{th.roleServer}</div>
              <div className="mt-1 text-xs text-slate-500">{th.roleServerHint}</div>
            </button>
            <button onClick={() => setRole('client')} className="rounded-2xl p-5 text-left ring-1 ring-slate-200 transition hover:-translate-y-0.5 hover:ring-brand-300 hover:shadow-pop">
              <i className="fa-solid fa-cash-register text-2xl text-brand-600" />
              <div className="mt-2 font-bold">{th.roleClient}</div>
              <div className="mt-1 text-xs text-slate-500">{th.roleClientHint}</div>
            </button>
          </div>
        )}

        {role === 'server' && (
          <div className="mt-6 space-y-3">
            <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800 ring-1 ring-amber-200">
              <i className="fa-solid fa-circle-info mr-1" />{th.roleServerNote}
            </p>
            <div className="flex gap-2">
              <button className="btn-ghost flex-1" disabled={busy} onClick={() => setRole(null)}>{th.back}</button>
              <button className="btn-primary flex-1" disabled={busy} onClick={() => finish('server', LOCAL_SERVER)}>
                <i className="fa-solid fa-plug-circle-check mr-1.5" />{th.connectThisMachine}
              </button>
            </div>
          </div>
        )}

        {role === 'client' && (
          <div className="mt-6 space-y-3">
            <label className="block text-sm font-semibold text-slate-600">
              {th.serverUrl}
              <input className="input mt-1 w-full" placeholder="http://192.168.1.50:4000" value={url} onChange={(e) => setUrl(e.target.value)} autoFocus />
            </label>
            <p className="text-xs text-slate-400">{th.serverHint}</p>
            <div className="flex gap-2">
              <button className="btn-ghost flex-1" disabled={busy} onClick={() => setRole(null)}>{th.back}</button>
              <button className="btn-primary flex-1" disabled={busy || !url.trim()} onClick={() => finish('client', url.trim().replace(/\/+$/, ''))}>
                <i className="fa-solid fa-plug-circle-check mr-1.5" />{th.testConnection}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
