import { useEffect, useState } from 'react';
import { subscribe, type DisplayState } from '../lib/display';
import { QRCanvas } from '../components/QRCode';
import { ProductImage } from '../components/ProductImage';
import { money, secondaryAmount } from '../lib/format';
import { th } from '../lib/th';

/**
 * Customer-facing second display. Open this on an extended monitor or an
 * embedded device. It listens (BroadcastChannel + WebSocket) for live state
 * pushed by the POS and renders the cart, totals, and the PromptPay QR.
 */
export default function Display() {
  const [s, setS] = useState<DisplayState | null>(null);
  const [installer, setInstaller] = useState<any>(null);

  useEffect(() => subscribe(setS), []);

  // Capture the PWA install prompt so we can offer "ติดตั้งแอป" on the device.
  useEffect(() => {
    const onPrompt = (e: Event) => { e.preventDefault(); setInstaller(e); };
    const onInstalled = () => setInstaller(null);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => { window.removeEventListener('beforeinstallprompt', onPrompt); window.removeEventListener('appinstalled', onInstalled); };
  }, []);

  const currency = s?.currency || 'THB';
  const status = s?.status || 'IDLE';

  return (
    <div className="flex h-screen flex-col bg-gradient-to-br from-ink-900 via-ink-900 to-brand-900 text-white">
      {installer && (
        <button
          onClick={async () => { installer.prompt?.(); try { await installer.userChoice; } catch { /* ignore */ } setInstaller(null); }}
          className="fixed right-4 top-4 z-50 flex items-center gap-2 rounded-full bg-white/15 px-4 py-2 text-sm font-bold backdrop-blur transition hover:bg-white/25"
        >
          <i className="fa-solid fa-download" /> ติดตั้งแอป
        </button>
      )}
      <header className="flex items-center justify-between px-8 py-5">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-white/10 text-xl font-extrabold backdrop-blur">P</div>
          <div className="text-lg font-bold">{s?.storeName || 'POS Shop Store'}</div>
        </div>
        {s?.member && <div className="chip bg-white/15 text-white">👤 {s.member.name} · {th.memberPrice}</div>}
      </header>

      {status === 'IDLE' || !s || s.count === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <div className="text-7xl">🛍️</div>
          <h1 className="mt-6 text-5xl font-extrabold">{th.welcome}</h1>
          <p className="mt-3 text-xl text-white/60">{s?.storeName || ''}</p>
        </div>
      ) : status === 'PAID' ? (
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <div className="grid h-24 w-24 place-items-center rounded-full bg-emerald-500 text-6xl">✓</div>
          <h1 className="mt-6 text-5xl font-extrabold">{th.thankYou}</h1>
          <p className="mt-2 text-2xl text-white/70">{s.orderNo}</p>
          {s.paymentMethod === 'CASH' && (
            <div className="mt-6 rounded-2xl bg-white/10 px-8 py-4 text-2xl">
              {th.change}: <span className="font-extrabold text-emerald-300">{money(s.change ?? 0, currency)}</span>
            </div>
          )}
        </div>
      ) : (
        <div className="grid flex-1 grid-cols-[1fr_440px] gap-6 overflow-hidden px-8 pb-8">
          {/* Items */}
          <div className="flex flex-col overflow-hidden rounded-3xl bg-white/5 p-5 backdrop-blur">
            <div className="mb-3 text-lg font-bold text-white/70">{th.order} · {s.count} {th.items}</div>
            <div className="flex-1 space-y-2 overflow-auto pr-2">
              {s.items.map((it, i) => (
                <div key={i} className="flex items-center gap-3 rounded-2xl bg-white/5 p-3">
                  <ProductImage src={it.imageUrl} name={it.name} className="h-14 w-14 shrink-0 rounded-xl" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-lg font-semibold">{it.name}</div>
                    <div className="text-sm text-white/50">{it.qty} × {money(it.unitPrice, currency)}</div>
                  </div>
                  <div className="text-xl font-bold">{money(it.lineTotal, currency)}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Totals / payment */}
          <div className="flex flex-col justify-between rounded-3xl bg-white p-7 text-ink-900">
            {status === 'PAYMENT' && s.qrPayload ? (
              <div className="flex flex-1 flex-col items-center justify-center">
                <div className="flex items-center gap-2 text-lg font-bold text-[#0a3c8c]">
                  <span className="rounded bg-[#0a3c8c] px-2 py-0.5 text-sm text-white">PromptPay</span>
                </div>
                <div className="mt-4 rounded-2xl bg-white p-3 ring-2 ring-slate-100">
                  <QRCanvas value={s.qrPayload} size={300} />
                </div>
                <p className="mt-4 animate-pulse text-lg font-semibold text-slate-500">{th.pleaseScan}</p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="text-lg font-bold text-slate-400">{th.totalDue}</div>
                <div className="flex justify-between text-slate-500"><span>{th.subtotal}</span><span>{money(s.subtotal, currency)}</span></div>
                <div className="flex justify-between text-slate-400"><span>{th.taxIncl}</span><span>{money(s.tax, currency)}</span></div>
              </div>
            )}
            <div className="mt-6 border-t-2 border-dashed border-slate-200 pt-5">
              <div className="text-sm font-bold text-slate-400">{th.totalDue}</div>
              <div className="text-6xl font-black tracking-tight text-brand-700">{money(s.total, currency)}</div>
              {secondaryAmount(s.total, s.secondaryCurrency, s.secondaryRate) && (
                <div className="mt-1 text-2xl font-bold text-slate-400">{secondaryAmount(s.total, s.secondaryCurrency, s.secondaryRate)}</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
