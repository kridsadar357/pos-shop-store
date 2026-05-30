import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { QRCanvas } from '../../components/QRCode';
import { money } from '../../lib/format';
import { th } from '../../lib/th';
import type { Setting } from '../../types';

interface Props {
  total: number;
  currency: string;
  setting: Setting;
  onCancel: () => void;
  onConfirm: (p: { method: 'CASH' | 'TRANSFER'; cashReceived?: number; ref?: string }) => Promise<void>;
  onPaymentDisplay?: (method: 'CASH' | 'TRANSFER', qrPayload?: string) => void;
}

const QUICK_CASH = [20, 50, 100, 500, 1000];

export function PaymentModal({ total, currency, setting, onCancel, onConfirm, onPaymentDisplay }: Props) {
  const [method, setMethod] = useState<'CASH' | 'TRANSFER'>('CASH');
  const [cash, setCash] = useState<number>(0);
  const [qr, setQr] = useState<string>('');
  const [busy, setBusy] = useState(false);

  const change = Math.max(0, cash - total);
  const enough = cash >= total;

  // Preview PromptPay QR with the exact amount when switching to transfer.
  useEffect(() => {
    if (method !== 'TRANSFER') {
      onPaymentDisplay?.('CASH');
      return;
    }
    setQr('');
    api<{ payload: string }>('/settings/promptpay', { query: { amount: total.toFixed(2) } })
      .then((r) => {
        setQr(r.payload);
        onPaymentDisplay?.('TRANSFER', r.payload); // mirror QR to the customer display
      })
      .catch(() => setQr(''));
  }, [method, total]);

  async function confirm() {
    setBusy(true);
    try {
      await onConfirm(
        method === 'CASH'
          ? { method, cashReceived: cash }
          : { method, ref: 'PromptPay' }
      );
    } catch {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={onCancel}>
      <div className="card w-full max-w-lg p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-bold">{th.takePayment}</h3>
          <span className="text-2xl font-extrabold text-brand-700">{money(total, currency)}</span>
        </div>

        {/* Method tabs */}
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button
            onClick={() => setMethod('CASH')}
            className={`rounded-xl py-3 text-sm font-semibold ring-1 transition ${method === 'CASH' ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-slate-600 ring-slate-200'}`}
          >
            💵 {th.cash}
          </button>
          <button
            onClick={() => setMethod('TRANSFER')}
            className={`rounded-xl py-3 text-sm font-semibold ring-1 transition ${method === 'TRANSFER' ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-slate-600 ring-slate-200'}`}
          >
            📱 {th.transfer}
          </button>
        </div>

        {method === 'CASH' ? (
          <div className="mt-5">
            <label className="label">{th.cashReceived}</label>
            <input
              type="number"
              className="input text-lg"
              value={cash || ''}
              autoFocus
              onChange={(e) => setCash(Number(e.target.value))}
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <button className="btn-ghost" onClick={() => setCash(total)}>{th.exact}</button>
              {QUICK_CASH.map((c) => (
                <button key={c} className="btn-ghost" onClick={() => setCash((v) => v + c)}>+{c}</button>
              ))}
              <button className="btn-ghost" onClick={() => setCash(0)}>{th.reset}</button>
            </div>
            <div className="mt-4 flex items-center justify-between rounded-xl bg-slate-50 p-4">
              <span className="font-semibold text-slate-500">{th.change}</span>
              <span className={`text-2xl font-extrabold ${enough ? 'text-emerald-600' : 'text-rose-500'}`}>
                {money(change, currency)}
              </span>
            </div>
          </div>
        ) : (
          <div className="mt-5 flex flex-col items-center">
            {setting.promptPayId ? (
              qr ? (
                <>
                  <div className="rounded-2xl bg-white p-3 ring-1 ring-slate-200">
                    <div className="mb-2 flex items-center justify-center gap-2 text-sm font-bold text-[#0a3c8c]">
                      <span className="rounded bg-[#0a3c8c] px-1.5 py-0.5 text-xs text-white">PromptPay</span>
                      {th.thaiQR}
                    </div>
                    <QRCanvas value={qr} size={220} />
                    <div className="mt-2 text-center text-sm">
                      <div className="text-slate-500">{th.amount}</div>
                      <div className="text-xl font-extrabold">{money(total, currency)}</div>
                    </div>
                  </div>
                  <p className="mt-3 text-center text-xs text-slate-500">
                    {th.scanToPay} {setting.promptPayId}
                  </p>
                </>
              ) : (
                <div className="py-10 text-slate-400">{th.generatingQR}</div>
              )
            ) : (
              <div className="rounded-xl bg-amber-50 p-4 text-center text-sm text-amber-700">
                {th.noPromptPay}
              </div>
            )}
          </div>
        )}

        <div className="mt-6 flex gap-2">
          <button className="btn-ghost flex-1" onClick={onCancel} disabled={busy}>{th.cancel}</button>
          <button
            className="btn-primary flex-1"
            disabled={busy || (method === 'CASH' && !enough) || (method === 'TRANSFER' && !setting.promptPayId)}
            onClick={confirm}
          >
            {busy ? th.processing : method === 'CASH' ? th.confirmCash : th.markPaid}
          </button>
        </div>
      </div>
    </div>
  );
}
