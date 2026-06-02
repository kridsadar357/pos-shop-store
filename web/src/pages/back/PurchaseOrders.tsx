import { useEffect, useMemo, useState } from 'react';
import { api } from '../../api/client';
import { Modal } from '../../components/Modal';
import { DataTable } from '../../components/DataTable';
import { ListToolbar } from '../../components/ListToolbar';
import { toast } from '../../components/Toast';
import { makeExporters, type Column } from '../../lib/export';
import { useBranch } from '../../store/branch';
import { dateTime, money, num } from '../../lib/format';
import type { POListItem, PODetail, POStatus, Product } from '../../types';

interface Supplier { id: number; name: string; }
interface FormLine { product: Product; qty: number; unitCost: number; byPack?: boolean; }

const STATUS: Record<POStatus, { label: string; cls: string }> = {
  DRAFT: { label: 'ร่าง', cls: 'bg-slate-100 text-slate-600' },
  ORDERED: { label: 'สั่งซื้อแล้ว', cls: 'bg-brand-50 text-brand-700' },
  PARTIAL: { label: 'รับบางส่วน', cls: 'bg-amber-50 text-amber-700' },
  RECEIVED: { label: 'รับครบแล้ว', cls: 'bg-emerald-50 text-emerald-700' },
  CANCELLED: { label: 'ยกเลิก', cls: 'bg-rose-50 text-rose-600' },
};
function today() { return new Date().toISOString().slice(0, 10); }
function daysAgo(n: number) { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); }

export default function PurchaseOrders() {
  const [rows, setRows] = useState<POListItem[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState(daysAgo(60));
  const [to, setTo] = useState(today());
  const [form, setForm] = useState<{ id?: number; supplierId: number | ''; note: string; expectedDate: string; lines: FormLine[] } | null>(null);
  const [detail, setDetail] = useState<PODetail | null>(null);
  const [suggest, setSuggest] = useState(false);

  async function load() {
    setRows(await api<POListItem[]>('/purchase-orders', { query: { from: `${from}T00:00:00`, to: `${to}T23:59:59` } }));
  }
  useEffect(() => { load(); }, [from, to]);
  useEffect(() => { api<Supplier[]>('/suppliers').then(setSuppliers).catch(() => {}); }, []);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows.filter((r) =>
      (!term || r.refNo.toLowerCase().includes(term) || (r.supplier?.name || '').toLowerCase().includes(term)) &&
      (!status || r.status === status)
    );
  }, [rows, q, status]);

  const columns: Column<POListItem>[] = [
    { label: 'เลขที่', value: (r) => r.refNo },
    { label: 'วันที่', value: (r) => dateTime(r.createdAt) },
    { label: 'ผู้จำหน่าย', value: (r) => r.supplier?.name ?? '' },
    { label: 'สถานะ', value: (r) => STATUS[r.status].label },
    { label: 'รายการ', value: (r) => r.lineCount, right: true },
    { label: 'รับแล้ว/สั่ง', value: (r) => `${r.receivedQty}/${r.orderedQty}`, right: true },
    { label: 'มูลค่ารวม', value: (r) => num(r.total), right: true },
  ];
  const exporters = makeExporters({ filename: `purchase-orders_${from}_${to}`, title: 'ใบสั่งซื้อ', subtitle: `${from} ถึง ${to}`, columns, rows: () => filtered });

  return (
    <div className="flex h-full flex-col gap-4">
      <ListToolbar
        title="ใบสั่งซื้อ"
        subtitle={`${filtered.length} ใบสั่งซื้อ`}
        icon={<i className="fa-solid fa-file-invoice-dollar" />}
        q={q} setQ={setQ} placeholder="ค้นหาเลขที่ / ผู้จำหน่าย…"
        dateRange={
          <div className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 ring-1 ring-slate-200">
            <i className="fa-regular fa-calendar text-slate-400" />
            <input type="date" className="bg-transparent text-sm outline-none" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
            <span className="text-slate-300">—</span>
            <input type="date" className="bg-transparent text-sm outline-none" value={to} min={from} max={today()} onChange={(e) => setTo(e.target.value)} />
          </div>
        }
        primary={
          <div className="flex gap-2">
            <button className="btn-ghost" onClick={() => setSuggest(true)}><i className="fa-solid fa-wand-magic-sparkles mr-1.5" />คำแนะนำสั่งซื้อ</button>
            <button className="btn-primary" onClick={() => setForm({ supplierId: '', note: '', expectedDate: '', lines: [] })}><i className="fa-solid fa-plus mr-1.5" />สร้างใบสั่งซื้อ</button>
          </div>
        }
        exports={exporters}
        filterCount={status ? 1 : 0}
        onResetFilter={() => setStatus('')}
        filter={
          <div>
            <label className="label">สถานะ</label>
            <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">ทั้งหมด</option>
              {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
        }
      />

      <DataTable
        rows={filtered}
        colCount={8}
        empty="ยังไม่มีใบสั่งซื้อ"
        head={<tr><th className="px-4 py-3">เลขที่</th><th className="px-4 py-3">วันที่</th><th className="px-4 py-3">ผู้จำหน่าย</th><th className="px-4 py-3">สถานะ</th><th className="px-4 py-3 text-center">รับแล้ว/สั่ง</th><th className="px-4 py-3 text-right">มูลค่ารวม</th><th /></tr>}
        renderRow={(r) => (
          <tr key={r.id} className="hover:bg-slate-50">
            <td className="px-4 py-3 font-semibold">{r.refNo}</td>
            <td className="px-4 py-3 text-slate-500">{dateTime(r.createdAt)}</td>
            <td className="px-4 py-3">{r.supplier?.name ?? '—'}</td>
            <td className="px-4 py-3"><span className={`chip ${STATUS[r.status].cls}`}>{STATUS[r.status].label}</span></td>
            <td className="px-4 py-3 text-center"><Progress received={r.receivedQty} ordered={r.orderedQty} /></td>
            <td className="px-4 py-3 text-right font-semibold">{money(r.total)}</td>
            <td className="px-4 py-3 text-right"><button className="text-sm font-semibold text-brand-600" onClick={() => openDetail(r.id)}>เปิด</button></td>
          </tr>
        )}
      />

      {suggest && <SuggestModal onClose={() => setSuggest(false)} onDone={() => { setSuggest(false); load(); }} />}
      {form && (
        <POForm
          form={form} setForm={setForm} suppliers={suppliers}
          onSaved={() => { setForm(null); load(); }}
        />
      )}
      {detail && (
        <PODetailModal
          po={detail} suppliers={suppliers}
          onClose={() => setDetail(null)}
          onChanged={(reopenId) => { load(); if (reopenId) openDetail(reopenId); else setDetail(null); }}
          onEdit={() => { setForm({ id: detail.id, supplierId: detail.supplier?.id ?? '', note: detail.note, expectedDate: detail.expectedDate?.slice(0, 10) ?? '', lines: detail.items.map((it) => ({ product: { id: it.productId, name: it.product?.name, sku: it.product?.sku, unit: it.product?.unit } as Product, qty: it.qty, unitCost: num(it.unitCost) })) }); setDetail(null); }}
        />
      )}
    </div>
  );

  async function openDetail(id: number) { setDetail(await api<PODetail>(`/purchase-orders/${id}`)); }
}

function Progress({ received, ordered }: { received: number; ordered: number }) {
  const pct = ordered ? Math.round((received / ordered) * 100) : 0;
  return (
    <div className="inline-flex items-center gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-brand-500" style={{ width: `${pct}%` }} /></div>
      <span className="text-xs text-slate-500">{received}/{ordered}</span>
    </div>
  );
}

/* ── Create / edit form ── */
function POForm({ form, setForm, suppliers, onSaved }: {
  form: { id?: number; supplierId: number | ''; note: string; expectedDate: string; lines: FormLine[] };
  setForm: (f: any) => void; suppliers: Supplier[]; onSaved: () => void;
}) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Product[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!q.trim()) return setResults([]);
    const t = setTimeout(() => api<Product[]>('/products', { query: { q } }).then(setResults).catch(() => {}), 180);
    return () => clearTimeout(t);
  }, [q]);

  const setLines = (lines: FormLine[]) => setForm({ ...form, lines });
  const add = (p: Product) => {
    if (!form.lines.some((l) => l.product.id === p.id)) {
      const upp = p.unitsPerPurchase ?? 1;
      const byPack = upp > 1;
      setLines([...form.lines, { product: p, qty: 1, unitCost: byPack ? num(p.cost) * upp : num(p.cost), byPack }]);
    }
    setQ(''); setResults([]);
  };
  const total = form.lines.reduce((s, l) => s + l.qty * l.unitCost, 0);

  async function save() {
    if (!form.lines.length) return;
    setBusy(true);
    try {
      const body = { supplierId: form.supplierId || null, note: form.note, expectedDate: form.expectedDate || undefined, items: form.lines.map((l) => {
        const upp = l.product.unitsPerPurchase ?? 1;
        const baseQty = l.byPack ? l.qty * upp : l.qty;
        const baseCost = l.byPack ? Math.round((l.unitCost / upp) * 100) / 100 : l.unitCost;
        return { productId: l.product.id, qty: baseQty, unitCost: baseCost };
      }) };
      if (form.id) await api(`/purchase-orders/${form.id}`, { method: 'PUT', body });
      else await api('/purchase-orders', { method: 'POST', body });
      toast.success('บันทึกใบสั่งซื้อแล้ว');
      onSaved();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <Modal title={form.id ? 'แก้ไขใบสั่งซื้อ' : 'สร้างใบสั่งซื้อ'} wide onClose={() => setForm(null)}>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="label">ผู้จำหน่าย</label>
          <select className="input" value={form.supplierId} onChange={(e) => setForm({ ...form, supplierId: e.target.value ? Number(e.target.value) : '' })}>
            <option value="">— ไม่ระบุ —</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div><label className="label">กำหนดรับสินค้า</label><input type="date" className="input" value={form.expectedDate} onChange={(e) => setForm({ ...form, expectedDate: e.target.value })} /></div>
      </div>

      <div className="relative mt-3">
        <label className="label">เพิ่มสินค้า</label>
        <input className="input" placeholder="ค้นหาชื่อ / SKU / บาร์โค้ด…" value={q} onChange={(e) => setQ(e.target.value)} />
        {results.length > 0 && (
          <div className="absolute left-0 right-0 z-10 mt-1 max-h-56 overflow-auto rounded-xl bg-white shadow-card ring-1 ring-slate-200">
            {results.slice(0, 10).map((p) => (
              <button key={p.id} onClick={() => add(p)} className="flex w-full justify-between px-3 py-2 text-left text-sm hover:bg-slate-50">
                <span>{p.name} <span className="text-xs text-slate-400">{p.sku}</span></span><span className="text-slate-400">ทุน {money(p.cost)}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="mt-3 overflow-hidden rounded-xl ring-1 ring-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400"><tr><th className="px-3 py-2.5">สินค้า</th><th className="px-3 py-2.5 w-24">จำนวน</th><th className="px-3 py-2.5 w-28">ทุน/หน่วย</th><th className="px-3 py-2.5 text-right">รวม</th><th /></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {form.lines.length === 0 && <tr><td colSpan={5} className="px-3 py-8 text-center text-slate-400">ค้นหาด้านบนเพื่อเพิ่มสินค้า</td></tr>}
            {form.lines.map((l) => {
              const upp = l.product.unitsPerPurchase ?? 1;
              const unitLabel = l.byPack ? (l.product.purchaseUnit || 'แพ็ก') : l.product.unit;
              return (
              <tr key={l.product.id}>
                <td className="px-3 py-2">
                  <div className="font-medium">{l.product.name}</div>
                  <div className="text-xs text-slate-400">{l.product.sku}</div>
                  {upp > 1 && (
                    <button className="mt-1 rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-200"
                      onClick={() => setLines(form.lines.map((x) => x.product.id === l.product.id ? { ...x, byPack: !x.byPack, unitCost: x.byPack ? Math.round((x.unitCost / upp) * 100) / 100 : Math.round(x.unitCost * upp * 100) / 100 } : x))}>
                      <i className="fa-solid fa-arrows-rotate mr-1" />สั่งเป็น: {unitLabel} {l.byPack && <span className="text-slate-400">(1 {l.product.purchaseUnit || 'แพ็ก'} = {upp} {l.product.unit})</span>}
                    </button>
                  )}
                </td>
                <td className="px-3 py-2">
                  <input type="number" className="input py-1.5" value={l.qty} onChange={(e) => setLines(form.lines.map((x) => x.product.id === l.product.id ? { ...x, qty: Number(e.target.value) } : x))} />
                  {l.byPack && <div className="mt-0.5 text-[11px] text-slate-400">= {l.qty * upp} {l.product.unit}</div>}
                </td>
                <td className="px-3 py-2"><input type="number" className="input py-1.5" value={l.unitCost} onChange={(e) => setLines(form.lines.map((x) => x.product.id === l.product.id ? { ...x, unitCost: Number(e.target.value) } : x))} /></td>
                <td className="px-3 py-2 text-right font-semibold">{money(l.qty * l.unitCost)}</td>
                <td className="px-3 py-2 text-right"><button className="text-slate-300 hover:text-rose-500" onClick={() => setLines(form.lines.filter((x) => x.product.id !== l.product.id))}>✕</button></td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div><label className="label mt-3">หมายเหตุ</label><input className="input" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></div>

      <div className="mt-4 flex items-center justify-between">
        <div className="text-sm text-slate-500">มูลค่ารวม <span className="ml-2 text-xl font-extrabold text-ink-900">{money(total)}</span></div>
        <div className="flex gap-2">
          <button className="btn-ghost" onClick={() => setForm(null)}>ยกเลิก</button>
          <button className="btn-primary" disabled={busy || !form.lines.length} onClick={save}>บันทึก</button>
        </div>
      </div>
    </Modal>
  );
}

/* ── Detail + receive ── */
function PODetailModal({ po, onClose, onChanged, onEdit }: {
  po: PODetail; suppliers: Supplier[]; onClose: () => void; onChanged: (reopenId?: number) => void; onEdit: () => void;
}) {
  const branches = useBranch((s) => s.branches);
  const [receiving, setReceiving] = useState(false);
  const [recvBranch, setRecvBranch] = useState<number | ''>(useBranch.getState().activeId ?? '');
  const [recv, setRecv] = useState<Record<number, number>>(() => Object.fromEntries(po.items.map((i) => [i.productId, Math.max(0, i.qty - i.receivedQty)])));
  const [batchInfo, setBatchInfo] = useState<Record<number, { lotNo?: string; expiryDate?: string }>>({});
  const [serialInfo, setSerialInfo] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);

  async function setStatus(status: 'ORDERED' | 'CANCELLED') {
    const msg = status === 'CANCELLED' ? 'ยกเลิกใบสั่งซื้อนี้?' : null;
    if (msg && !confirm(msg)) return;
    setBusy(true);
    try { await api(`/purchase-orders/${po.id}/status`, { method: 'POST', body: { status } }); toast.success('อัปเดตสถานะแล้ว'); onChanged(status === 'ORDERED' ? po.id : undefined); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }
  async function remove() {
    if (!confirm(`ลบใบสั่งซื้อ ${po.refNo}?`)) return;
    try { await api(`/purchase-orders/${po.id}`, { method: 'DELETE' }); toast.success('ลบแล้ว'); onChanged(); }
    catch (e) { toast.error((e as Error).message); }
  }
  async function doReceive() {
    const items = po.items.map((i) => {
      const b = batchInfo[i.productId];
      const serials = i.product?.trackSerials
        ? (serialInfo[i.productId] ?? '').split(/[\n,]/).map((s) => s.trim()).filter(Boolean)
        : [];
      return {
        productId: i.productId, qty: recv[i.productId] || 0,
        ...(i.product?.trackBatches && b && (b.lotNo || b.expiryDate)
          ? { lotNo: b.lotNo || undefined, expiryDate: b.expiryDate ? new Date(`${b.expiryDate}T00:00:00`).toISOString() : undefined }
          : {}),
        ...(serials.length ? { serials } : {}),
      };
    }).filter((x) => x.qty > 0);
    if (!items.length) return toast.error('ไม่มีจำนวนที่จะรับ');
    setBusy(true);
    try { const r = await api<{ refNo: string }>(`/purchase-orders/${po.id}/receive`, { method: 'POST', body: { items, branchId: recvBranch || null } }); toast.success(`รับสินค้าแล้ว · ${r.refNo}`); onChanged(po.id); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }

  const canReceive = po.status === 'ORDERED' || po.status === 'PARTIAL';
  return (
    <Modal title={`${po.refNo} · ${STATUS[po.status].label}`} wide onClose={onClose}>
      <div className="mb-3 grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
        <Info label="ผู้จำหน่าย" value={po.supplier?.name ?? '—'} />
        <Info label="วันที่" value={dateTime(po.createdAt)} />
        <Info label="กำหนดรับ" value={po.expectedDate ? new Date(po.expectedDate).toLocaleDateString('th-TH') : '—'} />
        <Info label="มูลค่ารวม" value={money(po.total)} />
        {po.note && <div className="col-span-full text-slate-500">หมายเหตุ: {po.note}</div>}
      </div>

      <div className="overflow-hidden rounded-xl ring-1 ring-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
            <tr><th className="px-3 py-2.5">สินค้า</th><th className="px-3 py-2.5 text-right">สั่ง</th><th className="px-3 py-2.5 text-right">รับแล้ว</th><th className="px-3 py-2.5 text-right">คงเหลือ</th>{receiving && <th className="px-3 py-2.5 w-28 text-right">รับครั้งนี้</th>}<th className="px-3 py-2.5 text-right">ทุน/หน่วย</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {po.items.map((it) => {
              const outstanding = it.qty - it.receivedQty;
              return (
                <tr key={it.id}>
                  <td className="px-3 py-2">
                    <div className="font-medium">{it.product?.name}</div>
                    <div className="text-xs text-slate-400">{it.product?.sku}</div>
                    {receiving && it.product?.trackBatches && (recv[it.productId] ?? 0) > 0 && (
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <span className="text-[11px] font-semibold text-amber-600"><i className="fa-solid fa-flask-vial mr-1" />ล็อต</span>
                        <input className="w-24 rounded-md bg-slate-50 px-2 py-0.5 text-[11px] ring-1 ring-slate-200 outline-none" placeholder="เลขล็อต" value={batchInfo[it.productId]?.lotNo ?? ''} onChange={(e) => setBatchInfo({ ...batchInfo, [it.productId]: { ...batchInfo[it.productId], lotNo: e.target.value } })} />
                        <input type="date" className="rounded-md bg-slate-50 px-2 py-0.5 text-[11px] ring-1 ring-slate-200 outline-none" value={batchInfo[it.productId]?.expiryDate ?? ''} onChange={(e) => setBatchInfo({ ...batchInfo, [it.productId]: { ...batchInfo[it.productId], expiryDate: e.target.value } })} title="วันหมดอายุ" />
                      </div>
                    )}
                    {receiving && it.product?.trackSerials && (recv[it.productId] ?? 0) > 0 && (
                      <div className="mt-1.5">
                        <div className="mb-0.5 text-[11px] font-semibold text-indigo-600"><i className="fa-solid fa-barcode mr-1" />ซีเรียล (บรรทัด/คอมมา · {(serialInfo[it.productId] ?? '').split(/[\n,]/).map((s) => s.trim()).filter(Boolean).length}/{recv[it.productId] ?? 0})</div>
                        <textarea rows={2} className="w-full rounded-md bg-slate-50 px-2 py-1 text-[11px] ring-1 ring-slate-200 outline-none focus:ring-indigo-300" placeholder="SN-001, SN-002 …" value={serialInfo[it.productId] ?? ''} onChange={(e) => setSerialInfo({ ...serialInfo, [it.productId]: e.target.value })} />
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">{it.qty}</td>
                  <td className="px-3 py-2 text-right text-emerald-600">{it.receivedQty}</td>
                  <td className="px-3 py-2 text-right font-semibold">{outstanding}</td>
                  {receiving && <td className="px-3 py-2 text-right"><input type="number" className="input py-1 text-right" max={outstanding} min={0} value={recv[it.productId] ?? 0} onChange={(e) => setRecv({ ...recv, [it.productId]: Math.max(0, Math.min(outstanding, Number(e.target.value))) })} /></td>}
                  <td className="px-3 py-2 text-right text-slate-500">{money(it.unitCost)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
        {po.status === 'DRAFT' && <>
          <button className="btn-ghost text-rose-600" disabled={busy} onClick={remove}><i className="fa-solid fa-trash mr-1.5" />ลบ</button>
          <button className="btn-ghost" disabled={busy} onClick={onEdit}><i className="fa-solid fa-pen mr-1.5" />แก้ไข</button>
          <button className="btn-primary" disabled={busy} onClick={() => setStatus('ORDERED')}><i className="fa-solid fa-paper-plane mr-1.5" />ส่งสั่งซื้อ</button>
        </>}
        {canReceive && !receiving && <>
          <button className="btn-ghost text-rose-600" disabled={busy} onClick={() => setStatus('CANCELLED')}>ยกเลิกใบสั่งซื้อ</button>
          <button className="btn-primary" onClick={() => setReceiving(true)}><i className="fa-solid fa-truck-ramp-box mr-1.5" />รับสินค้า</button>
        </>}
        {receiving && <>
          {branches.length > 1 && (
            <label className="mr-auto flex items-center gap-2 text-sm text-slate-500">รับเข้าสาขา
              <select className="input py-1.5" value={recvBranch} onChange={(e) => setRecvBranch(e.target.value ? Number(e.target.value) : '')}>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </label>
          )}
          <button className="btn-ghost" disabled={busy} onClick={() => setReceiving(false)}>ยกเลิก</button>
          <button className="btn-primary" disabled={busy} onClick={doReceive}>ยืนยันรับสินค้า</button>
        </>}
        {(po.status === 'RECEIVED' || po.status === 'CANCELLED') && <button className="btn-ghost" onClick={onClose}>ปิด</button>}
      </div>
    </Modal>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div><div className="text-[11px] uppercase tracking-wide text-slate-400">{label}</div><div className="font-medium text-ink-900">{value}</div></div>;
}

/* ── Reorder suggestions → auto-PO ── */
interface Suggestion { productId: number; sku: string; name: string; onHand: number; reorderLevel: number; unit: string; suggestedQty: number; unitCost: number; supplierId: number | null; supplierName: string | null; }

function SuggestModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const activeId = useBranch((s) => s.activeId);
  const [rows, setRows] = useState<Suggestion[]>([]);
  const [sel, setSel] = useState<Record<number, { on: boolean; qty: number; cost: number }>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<Suggestion[]>('/purchase-orders/suggestions', { query: { branchId: activeId ?? undefined } })
      .then((s) => { setRows(s); setSel(Object.fromEntries(s.map((x) => [x.productId, { on: true, qty: x.suggestedQty, cost: x.unitCost }]))); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const chosen = rows.filter((r) => sel[r.productId]?.on);
  const groupCount = new Set(chosen.map((r) => r.supplierId)).size;

  async function create() {
    if (!chosen.length) return;
    const groups = new Map<number | null, Suggestion[]>();
    for (const r of chosen) { const k = r.supplierId; if (!groups.has(k)) groups.set(k, []); groups.get(k)!.push(r); }
    setBusy(true);
    try {
      for (const [supplierId, items] of groups) {
        await api('/purchase-orders', { method: 'POST', body: { supplierId: supplierId ?? null, note: 'สร้างจากคำแนะนำเติมสต็อก', items: items.map((i) => ({ productId: i.productId, qty: sel[i.productId].qty, unitCost: sel[i.productId].cost })) } });
      }
      toast.success(`สร้างใบสั่งซื้อ ${groups.size} ใบจากคำแนะนำ`);
      onDone();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <Modal title="คำแนะนำการสั่งซื้อ (เติมสต็อก)" wide onClose={onClose}>
      <p className="mb-3 text-sm text-slate-500">สินค้าที่ถึง/ต่ำกว่าจุดสั่งซื้อ พร้อมจำนวนแนะนำ ราคาทุนล่าสุด และผู้จำหน่ายเดิม — สร้างใบสั่งซื้อแยกตามผู้จำหน่ายอัตโนมัติ</p>
      {loading ? (
        <div className="py-12 text-center text-slate-400"><i className="fa-solid fa-spinner fa-spin mr-2" />กำลังคำนวณ…</div>
      ) : rows.length === 0 ? (
        <div className="py-12 text-center text-slate-400"><i className="fa-solid fa-circle-check mb-2 block text-2xl text-emerald-500" />สต็อกเพียงพอ ไม่มีรายการที่ต้องสั่งซื้อ</div>
      ) : (
        <>
          <div className="max-h-[55vh] overflow-auto rounded-xl ring-1 ring-slate-200">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
                <tr><th className="px-3 py-2.5 w-8"></th><th className="px-3 py-2.5">สินค้า</th><th className="px-3 py-2.5 text-right">คงเหลือ/จุดสั่ง</th><th className="px-3 py-2.5">ผู้จำหน่าย</th><th className="px-3 py-2.5 w-24 text-right">สั่ง</th><th className="px-3 py-2.5 w-28 text-right">ทุน/หน่วย</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => {
                  const s = sel[r.productId];
                  return (
                    <tr key={r.productId} className={s?.on ? '' : 'opacity-50'}>
                      <td className="px-3 py-2"><input type="checkbox" className="h-4 w-4 accent-brand-600" checked={s?.on ?? false} onChange={(e) => setSel({ ...sel, [r.productId]: { ...s, on: e.target.checked } })} /></td>
                      <td className="px-3 py-2"><div className="font-medium">{r.name}</div><div className="text-xs text-slate-400">{r.sku}</div></td>
                      <td className="px-3 py-2 text-right"><span className={r.onHand <= 0 ? 'font-semibold text-rose-500' : 'text-amber-600'}>{r.onHand}</span> <span className="text-slate-400">/ {r.reorderLevel}</span></td>
                      <td className="px-3 py-2 text-slate-500">{r.supplierName ?? '—'}</td>
                      <td className="px-3 py-2 text-right"><input type="number" min={1} className="input w-20 py-1 text-right" value={s?.qty ?? 0} onChange={(e) => setSel({ ...sel, [r.productId]: { ...s, qty: Math.max(1, Number(e.target.value)) } })} /></td>
                      <td className="px-3 py-2 text-right"><input type="number" min={0} className="input w-24 py-1 text-right" value={s?.cost ?? 0} onChange={(e) => setSel({ ...sel, [r.productId]: { ...s, cost: Number(e.target.value) } })} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex items-center justify-between">
            <div className="text-sm text-slate-500">เลือก {chosen.length} รายการ · จะสร้าง {groupCount} ใบสั่งซื้อ (แยกตามผู้จำหน่าย)</div>
            <div className="flex gap-2">
              <button className="btn-ghost" onClick={onClose}>ยกเลิก</button>
              <button className="btn-primary" disabled={busy || !chosen.length} onClick={create}><i className="fa-solid fa-file-circle-plus mr-1.5" />สร้างใบสั่งซื้อ</button>
            </div>
          </div>
        </>
      )}
    </Modal>
  );
}
