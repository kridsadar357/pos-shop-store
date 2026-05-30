import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { toast } from '../../components/Toast';
import { PageHeader } from '../../components/ui';
import { ReceiptPrint } from '../../components/ReceiptPrint';
import { dateTime, money } from '../../lib/format';
import type { Sale, Setting } from '../../types';

export default function Sales() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [setting, setSetting] = useState<Setting | null>(null);
  const [printSale, setPrintSale] = useState<Sale | null>(null);

  async function load() {
    setSales(await api<Sale[]>('/sales'));
  }
  useEffect(() => {
    load();
    api<Setting>('/settings').then(setSetting).catch(() => {});
  }, []);

  async function voidSale(id: number) {
    if (!confirm('Void this sale? Stock will be returned to inventory.')) return;
    try {
      await api(`/sales/${id}/void`, { method: 'POST' });
      toast.success('Sale voided — stock returned');
      load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Sales" subtitle="Recent transactions · voiding returns stock via the ledger" icon="🧾" />

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
            <tr><th className="px-4 py-3">Order</th><th className="px-4 py-3">Date</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Payment</th><th className="px-4 py-3">Cashier</th><th className="px-4 py-3 text-right">Total</th><th className="px-4 py-3">Status</th><th /></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sales.map((s) => (
              <tr key={s.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-semibold">{s.orderNo}</td>
                <td className="px-4 py-3 text-slate-500">{dateTime(s.createdAt)}</td>
                <td className="px-4 py-3"><span className="chip bg-slate-100 text-slate-600">{s.type}</span></td>
                <td className="px-4 py-3">{({ CASH: '💵 Cash', TRANSFER: '📱 Transfer', CARD: '💳 Card', CREDIT: '🪙 Credit' } as Record<string, string>)[s.paymentMethod] ?? s.paymentMethod}</td>
                <td className="px-4 py-3 text-slate-500">{s.cashier?.name}</td>
                <td className="px-4 py-3 text-right font-semibold">{money(s.total)}</td>
                <td className="px-4 py-3"><span className={`chip ${s.status === 'VOID' ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-700'}`}>{s.status}</span></td>
                <td className="px-4 py-3 text-right">
                  <button className="text-sm font-semibold text-brand-600" onClick={() => setPrintSale(s)}>Receipt</button>
                  {s.status === 'PAID' && <button className="ml-3 text-sm font-semibold text-rose-600" onClick={() => voidSale(s.id)}>Void</button>}
                </td>
              </tr>
            ))}
            {sales.length === 0 && <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-400">No sales yet.</td></tr>}
          </tbody>
        </table>
      </div>
      {printSale && <ReceiptPrint sale={printSale} setting={setting} onDone={() => setPrintSale(null)} />}
    </div>
  );
}
