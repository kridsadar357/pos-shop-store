import { useEffect, useMemo, useState } from 'react';
import { api } from '../../api/client';
import { Modal } from '../../components/Modal';
import { DataTable } from '../../components/DataTable';
import { ListToolbar } from '../../components/ListToolbar';
import { makeExporters, type Column } from '../../lib/export';
import { dateTime, money, num } from '../../lib/format';
import { toast } from '../../components/Toast';
import type { Layaway, Product } from '../../types';

const ST_LABEL: Record<Layaway['status'], string> = { OPEN: 'กำลังผ่อน', COMPLETED: 'รับสินค้าแล้ว', CANCELLED: 'ยกเลิก' };
const ST_CHIP: Record<Layaway['status'], string> = { OPEN: 'bg-amber-50 text-amber-700', COMPLETED: 'bg-emerald-50 text-emerald-700', CANCELLED: 'bg-rose-50 text-rose-700' };

type Row = { product: Product; qty: number; unitPrice: number };

export default function Layaways() {
  const [rows, setRows] = useState<Layaway[]>([]);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('OPEN');
  const [creating, setCreating] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);

  async function load() { setRows(await api<Layaway[]>('/layaways', { query: { ...(q ? { q } : {}), ...(status ? { status } : {}) } })); }
  useEffect(() => { const t = setTimeout(load, 150); return () => clearTimeout(t); }, [q, status]);

  const columns: Column<Layaway>[] = [
    { label: 'เลขที่', value: (r) => r.refNo },
    { label: 'ลูกค้า', value: (r) => r.customerName },
    { label: 'ยอดรวม', value: (r) => num(r.total), right: true },
    { label: 'ชำระแล้ว', value: (r) => r.paid, right: true },
    { label: 'คงค้าง', value: (r) => r.balance, right: true },
    { label: 'สถานะ', value: (r) => ST_LABEL[r.status] },
  ];
  const exporters = makeExporters({ filename: 'layaways', title: 'ออมก่อนรับ (Layaway)', columns, rows: () => rows });

  return (
    <div className="flex h-full flex-col gap-4">
      <ListToolbar
        title="ออมก่อนรับ / มัดจำ"
        subtitle="ลูกค้าจองสินค้าและผ่อนชำระเป็นงวด เมื่อครบรับสินค้าและออกบิล"
        icon={<i className="fa-solid fa-piggy-bank" />}
        q={q} setQ={setQ} placeholder="ค้นหาเลขที่ / ลูกค้า…"
        primary={<button className="btn-primary" onClick={() => setCreating(true)}><i className="fa-solid fa-plus mr-1.5" />สร้างแผนใหม่</button>}
        exports={exporters}
        filterCount={status ? 1 : 0}
        onResetFilter={() => setStatus('')}
        filter={
          <div>
            <label className="label">สถานะ</label>
            <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">ทั้งหมด</option>
              {Object.entries(ST_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
        }
      />

      <DataTable
        rows={rows}
        colCount={7}
        empty="ยังไม่มีแผนออมก่อนรับ"
        head={<tr><th className="px-4 py-3">เลขที่</th><th className="px-4 py-3">ลูกค้า</th><th className="px-4 py-3 text-right">ยอดรวม</th><th className="px-4 py-3 text-right">ชำระแล้ว</th><th className="px-4 py-3 text-right">คงค้าง</th><th className="px-4 py-3">สถานะ</th><th /></tr>}
        renderRow={(r) => (
          <tr key={r.id} className="hover:bg-slate-50">
            <td className="px-4 py-3 font-mono font-semibold">{r.refNo}</td>
            <td className="px-4 py-3">{r.customerName || 'ลูกค้าทั่วไป'}</td>
            <td className="px-4 py-3 text-right">{money(r.total)}</td>
            <td className="px-4 py-3 text-right text-emerald-600">{money(r.paid)}</td>
            <td className="px-4 py-3 text-right font-bold text-rose-600">{money(r.balance)}</td>
            <td className="px-4 py-3"><span className={`chip ${ST_CHIP[r.status]}`}>{ST_LABEL[r.status]}</span></td>
            <td className="px-4 py-3 text-right"><button className="text-sm font-semibold text-brand-600" onClick={() => setDetailId(r.id)}>จัดการ</button></td>
          </tr>
        )}
      />

      {creating && <CreateModal onClose={() => setCreating(false)} onSaved={() => { setCreating(false); load(); }} />}
      {detailId && <DetailModal id={detailId} onClose={() => setDetailId(null)} onChanged={load} />}
    </div>
  );
}

function CreateModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [type, setType] = useState<'RETAIL' | 'WHOLESALE'>('RETAIL');
  const [discount, setDiscount] = useState(0);
  const [deposit, setDeposit] = useState(0);
  const [dueDate, setDueDate] = useState('');
  const [lines, setLines] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => { api<Product[]>('/products').then(setProducts).catch(() => {}); }, []);
  const priceFor = (p: Product) => num(type === 'WHOLESALE' ? p.wholesalePrice : p.retailPrice);
  function addProduct(p: Product) { setLines((ls) => ls.some((l) => l.product.id === p.id) ? ls.map((l) => l.product.id === p.id ? { ...l, qty: l.qty + 1 } : l) : [...ls, { product: p, qty: 1, unitPrice: priceFor(p) }]); }
  function setLine(id: number, patch: Partial<Row>) { setLines((ls) => ls.map((l) => l.product.id === id ? { ...l, ...patch } : l)); }
  const subtotal = useMemo(() => lines.reduce((s, l) => s + l.unitPrice * l.qty, 0), [lines]);
  const total = Math.max(0, subtotal - discount);
  const filtered = useMemo(() => {
    const t = search.trim().toLowerCase();
    if (!t) return products.slice(0, 25);
    return products.filter((p) => p.name.toLowerCase().includes(t) || p.sku.toLowerCase().includes(t)).slice(0, 25);
  }, [products, search]);

  async function save() {
    if (lines.length === 0) return toast.error('เพิ่มรายการสินค้าก่อน');
    setBusy(true);
    try {
      await api('/layaways', { method: 'POST', body: {
        customerName, type, discount, deposit, depositMethod: 'CASH',
        dueDate: dueDate ? new Date(`${dueDate}T23:59:59`).toISOString() : null,
        items: lines.map((l) => ({ productId: l.product.id, qty: l.qty, unitPrice: l.unitPrice })),
      } });
      toast.success('สร้างแผนออมก่อนรับแล้ว');
      onSaved();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <Modal title="สร้างแผนออมก่อนรับ" wide onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="label">ชื่อลูกค้า</label><input className="input" value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="ลูกค้าทั่วไป" /></div>
        <div><label className="label">ประเภทราคา</label><select className="input" value={type} onChange={(e) => setType(e.target.value as 'RETAIL' | 'WHOLESALE')}><option value="RETAIL">ขายปลีก</option><option value="WHOLESALE">ขายส่ง</option></select></div>
      </div>
      <div className="mt-3">
        <label className="label">เพิ่มสินค้า</label>
        <input className="input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหาสินค้า / SKU…" />
        {search && (
          <div className="mt-1 max-h-32 overflow-auto rounded-xl ring-1 ring-slate-100">
            {filtered.map((p) => <button key={p.id} className="flex w-full items-center justify-between border-b border-slate-50 px-3 py-2 text-left text-sm hover:bg-slate-50 last:border-0" onClick={() => { addProduct(p); setSearch(''); }}><span>{p.name}</span><span className="text-slate-400">{money(priceFor(p))}</span></button>)}
          </div>
        )}
      </div>
      <div className="mt-3 max-h-44 overflow-auto rounded-xl ring-1 ring-slate-100">
        {lines.length === 0 ? <p className="px-3 py-6 text-center text-sm text-slate-400">ยังไม่มีรายการ</p> : (
          <table className="w-full text-sm"><tbody>
            {lines.map((l) => (
              <tr key={l.product.id} className="border-b border-slate-50 last:border-0">
                <td className="px-3 py-2">{l.product.name}</td>
                <td className="px-2 py-2"><input type="number" className="w-14 rounded bg-slate-50 px-2 py-1 text-center ring-1 ring-slate-200 outline-none" value={l.qty} onChange={(e) => setLine(l.product.id, { qty: Math.max(1, Math.floor(Number(e.target.value)) || 1) })} /></td>
                <td className="px-2 py-2"><input type="number" className="w-24 rounded bg-slate-50 px-2 py-1 text-right ring-1 ring-slate-200 outline-none" value={l.unitPrice} onChange={(e) => setLine(l.product.id, { unitPrice: Math.max(0, Number(e.target.value)) })} /></td>
                <td className="px-3 py-2 text-right font-semibold">{money(l.unitPrice * l.qty)}</td>
                <td className="pr-2 text-right"><button className="text-slate-300 hover:text-rose-500" onClick={() => setLines((ls) => ls.filter((x) => x.product.id !== l.product.id))}>✕</button></td>
              </tr>
            ))}
          </tbody></table>
        )}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-3">
        <div><label className="label">ส่วนลด (฿)</label><input type="number" className="input" value={discount || ''} onChange={(e) => setDiscount(Math.max(0, Number(e.target.value)))} /></div>
        <div><label className="label">เงินมัดจำแรก (฿)</label><input type="number" className="input" value={deposit || ''} onChange={(e) => setDeposit(Math.max(0, Number(e.target.value)))} /></div>
        <div><label className="label">กำหนดรับภายใน</label><input type="date" className="input" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></div>
      </div>
      <div className="mt-3 flex items-center justify-between rounded-xl bg-slate-50 px-4 py-2.5"><span className="text-sm text-slate-500">ยอดรวม</span><span className="text-lg font-extrabold">{money(total)}</span></div>
      <div className="mt-4 flex gap-2"><button className="btn-ghost flex-1" onClick={onClose}>ยกเลิก</button><button className="btn-primary flex-1" disabled={busy || lines.length === 0} onClick={save}>บันทึก</button></div>
    </Modal>
  );
}

function DetailModal({ id, onClose, onChanged }: { id: number; onClose: () => void; onChanged: () => void }) {
  const [lay, setLay] = useState<Layaway | null>(null);
  const [amount, setAmount] = useState(0);
  const [method, setMethod] = useState<'CASH' | 'TRANSFER' | 'CARD' | 'CREDIT'>('CASH');
  const [busy, setBusy] = useState(false);

  async function load() { const l = await api<Layaway>(`/layaways/${id}`); setLay(l); setAmount(l.balance); }
  useEffect(() => { load(); }, [id]);
  if (!lay) return <Modal title="ออมก่อนรับ" onClose={onClose}><p className="py-8 text-center text-slate-400">กำลังโหลด…</p></Modal>;

  async function pay() {
    if (amount <= 0) return toast.error('กรอกจำนวนเงิน');
    setBusy(true);
    try { await api(`/layaways/${id}/payments`, { method: 'POST', body: { amount, method } }); toast.success('บันทึกการชำระแล้ว'); await load(); onChanged(); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }
  async function complete() {
    if (!confirm('ยืนยันรับสินค้าและออกบิล? (สต็อกจะถูกตัด)')) return;
    setBusy(true);
    try { await api(`/layaways/${id}/complete`, { method: 'POST' }); toast.success('ออกบิลและตัดสต็อกแล้ว'); onChanged(); onClose(); }
    catch (e) { toast.error((e as Error).message); setBusy(false); }
  }
  async function cancel() {
    if (!confirm('ยกเลิกแผนนี้?')) return;
    await api(`/layaways/${id}/cancel`, { method: 'POST' }); onChanged(); onClose();
  }

  return (
    <Modal title={`${lay.refNo} · ${lay.customerName || 'ลูกค้าทั่วไป'}`} wide onClose={onClose}>
      <div className="grid grid-cols-3 gap-3 text-center">
        <div className="rounded-xl bg-slate-50 p-3"><div className="text-xs text-slate-400">ยอดรวม</div><div className="text-lg font-bold">{money(lay.total)}</div></div>
        <div className="rounded-xl bg-emerald-50 p-3"><div className="text-xs text-emerald-600">ชำระแล้ว</div><div className="text-lg font-bold text-emerald-600">{money(lay.paid)}</div></div>
        <div className="rounded-xl bg-rose-50 p-3"><div className="text-xs text-rose-600">คงค้าง</div><div className="text-lg font-bold text-rose-600">{money(lay.balance)}</div></div>
      </div>

      <div className="mt-3 max-h-32 overflow-auto rounded-xl ring-1 ring-slate-100">
        <table className="w-full text-sm"><tbody>
          {(lay.items ?? []).map((it, i) => <tr key={i} className="border-b border-slate-50 last:border-0"><td className="px-3 py-1.5">{it.nameSnapshot}</td><td className="px-3 py-1.5 text-right text-slate-400">{it.qty} × {num(it.unitPrice).toFixed(2)}</td><td className="px-3 py-1.5 text-right font-medium">{money(it.lineTotal)}</td></tr>)}
        </tbody></table>
      </div>

      {lay.status === 'OPEN' && (
        <div className="mt-3 flex items-end gap-2 rounded-xl bg-slate-50 p-3">
          <div className="flex-1"><label className="label">รับชำระงวด (฿)</label><input type="number" className="input" value={amount || ''} onChange={(e) => setAmount(Math.max(0, Number(e.target.value)))} /></div>
          <div><label className="label">วิธี</label><select className="input" value={method} onChange={(e) => setMethod(e.target.value as 'CASH')}><option value="CASH">เงินสด</option><option value="TRANSFER">โอน</option><option value="CARD">บัตร</option></select></div>
          <button className="btn-primary" disabled={busy || amount <= 0} onClick={pay}>บันทึก</button>
        </div>
      )}

      {(lay.payments ?? []).length > 0 && (
        <div className="mt-3 max-h-32 overflow-auto rounded-xl ring-1 ring-slate-100">
          {(lay.payments ?? []).map((p) => <div key={p.id} className="flex justify-between border-b border-slate-50 px-3 py-1.5 text-sm last:border-0"><span className="text-slate-500">{dateTime(p.createdAt)} · {p.reference || p.method}</span><span className="font-semibold text-emerald-600">{money(p.amount)}</span></div>)}
        </div>
      )}

      {lay.status === 'OPEN' && (
        <div className="mt-4 flex gap-2">
          <button className="btn-ghost flex-1 text-rose-600" onClick={cancel}>ยกเลิกแผน</button>
          <button className="btn-primary flex-1" disabled={busy || lay.balance > 0.001} onClick={complete}><i className="fa-solid fa-box-open mr-1.5" />รับสินค้า + ออกบิล{lay.balance > 0.001 ? ` (เหลือ ${money(lay.balance)})` : ''}</button>
        </div>
      )}
      {lay.status !== 'OPEN' && <div className="mt-4 text-center text-sm text-slate-400">แผนนี้{ST_LABEL[lay.status]}แล้ว{lay.convertedSaleId ? ` · บิล #${lay.convertedSaleId}` : ''}</div>}
    </Modal>
  );
}
