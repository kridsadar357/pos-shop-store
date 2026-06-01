import { useEffect, useState } from 'react';
import { useShift } from '../../store/shift';
import { useAuth } from '../../store/auth';
import { api } from '../../api/client';
import { toast } from '../../components/Toast';
import { money, num } from '../../lib/format';
import { th } from '../../lib/th';
import type { CashMovement, Shift } from '../../types';

/** Full-screen gate shown when the cashier has no open shift. */
export function ShiftGate() {
  const { user, logout } = useAuth();
  const { open } = useShift();
  const [float, setFloat] = useState(1000);
  const [busy, setBusy] = useState(false);

  async function start() {
    setBusy(true);
    try {
      await open(float);
      toast.success(th.startSelling);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-gradient-to-br from-ink-900 to-ink-800 p-6">
      <div className="card w-full max-w-md p-8">
        <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-brand-600 text-2xl text-white">🔓</div>
        <h1 className="text-center text-2xl font-bold">{th.openShiftTitle}</h1>
        <p className="mt-1 text-center text-sm text-slate-500">{th.openShiftHint}</p>
        <div className="mt-6">
          <label className="label">{th.openingFloat}</label>
          <input
            type="number"
            className="input text-lg"
            value={float || ''}
            autoFocus
            onChange={(e) => setFloat(Number(e.target.value))}
            onKeyDown={(e) => e.key === 'Enter' && start()}
          />
          <div className="mt-3 flex flex-wrap gap-2">
            {[500, 1000, 2000, 3000].map((v) => (
              <button key={v} className="btn-ghost" onClick={() => setFloat(v)}>{money(v)}</button>
            ))}
          </div>
        </div>
        <button className="btn-primary mt-6 w-full py-3" disabled={busy} onClick={start}>{th.startSelling}</button>
        <button className="mt-2 w-full text-sm text-slate-400" onClick={() => { logout(); }}>{user?.name} • {th.signOut}</button>
      </div>
    </div>
  );
}

/** Close-shift modal with cash reconciliation, then a summary. */
export function CloseShiftModal({ onClose }: { onClose: () => void }) {
  const { current, close } = useShift();
  const [counted, setCounted] = useState(0);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Shift | null>(null);

  if (!current) return null;
  const expected = num(current.expectedCash ?? 0);
  const totals = current.totals;

  async function confirm() {
    setBusy(true);
    try {
      const closed = await close(counted, note);
      setResult(closed);
      toast.success(th.shiftClosed);
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={result ? onClose : undefined}>
      <div className="card w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        {!result ? (
          <>
            <h3 className="text-xl font-bold">{th.closeShiftTitle}</h3>
            <div className="mt-4 space-y-1.5 rounded-xl bg-slate-50 p-4 text-sm">
              <Row label={th.openingFloat} value={money(current.openingFloat)} />
              <Row label={th.cashSales} value={money(totals?.cashSales ?? 0)} />
              {num(totals?.payIn ?? 0) > 0 && <Row label={th.payIn} value={`+${money(totals?.payIn ?? 0)}`} />}
              {num(totals?.payOut ?? 0) > 0 && <Row label={th.payOut} value={`−${money(totals?.payOut ?? 0)}`} />}
              <Row label={th.transferSales} value={money(totals?.transferSales ?? 0)} muted />
              <Row label={th.orders} value={String(totals?.orders ?? 0)} muted />
              <div className="border-t border-slate-200 pt-1.5">
                <Row label={th.expectedCash} value={money(expected)} bold />
              </div>
            </div>
            <div className="mt-4">
              <label className="label">{th.countedCash}</label>
              <input type="number" className="input text-lg" value={counted || ''} autoFocus onChange={(e) => setCounted(Number(e.target.value))} />
            </div>
            <div className="mt-3 flex items-center justify-between rounded-xl bg-slate-50 p-4">
              <span className="font-semibold text-slate-500">{th.difference}</span>
              <span className={`text-xl font-extrabold ${counted - expected === 0 ? 'text-slate-700' : counted - expected > 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                {counted - expected > 0 ? '+' : ''}{money(counted - expected)}
              </span>
            </div>
            <textarea className="input mt-3" rows={2} placeholder="หมายเหตุ (ถ้ามี)" value={note} onChange={(e) => setNote(e.target.value)} />
            <div className="mt-5 flex gap-2">
              <button className="btn-ghost flex-1" onClick={onClose} disabled={busy}>{th.cancel}</button>
              <button className="btn-danger flex-1" onClick={confirm} disabled={busy}>{busy ? th.processing : th.confirmClose}</button>
            </div>
          </>
        ) : (
          <div className="text-center">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-emerald-100 text-3xl text-emerald-600">✓</div>
            <h3 className="mt-3 text-lg font-bold">{th.shiftClosed}</h3>
            <div className="mt-4 space-y-1.5 rounded-xl bg-slate-50 p-4 text-left text-sm">
              <Row label={th.cashSales} value={money(result.totals?.cashSales ?? 0)} />
              <Row label={th.transferSales} value={money(result.totals?.transferSales ?? 0)} />
              <Row label={th.expectedCash} value={money(result.expectedCash ?? 0)} />
              <Row label={th.countedCash} value={money(result.countedCash ?? 0)} />
              <div className="border-t border-slate-200 pt-1.5">
                <Row label={th.difference} value={money(result.cashDiff ?? 0)} bold />
              </div>
            </div>
            <button className="btn-primary mt-5 w-full" onClick={onClose}>{th.openShift}</button>
          </div>
        )}
      </div>
    </div>
  );
}

/** Petty-cash modal: record a drawer pay-in or pay-out against the open shift. */
export function CashDrawerModal({ onClose }: { onClose: () => void }) {
  const { current, cashInOut } = useShift();
  const [type, setType] = useState<'PAY_IN' | 'PAY_OUT'>('PAY_OUT');
  const [amount, setAmount] = useState(0);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [moves, setMoves] = useState<CashMovement[]>([]);

  const shiftId = current?.id;
  useEffect(() => {
    if (!shiftId) return;
    api<CashMovement[]>(`/shifts/${shiftId}/cash`).then(setMoves).catch(() => setMoves([]));
  }, [shiftId, busy]);

  if (!current) return null;

  async function submit() {
    if (amount <= 0) return toast.error(th.amount);
    setBusy(true);
    try {
      await cashInOut(type, amount, reason.trim());
      toast.success(th.cashRecorded);
      setAmount(0);
      setReason('');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={onClose}>
      <div className="card w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-bold"><i className="fa-solid fa-money-bill-transfer mr-2 text-brand-600" />{th.cashDrawerTitle}</h3>
          <button className="text-slate-400 hover:text-slate-600" onClick={onClose}><i className="fa-solid fa-xmark text-lg" /></button>
        </div>
        <div className="mt-2 flex items-center justify-between rounded-xl bg-slate-50 px-4 py-2.5 text-sm">
          <span className="text-slate-500">{th.expectedCash}</span>
          <span className="font-extrabold text-slate-700">{money(num(current.expectedCash ?? 0))}</span>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            className={`flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold ring-1 transition ${type === 'PAY_IN' ? 'bg-emerald-600 text-white ring-emerald-600' : 'bg-white text-slate-500 ring-slate-200 hover:bg-slate-50'}`}
            onClick={() => setType('PAY_IN')}
          ><i className="fa-solid fa-arrow-down-to-bracket" /> {th.payIn}</button>
          <button
            className={`flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold ring-1 transition ${type === 'PAY_OUT' ? 'bg-rose-600 text-white ring-rose-600' : 'bg-white text-slate-500 ring-slate-200 hover:bg-slate-50'}`}
            onClick={() => setType('PAY_OUT')}
          ><i className="fa-solid fa-arrow-up-from-bracket" /> {th.payOut}</button>
        </div>

        <div className="mt-4">
          <label className="label">{th.amount}</label>
          <input type="number" className="input text-lg" value={amount || ''} autoFocus onChange={(e) => setAmount(Number(e.target.value))} onKeyDown={(e) => e.key === 'Enter' && submit()} />
          <div className="mt-2 flex flex-wrap gap-2">
            {[100, 200, 500, 1000].map((v) => (
              <button key={v} className="btn-ghost" onClick={() => setAmount((a) => a + v)}>+{money(v)}</button>
            ))}
          </div>
        </div>

        <div className="mt-3">
          <label className="label">{th.cashReason}</label>
          <input className="input" placeholder={th.cashReasonHint} value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>

        <button className="btn-primary mt-5 w-full py-3" disabled={busy} onClick={submit}>{busy ? th.processing : th.recordCash}</button>

        <div className="mt-4 max-h-40 overflow-auto rounded-xl bg-slate-50 p-1">
          {moves.length === 0 ? (
            <p className="px-3 py-3 text-center text-sm text-slate-400">{th.noCashMoves}</p>
          ) : moves.map((m) => (
            <div key={m.id} className="flex items-center justify-between px-3 py-2 text-sm">
              <span className="flex items-center gap-2">
                <span className={`grid h-6 w-6 place-items-center rounded-lg text-xs ${m.type === 'PAY_IN' ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'}`}>
                  <i className={`fa-solid ${m.type === 'PAY_IN' ? 'fa-arrow-down' : 'fa-arrow-up'}`} />
                </span>
                <span className="text-slate-600">{m.reason || (m.type === 'PAY_IN' ? th.payIn : th.payOut)}</span>
              </span>
              <span className={`font-bold ${m.type === 'PAY_IN' ? 'text-emerald-600' : 'text-rose-500'}`}>{m.type === 'PAY_IN' ? '+' : '−'}{money(m.amount)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, muted, bold }: { label: string; value: string; muted?: boolean; bold?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className={muted ? 'text-slate-400' : 'text-slate-600'}>{label}</span>
      <span className={bold ? 'font-extrabold' : muted ? 'text-slate-500' : 'font-semibold'}>{value}</span>
    </div>
  );
}
