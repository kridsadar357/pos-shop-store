import { useEffect, useMemo, useState } from 'react';
import { api } from '../../api/client';
import { Modal } from '../../components/Modal';
import { DataTable } from '../../components/DataTable';
import { ListToolbar } from '../../components/ListToolbar';
import { QuotationDoc } from '../../components/QuotationDoc';
import { makeExporters, type Column } from '../../lib/export';
import { dateTime, money, num } from '../../lib/format';
import { toast } from '../../components/Toast';
import type { Product, Quotation, Setting } from '../../types';

const ST_LABEL: Record<Quotation['status'], string> = { DRAFT: 'ร่าง', SENT: 'ส่งแล้ว', ACCEPTED: 'ตอบรับ', CONVERTED: 'แปลงเป็นการขาย', EXPIRED: 'หมดอายุ', CANCELLED: 'ยกเลิก' };
const ST_CHIP: Record<Quotation['status'], string> = {
  DRAFT: 'bg-slate-100 text-slate-500', SENT: 'bg-sky-50 text-sky-700', ACCEPTED: 'bg-emerald-50 text-emerald-700',
  CONVERTED: 'bg-violet-50 text-violet-700', EXPIRED: 'bg-amber-50 text-amber-700', CANCELLED: 'bg-rose-50 text-rose-700',
};

type Row = { product: Product; qty: number; unitPrice: number };

export default function Quotations() {
  const [rows, setRows] = useState<Quotation[]>([]);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [form, setForm] = useState<Quotation | null>(null);
  const [editId, setEditId] = useState<number | null>(null);
  const [printDoc, setPrintDoc] = useState<Quotation | null>(null);
  const [setting, setSetting] = useState<Setting | null>(null);

  async function load() { setRows(await api<Quotation[]>('/quotations', { query: { ...(q ? { q } : {}), ...(status ? { status } : {}) } })); }
  useEffect(() => { const t = setTimeout(load, 150); return () => clearTimeout(t); }, [q, status]);
  useEffect(() => { api<Setting>('/settings').then(setSetting).catch(() => {}); }, []);

  async function openNew() { setEditId(null); setForm({} as Quotation); }
  async function openEdit(id: number) { const full = await api<Quotation>(`/quotations/${id}`); setEditId(id); setForm(full); }
  async function doPrint(id: number) { setPrintDoc(await api<Quotation>(`/quotations/${id}`)); }

  async function setStatusOf(qt: Quotation, s: string) { await api(`/quotations/${qt.id}/status`, { method: 'POST', body: { status: s } }); load(); }
  async function emailQuote(qt: Quotation) {
    const to = prompt(`ส่งใบเสนอราคา ${qt.refNo} ไปยังอีเมล:`, '')?.trim();
    if (!to) return;
    try { await api(`/quotations/${qt.id}/email`, { method: 'POST', body: { to } }); toast.success(`ส่งใบเสนอราคาไปยัง ${to} แล้ว`); load(); }
    catch (e) { toast.error((e as Error).message); }
  }
  async function remove(qt: Quotation) { if (!confirm(`ลบใบเสนอราคา ${qt.refNo}?`)) return; await api(`/quotations/${qt.id}`, { method: 'DELETE' }); load(); }
  async function convert(qt: Quotation) {
    if (!confirm(`แปลงใบเสนอราคา ${qt.refNo} เป็นการขาย (เงินเชื่อ)?`)) return;
    try { await api(`/quotations/${qt.id}/convert`, { method: 'POST', body: { paymentMethod: 'CREDIT' } }); toast.success('สร้างการขายจากใบเสนอราคาแล้ว'); load(); }
    catch (e) { toast.error((e as Error).message); }
  }

  const columns: Column<Quotation>[] = [
    { label: 'เลขที่', value: (r) => r.refNo },
    { label: 'ลูกค้า', value: (r) => r.customerName },
    { label: 'วันที่', value: (r) => dateTime(r.createdAt) },
    { label: 'ยอดรวม', value: (r) => num(r.total), right: true },
    { label: 'สถานะ', value: (r) => ST_LABEL[r.status] },
  ];
  const exporters = makeExporters({ filename: 'quotations', title: 'ใบเสนอราคา', columns, rows: () => rows });

  return (
    <div className="flex h-full flex-col gap-4">
      <ListToolbar
        title="ใบเสนอราคา"
        subtitle="ออกใบเสนอราคา/ใบราคา แล้วแปลงเป็นการขายได้ในคลิกเดียว"
        icon={<i className="fa-solid fa-file-lines" />}
        q={q} setQ={setQ} placeholder="ค้นหาเลขที่ / ลูกค้า…"
        primary={<button className="btn-primary" onClick={openNew}><i className="fa-solid fa-plus mr-1.5" />สร้างใบเสนอราคา</button>}
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
        colCount={6}
        empty="ยังไม่มีใบเสนอราคา"
        head={<tr><th className="px-4 py-3">เลขที่</th><th className="px-4 py-3">ลูกค้า</th><th className="px-4 py-3">วันที่</th><th className="px-4 py-3 text-right">ยอดรวม</th><th className="px-4 py-3">สถานะ</th><th /></tr>}
        renderRow={(r) => (
          <tr key={r.id} className="hover:bg-slate-50">
            <td className="px-4 py-3 font-mono font-semibold">{r.refNo}</td>
            <td className="px-4 py-3">{r.customerName || 'ลูกค้าทั่วไป'}</td>
            <td className="px-4 py-3 text-slate-500">{dateTime(r.createdAt)}</td>
            <td className="px-4 py-3 text-right font-bold">{money(r.total)}</td>
            <td className="px-4 py-3"><span className={`chip ${ST_CHIP[r.status]}`}>{ST_LABEL[r.status]}</span></td>
            <td className="px-4 py-3 text-right whitespace-nowrap text-sm">
              <button className="font-semibold text-slate-600" onClick={() => doPrint(r.id)}>พิมพ์</button>
              <button className="ml-3 font-semibold text-emerald-600" onClick={() => emailQuote(r)}>อีเมล</button>
              {r.status !== 'CONVERTED' && <button className="ml-3 font-semibold text-brand-600" onClick={() => openEdit(r.id)}>แก้ไข</button>}
              {r.status !== 'CONVERTED' && <button className="ml-3 font-semibold text-emerald-600" onClick={() => convert(r)}>แปลงเป็นการขาย</button>}
              {r.status === 'DRAFT' && <button className="ml-3 font-semibold text-sky-600" onClick={() => setStatusOf(r, 'SENT')}>ส่งแล้ว</button>}
              {(r.status === 'DRAFT' || r.status === 'CANCELLED') && <button className="ml-3 font-semibold text-rose-600" onClick={() => remove(r)}>ลบ</button>}
            </td>
          </tr>
        )}
      />

      {form && <QuotationForm initial={editId ? form : null} onClose={() => setForm(null)} onSaved={() => { setForm(null); load(); }} />}
      {printDoc && <QuotationDoc quotation={printDoc} setting={setting} onDone={() => setPrintDoc(null)} />}
    </div>
  );
}

function QuotationForm({ initial, onClose, onSaved }: { initial: Quotation | null; onClose: () => void; onSaved: () => void }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState('');
  const [customerName, setCustomerName] = useState(initial?.customerName ?? '');
  const [type, setType] = useState<'RETAIL' | 'WHOLESALE'>(initial?.type ?? 'RETAIL');
  const [discount, setDiscount] = useState(initial ? num(initial.discount) : 0);
  const [validUntil, setValidUntil] = useState(initial?.validUntil ? initial.validUntil.slice(0, 10) : '');
  const [note, setNote] = useState(initial?.note ?? '');
  const [lines, setLines] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<Product[]>('/products').then((ps) => {
      setProducts(ps);
      if (initial?.items) {
        const byId = new Map(ps.map((p) => [p.id, p]));
        setLines(initial.items.filter((it) => byId.has(it.productId)).map((it) => ({ product: byId.get(it.productId)!, qty: it.qty, unitPrice: num(it.unitPrice) })));
      }
    }).catch(() => {});
  }, []);

  function priceFor(p: Product) { return num(type === 'WHOLESALE' ? p.wholesalePrice : p.retailPrice); }
  function addProduct(p: Product) {
    setLines((ls) => ls.some((l) => l.product.id === p.id) ? ls.map((l) => l.product.id === p.id ? { ...l, qty: l.qty + 1 } : l) : [...ls, { product: p, qty: 1, unitPrice: priceFor(p) }]);
  }
  function setLine(id: number, patch: Partial<Row>) { setLines((ls) => ls.map((l) => l.product.id === id ? { ...l, ...patch } : l)); }
  function removeLine(id: number) { setLines((ls) => ls.filter((l) => l.product.id !== id)); }

  const subtotal = useMemo(() => lines.reduce((s, l) => s + l.unitPrice * l.qty, 0), [lines]);
  const filteredProducts = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return products.slice(0, 30);
    return products.filter((p) => p.name.toLowerCase().includes(term) || p.sku.toLowerCase().includes(term) || (p.barcode ?? '').includes(term)).slice(0, 30);
  }, [products, search]);

  async function save() {
    if (lines.length === 0) return toast.error('เพิ่มรายการสินค้าก่อน');
    setBusy(true);
    try {
      const body = {
        customerName, type, note, discount,
        validUntil: validUntil ? new Date(`${validUntil}T23:59:59`).toISOString() : null,
        items: lines.map((l) => ({ productId: l.product.id, qty: l.qty, unitPrice: l.unitPrice })),
      };
      if (initial) await api(`/quotations/${(initial as Quotation).id}`, { method: 'PUT', body });
      else await api('/quotations', { method: 'POST', body });
      toast.success('บันทึกใบเสนอราคาแล้ว');
      onSaved();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <Modal title={initial ? `แก้ไข ${initial.refNo}` : 'สร้างใบเสนอราคา'} wide onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="label">ชื่อลูกค้า</label><input className="input" value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="ลูกค้าทั่วไป" /></div>
        <div>
          <label className="label">ประเภทราคา</label>
          <select className="input" value={type} onChange={(e) => setType(e.target.value as 'RETAIL' | 'WHOLESALE')}>
            <option value="RETAIL">ขายปลีก</option>
            <option value="WHOLESALE">ขายส่ง</option>
          </select>
        </div>
      </div>

      <div className="mt-3">
        <label className="label">เพิ่มสินค้า</label>
        <input className="input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหาสินค้า / SKU…" />
        {search && (
          <div className="mt-1 max-h-36 overflow-auto rounded-xl ring-1 ring-slate-100">
            {filteredProducts.map((p) => (
              <button key={p.id} className="flex w-full items-center justify-between border-b border-slate-50 px-3 py-2 text-left text-sm hover:bg-slate-50 last:border-0" onClick={() => { addProduct(p); setSearch(''); }}>
                <span>{p.name}</span><span className="text-slate-400">{money(priceFor(p))}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="mt-3 max-h-52 overflow-auto rounded-xl ring-1 ring-slate-100">
        {lines.length === 0 ? <p className="px-3 py-6 text-center text-sm text-slate-400">ยังไม่มีรายการ</p> : (
          <table className="w-full text-sm">
            <tbody>
              {lines.map((l) => (
                <tr key={l.product.id} className="border-b border-slate-50 last:border-0">
                  <td className="px-3 py-2">{l.product.name}</td>
                  <td className="px-2 py-2"><input type="number" className="w-16 rounded bg-slate-50 px-2 py-1 text-center ring-1 ring-slate-200 outline-none" value={l.qty} onChange={(e) => setLine(l.product.id, { qty: Math.max(1, Math.floor(Number(e.target.value)) || 1) })} /></td>
                  <td className="px-2 py-2"><input type="number" className="w-24 rounded bg-slate-50 px-2 py-1 text-right ring-1 ring-slate-200 outline-none" value={l.unitPrice} onChange={(e) => setLine(l.product.id, { unitPrice: Math.max(0, Number(e.target.value)) })} /></td>
                  <td className="px-3 py-2 text-right font-semibold">{money(l.unitPrice * l.qty)}</td>
                  <td className="pr-2 text-right"><button className="text-slate-300 hover:text-rose-500" onClick={() => removeLine(l.product.id)}>✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <div><label className="label">ส่วนลด (฿)</label><input type="number" className="input" value={discount || ''} onChange={(e) => setDiscount(Math.max(0, Number(e.target.value)))} /></div>
        <div><label className="label">ยืนราคาถึง</label><input type="date" className="input" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} /></div>
        <div className="col-span-2"><label className="label">หมายเหตุ</label><input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></div>
      </div>

      <div className="mt-3 flex items-center justify-between rounded-xl bg-slate-50 px-4 py-2.5">
        <span className="text-sm text-slate-500">รวมก่อนส่วนลด</span>
        <span className="text-lg font-extrabold">{money(subtotal)}</span>
      </div>

      <div className="mt-4 flex gap-2"><button className="btn-ghost flex-1" onClick={onClose}>ยกเลิก</button><button className="btn-primary flex-1" disabled={busy || lines.length === 0} onClick={save}>บันทึก</button></div>
    </Modal>
  );
}
