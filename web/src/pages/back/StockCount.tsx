import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { PageHeader } from '../../components/ui';
import { toast } from '../../components/Toast';

interface CountListItem { id: number; refNo: string; status: string; note: string; createdAt: string; _count: { items: number }; }
interface CountItem { id: number; productId: number; systemQty: number; countedQty: number; product: { name: string; sku: string; unit: string }; }
interface CountDetail { id: number; refNo: string; status: string; items: CountItem[]; }

export default function StockCount() {
  const [list, setList] = useState<CountListItem[]>([]);
  const [active, setActive] = useState<CountDetail | null>(null);
  const [counted, setCounted] = useState<Record<number, number>>({});

  async function loadList() {
    setList(await api<CountListItem[]>('/stock-counts'));
  }
  useEffect(() => { loadList(); }, []);

  async function openCount(id: number) {
    const c = await api<CountDetail>(`/stock-counts/${id}`);
    setActive(c);
    setCounted(Object.fromEntries(c.items.map((i) => [i.productId, i.countedQty])));
  }

  async function startNew() {
    const c = await api<{ id: number }>('/stock-counts', { method: 'POST', body: { note: 'Full count' } });
    toast.success('Count opened');
    await loadList();
    openCount(c.id);
  }

  async function save() {
    if (!active) return;
    await api(`/stock-counts/${active.id}`, {
      method: 'PUT',
      body: { items: active.items.map((i) => ({ productId: i.productId, countedQty: counted[i.productId] ?? i.systemQty })) },
    });
    toast.success('Saved');
  }

  async function post() {
    if (!active) return;
    await save();
    try {
      await api(`/stock-counts/${active.id}/post`, { method: 'POST' });
      toast.success('Posted — stock reconciled to counts');
      setActive(null);
      loadList();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  if (active) {
    return (
      <div className="space-y-4">
        <button className="text-sm font-semibold text-brand-600" onClick={() => setActive(null)}>← Back to counts</button>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">{active.refNo}</h1>
            <p className="text-sm text-slate-500">Enter the physical counted quantity. Variances are posted as COUNT movements.</p>
          </div>
          {active.status === 'OPEN' && (
            <div className="flex gap-2">
              <button className="btn-ghost" onClick={save}>Save draft</button>
              <button className="btn-primary" onClick={post}>Post count</button>
            </div>
          )}
        </div>

        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
              <tr><th className="px-4 py-3">Product</th><th className="px-4 py-3 text-right">System</th><th className="px-4 py-3 w-36 text-right">Counted</th><th className="px-4 py-3 text-right">Variance</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {active.items.map((i) => {
                const c = counted[i.productId] ?? i.systemQty;
                const variance = c - i.systemQty;
                return (
                  <tr key={i.id}>
                    <td className="px-4 py-2.5"><div className="font-medium">{i.product.name}</div><div className="text-xs text-slate-400">{i.product.sku}</div></td>
                    <td className="px-4 py-2.5 text-right">{i.systemQty}</td>
                    <td className="px-4 py-2.5 text-right">
                      <input
                        type="number"
                        disabled={active.status === 'POSTED'}
                        className="input py-1.5 text-right"
                        value={c}
                        onChange={(e) => setCounted({ ...counted, [i.productId]: Number(e.target.value) })}
                      />
                    </td>
                    <td className={`px-4 py-2.5 text-right font-semibold ${variance === 0 ? 'text-slate-400' : variance > 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                      {variance > 0 ? `+${variance}` : variance}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Stock Count"
        subtitle="Professional cycle counts — reconcile system stock to physical counts"
        icon="✓"
        actions={<button className="btn-primary" onClick={startNew}>+ New count</button>}
      />

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
            <tr><th className="px-4 py-3">Ref</th><th className="px-4 py-3">Items</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Created</th><th /></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {list.map((c) => (
              <tr key={c.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-semibold">{c.refNo}</td>
                <td className="px-4 py-3">{c._count.items}</td>
                <td className="px-4 py-3"><span className={`chip ${c.status === 'POSTED' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{c.status}</span></td>
                <td className="px-4 py-3 text-slate-500">{new Date(c.createdAt).toLocaleString()}</td>
                <td className="px-4 py-3 text-right"><button className="text-sm font-semibold text-brand-600" onClick={() => openCount(c.id)}>Open</button></td>
              </tr>
            ))}
            {list.length === 0 && <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-400">No counts yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
