import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { PageHeader } from '../../components/ui';
import { DataTable } from '../../components/DataTable';
import { toast } from '../../components/Toast';
import { useBranch } from '../../store/branch';

interface CountListItem { id: number; refNo: string; status: string; note: string; createdAt: string; _count: { items: number }; branch?: { name: string } | null; }
interface CountItem { id: number; productId: number; systemQty: number; countedQty: number; product: { name: string; sku: string; unit: string }; }
interface CountDetail { id: number; refNo: string; status: string; items: CountItem[]; branch?: { name: string } | null; }

export default function StockCount() {
  const branches = useBranch((s) => s.branches);
  const activeBranchId = useBranch((s) => s.activeId);
  const [list, setList] = useState<CountListItem[]>([]);
  const [active, setActive] = useState<CountDetail | null>(null);
  const [counted, setCounted] = useState<Record<number, number>>({});
  const [newBranch, setNewBranch] = useState<number | ''>('');
  useEffect(() => { if (!newBranch && activeBranchId) setNewBranch(activeBranchId); }, [activeBranchId]);

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
    const c = await api<{ id: number }>('/stock-counts', { method: 'POST', body: { note: 'Full count', branchId: newBranch || null } });
    toast.success('เปิดรอบนับแล้ว');
    await loadList();
    openCount(c.id);
  }

  async function save() {
    if (!active) return;
    await api(`/stock-counts/${active.id}`, {
      method: 'PUT',
      body: { items: active.items.map((i) => ({ productId: i.productId, countedQty: counted[i.productId] ?? i.systemQty })) },
    });
    toast.success('บันทึกแล้ว');
  }

  async function post() {
    if (!active) return;
    await save();
    try {
      await api(`/stock-counts/${active.id}/post`, { method: 'POST' });
      toast.success('โพสต์แล้ว — ปรับสต็อกตามที่นับจริง');
      setActive(null);
      loadList();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  if (active) {
    return (
      <div className="space-y-4">
        <button className="text-sm font-semibold text-brand-600" onClick={() => setActive(null)}>← กลับไปรายการนับ</button>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">{active.refNo} {active.branch && <span className="ml-1 align-middle text-sm font-semibold text-brand-600">· {active.branch.name}</span>}</h1>
            <p className="text-sm text-slate-500">กรอกจำนวนที่นับได้จริง (เทียบกับยอดของสาขานี้) · ส่วนต่างจะถูกบันทึกเป็นความเคลื่อนไหว 'นับสต็อก'</p>
          </div>
          {active.status === 'OPEN' && (
            <div className="flex gap-2">
              <button className="btn-ghost" onClick={save}>บันทึกร่าง</button>
              <button className="btn-primary" onClick={post}>โพสต์การนับ</button>
            </div>
          )}
        </div>

        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
              <tr><th className="px-4 py-3">สินค้า</th><th className="px-4 py-3 text-right">ในระบบ</th><th className="px-4 py-3 w-36 text-right">นับได้</th><th className="px-4 py-3 text-right">ส่วนต่าง</th></tr>
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
    <div className="flex h-full flex-col gap-4">
      <PageHeader
        title="นับสต็อก"
        subtitle="การนับสต็อกแบบมืออาชีพ — ปรับยอดในระบบให้ตรงกับการนับจริง"
        icon={<i className="fa-solid fa-clipboard-check" />}
        actions={
          <div className="flex items-center gap-2">
            {branches.length > 1 && (
              <select className="input py-2" value={newBranch} onChange={(e) => setNewBranch(e.target.value ? Number(e.target.value) : '')}>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            )}
            <button className="btn-primary" onClick={startNew}><i className="fa-solid fa-plus mr-1.5" />เปิดรอบนับใหม่</button>
          </div>
        }
      />

      <DataTable
        rows={list}
        colCount={5}
        empty="ยังไม่มีรอบนับ"
        head={<tr><th className="px-4 py-3">เลขที่</th><th className="px-4 py-3">จำนวนรายการ</th><th className="px-4 py-3">สถานะ</th><th className="px-4 py-3">สร้างเมื่อ</th><th /></tr>}
        renderRow={(c) => (
          <tr key={c.id} className="hover:bg-slate-50">
            <td className="px-4 py-3 font-semibold">{c.refNo}{c.branch && <div className="text-xs font-normal text-slate-400">{c.branch.name}</div>}</td>
            <td className="px-4 py-3">{c._count.items}</td>
            <td className="px-4 py-3"><span className={`chip ${c.status === 'POSTED' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{c.status === 'POSTED' ? 'โพสต์แล้ว' : 'เปิดอยู่'}</span></td>
            <td className="px-4 py-3 text-slate-500">{new Date(c.createdAt).toLocaleString()}</td>
            <td className="px-4 py-3 text-right"><button className="text-sm font-semibold text-brand-600" onClick={() => openCount(c.id)}>เปิด</button></td>
          </tr>
        )}
      />
    </div>
  );
}
