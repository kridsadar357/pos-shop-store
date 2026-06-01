import { useEffect, useMemo, useState } from 'react';
import { api } from '../../api/client';
import { PageHeader } from '../../components/ui';
import { DataTable } from '../../components/DataTable';
import { ListToolbar } from '../../components/ListToolbar';
import { toast } from '../../components/Toast';
import { makeExporters, type Column } from '../../lib/export';
import { useBranch } from '../../store/branch';
import { dateTime, money, num } from '../../lib/format';
import type { Product } from '../../types';

interface Supplier { id: number; name: string; }
interface Line { product: Product; qty: number; unitCost: number; }
interface Receipt { id: number; refNo: string; total: string; note: string; createdAt: string; supplier?: { name: string } | null; _count: { items: number }; }

function today() { return new Date().toISOString().slice(0, 10); }
function daysAgo(n: number) { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); }

export default function Receive() {
  const branches = useBranch((s) => s.branches);
  const activeBranchId = useBranch((s) => s.activeId);
  const [branchId, setBranchId] = useState<number | ''>('');
  useEffect(() => { if (!branchId && activeBranchId) setBranchId(activeBranchId); }, [activeBranchId]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierId, setSupplierId] = useState<number | ''>('');
  const [note, setNote] = useState('');
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Product[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [busy, setBusy] = useState(false);

  // Receipt history + filters
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [hq, setHq] = useState('');
  const [hSupplier, setHSupplier] = useState('');
  const [hFrom, setHFrom] = useState(daysAgo(30));
  const [hTo, setHTo] = useState(today());

  async function loadReceipts() {
    setReceipts(await api<Receipt[]>('/inventory/receipts', { query: { from: `${hFrom}T00:00:00`, to: `${hTo}T23:59:59` } }));
  }
  useEffect(() => { loadReceipts(); }, [hFrom, hTo]);

  useEffect(() => {
    api<Supplier[]>('/suppliers').then(setSuppliers);
  }, []);
  useEffect(() => {
    if (!q.trim()) return setResults([]);
    const t = setTimeout(() => api<Product[]>('/products', { query: { q } }).then(setResults), 180);
    return () => clearTimeout(t);
  }, [q]);

  function add(p: Product) {
    if (lines.some((l) => l.product.id === p.id)) return;
    setLines([...lines, { product: p, qty: 1, unitCost: num(p.cost) }]);
    setQ('');
    setResults([]);
  }
  function update(id: number, patch: Partial<Line>) {
    setLines(lines.map((l) => (l.product.id === id ? { ...l, ...patch } : l)));
  }
  const total = lines.reduce((s, l) => s + l.qty * l.unitCost, 0);

  async function submit() {
    if (!lines.length) return;
    setBusy(true);
    try {
      const res = await api<{ refNo: string }>('/inventory/receive', {
        method: 'POST',
        body: {
          supplierId: supplierId || null,
          branchId: branchId || null,
          note,
          items: lines.map((l) => ({ productId: l.product.id, qty: l.qty, unitCost: l.unitCost })),
        },
      });
      toast.success(`รับสินค้า ${res.refNo} — อัปเดตสต็อกแล้ว`);
      setLines([]);
      setNote('');
      loadReceipts();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const filteredReceipts = useMemo(() => {
    const term = hq.trim().toLowerCase();
    return receipts.filter((r) => {
      if (term && !(r.refNo.toLowerCase().includes(term) || (r.supplier?.name || '').toLowerCase().includes(term) || (r.note || '').toLowerCase().includes(term))) return false;
      if (hSupplier && (r.supplier?.name || '') !== hSupplier) return false;
      return true;
    });
  }, [receipts, hq, hSupplier]);

  const supplierNames = useMemo(() => Array.from(new Set(receipts.map((r) => r.supplier?.name).filter(Boolean) as string[])), [receipts]);

  const receiptColumns: Column<Receipt>[] = [
    { label: 'เลขที่', value: (r) => r.refNo },
    { label: 'วันที่', value: (r) => dateTime(r.createdAt) },
    { label: 'ผู้จำหน่าย', value: (r) => r.supplier?.name ?? '' },
    { label: 'จำนวนรายการ', value: (r) => r._count.items, right: true },
    { label: 'ต้นทุนรวม', value: (r) => num(r.total), right: true },
    { label: 'หมายเหตุ', value: (r) => r.note || '' },
  ];
  const exporters = makeExporters({ filename: `receipts_${hFrom}_${hTo}`, title: 'ประวัติการรับสินค้า', subtitle: `ช่วงวันที่ ${hFrom} ถึง ${hTo}`, columns: receiptColumns, rows: () => filteredReceipts });

  return (
    <div className="space-y-4">
      <PageHeader title="จัดซื้อ / รับสินค้า" subtitle="บันทึกสินค้าเข้าจากผู้จำหน่าย · แต่ละรายการจะสร้างความเคลื่อนไหว 'รับเข้า'" icon={<i className="fa-solid fa-truck-ramp-box" />} />

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <div className="card relative p-4">
            <label className="label">เพิ่มสินค้า</label>
            <input className="input" placeholder="ค้นหาชื่อ / SKU / บาร์โค้ด…" value={q} onChange={(e) => setQ(e.target.value)} />
            {results.length > 0 && (
              <div className="absolute left-4 right-4 z-10 mt-1 max-h-60 overflow-auto rounded-xl bg-white shadow-card ring-1 ring-slate-200">
                {results.slice(0, 12).map((p) => (
                  <button key={p.id} onClick={() => add(p)} className="flex w-full justify-between px-3 py-2 text-left text-sm hover:bg-slate-50">
                    <span>{p.name} <span className="text-xs text-slate-400">{p.sku}</span></span>
                    <span className="text-slate-400">คงเหลือ {p.stockQty}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
                <tr><th className="px-4 py-3">สินค้า</th><th className="px-3 py-3 w-28">จำนวน</th><th className="px-3 py-3 w-32">ทุน/หน่วย</th><th className="px-4 py-3 text-right">รวม</th><th /></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {lines.length === 0 && <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-400">ยังไม่มีรายการ — ค้นหาด้านบนเพื่อเพิ่ม</td></tr>}
                {lines.map((l) => (
                  <tr key={l.product.id}>
                    <td className="px-4 py-2.5"><div className="font-medium">{l.product.name}</div><div className="text-xs text-slate-400">{l.product.sku}</div></td>
                    <td className="px-3 py-2.5"><input type="number" className="input py-1.5" value={l.qty} onChange={(e) => update(l.product.id, { qty: Number(e.target.value) })} /></td>
                    <td className="px-3 py-2.5"><input type="number" className="input py-1.5" value={l.unitCost} onChange={(e) => update(l.product.id, { unitCost: Number(e.target.value) })} /></td>
                    <td className="px-4 py-2.5 text-right font-semibold">{money(l.qty * l.unitCost)}</td>
                    <td className="px-3 py-2.5 text-right"><button className="text-slate-300 hover:text-rose-500" onClick={() => setLines(lines.filter((x) => x.product.id !== l.product.id))}>✕</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card h-fit space-y-4 p-5">
          <div>
            <label className="label">ผู้จำหน่าย</label>
            <select className="input" value={supplierId} onChange={(e) => setSupplierId(e.target.value ? Number(e.target.value) : '')}>
              <option value="">— ไม่ระบุ —</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          {branches.length > 1 && (
            <div>
              <label className="label">รับเข้าสาขา</label>
              <select className="input" value={branchId} onChange={(e) => setBranchId(e.target.value ? Number(e.target.value) : '')}>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="label">หมายเหตุ</label>
            <textarea className="input" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <div className="flex items-center justify-between border-t border-dashed border-slate-200 pt-4">
            <span className="font-semibold text-slate-500">ต้นทุนรวม</span>
            <span className="text-2xl font-extrabold">{money(total)}</span>
          </div>
          <button className="btn-primary w-full" disabled={busy || !lines.length} onClick={submit}>
            {busy ? 'กำลังบันทึก…' : 'รับสินค้าเข้าสต็อก'}
          </button>
        </div>
      </div>

      {/* Goods-receipt history */}
      <div className="pt-2">
        <ListToolbar
          title="ประวัติการรับสินค้า"
          icon={<i className="fa-solid fa-clock-rotate-left" />}
          q={hq} setQ={setHq} placeholder="ค้นหาเลขที่ / ผู้จำหน่าย…"
          dateRange={
            <div className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 ring-1 ring-slate-200">
              <i className="fa-regular fa-calendar text-slate-400" />
              <input type="date" className="bg-transparent text-sm outline-none" value={hFrom} max={hTo} onChange={(e) => setHFrom(e.target.value)} />
              <span className="text-slate-300">—</span>
              <input type="date" className="bg-transparent text-sm outline-none" value={hTo} min={hFrom} max={today()} onChange={(e) => setHTo(e.target.value)} />
            </div>
          }
          exports={exporters}
          filterCount={hSupplier ? 1 : 0}
          onResetFilter={() => setHSupplier('')}
          filter={
            <div>
              <label className="label">ผู้จำหน่าย</label>
              <select className="input" value={hSupplier} onChange={(e) => setHSupplier(e.target.value)}>
                <option value="">ทั้งหมด</option>
                {supplierNames.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          }
        />
        <div className="mt-3 flex h-[360px] flex-col">
          <DataTable
            rows={filteredReceipts}
            colCount={6}
            empty="ยังไม่มีประวัติการรับสินค้าในช่วงที่เลือก"
            head={<tr><th className="px-4 py-3">เลขที่</th><th className="px-4 py-3">วันที่</th><th className="px-4 py-3">ผู้จำหน่าย</th><th className="px-4 py-3 text-right">รายการ</th><th className="px-4 py-3 text-right">ต้นทุนรวม</th><th className="px-4 py-3">หมายเหตุ</th></tr>}
            renderRow={(r) => (
              <tr key={r.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-semibold">{r.refNo}</td>
                <td className="px-4 py-3 text-slate-500">{dateTime(r.createdAt)}</td>
                <td className="px-4 py-3">{r.supplier?.name ?? '—'}</td>
                <td className="px-4 py-3 text-right">{r._count.items}</td>
                <td className="px-4 py-3 text-right font-semibold">{money(r.total)}</td>
                <td className="px-4 py-3 text-slate-500">{r.note || '—'}</td>
              </tr>
            )}
          />
        </div>
      </div>
    </div>
  );
}
