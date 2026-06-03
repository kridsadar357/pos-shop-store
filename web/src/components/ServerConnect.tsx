import { useState } from 'react';
import { Modal } from './Modal';
import { getApiBase, setApiBase } from '../api/client';
import { toast } from './Toast';
import { th } from '../lib/th';

// Setup step for running the POS as a desktop / LAN client: point it at the shop's server.
// Empty = same-origin (the server that served this app). Tests GET <url>/health before saving.
export function ServerConnect({ onClose }: { onClose: () => void }) {
  const [url, setUrl] = useState(getApiBase());
  const [busy, setBusy] = useState(false);

  async function check(save: boolean) {
    const base = url.trim().replace(/\/+$/, '');
    setBusy(true);
    try {
      const res = await fetch(`${base}/health`);
      const data = res.ok ? await res.json().catch(() => null) : null;
      if (!res.ok || !data?.ok) throw new Error(`HTTP ${res.status}`);
      if (save) {
        setApiBase(base);
        toast.success(th.serverSaved);
        setTimeout(() => location.reload(), 500); // reapply the base everywhere
      } else {
        toast.success(th.serverReachable);
      }
    } catch (e) {
      toast.error(`${th.serverUnreachable} (${(e as Error).message})`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={th.serverConnect} onClose={onClose}>
      <div className="space-y-3">
        <label className="block text-sm font-semibold text-slate-600">
          {th.serverUrl}
          <input
            className="input mt-1 w-full"
            placeholder="http://192.168.1.50:4000"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            autoFocus
          />
        </label>
        <p className="text-xs text-slate-400">{th.serverHint}</p>
        <div className="flex gap-2">
          <button className="btn-ghost flex-1" disabled={busy} onClick={() => check(false)}>
            <i className="fa-solid fa-plug-circle-check mr-1.5" />{th.testConnection}
          </button>
          <button className="btn-primary flex-1" disabled={busy} onClick={() => check(true)}>
            <i className="fa-solid fa-floppy-disk mr-1.5" />{th.save}
          </button>
        </div>
      </div>
    </Modal>
  );
}
