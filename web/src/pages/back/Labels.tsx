import { useEffect, useMemo, useState } from 'react';
import { api } from '../../api/client';
import { Barcode } from '../../components/Barcode';
import { money, num } from '../../lib/format';
import { toast } from '../../components/Toast';
import type { Category, Product } from '../../types';

type Sel = { product: Product; copies: number };

// Labels per row on the A4 sheet → CSS grid columns.
const COLS = [2, 3, 4] as const;

export default function Labels() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [q, setQ] = useState('');
  const [catId, setCatId] = useState<number | null>(null);
  const [sel, setSel] = useState<Record<number, Sel>>({});
  const [cols, setCols] = useState<(typeof COLS)[number]>(3);
  const [showName, setShowName] = useState(true);
  const [showPrice, setShowPrice] = useState(true);
  const [priceKind, setPriceKind] = useState<'retail' | 'wholesale'>('retail');

  useEffect(() => {
    api<Product[]>('/products').then(setProducts).catch(() => {});
    api<Category[]>('/categories').then(setCategories).catch(() => {});
  }, []);

  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    return products.filter((p) => {
      if (catId != null && p.categoryId !== catId) return false;
      if (!term) return true;
      return p.name.toLowerCase().includes(term) || p.sku.toLowerCase().includes(term) || (p.barcode ?? '').includes(term);
    });
  }, [products, q, catId]);

  function add(p: Product) { setSel((s) => ({ ...s, [p.id]: { product: p, copies: s[p.id]?.copies ?? 1 } })); }
  function setCopies(id: number, n: number) {
    setSel((s) => {
      if (n <= 0) { const { [id]: _drop, ...rest } = s; return rest; }
      return { ...s, [id]: { ...s[id], copies: n } };
    });
  }
  function addAllVisible() { setSel((s) => { const next = { ...s }; for (const p of list) if (!next[p.id]) next[p.id] = { product: p, copies: 1 }; return next; }); }

  const selected = Object.values(sel);
  const totalLabels = selected.reduce((a, s) => a + s.copies, 0);

  // Expand selections into a flat list of label cells.
  const cells = useMemo(() => {
    const out: Product[] = [];
    for (const s of selected) for (let i = 0; i < s.copies; i++) out.push(s.product);
    return out;
  }, [sel]);

  function priceOf(p: Product) { return priceKind === 'wholesale' ? num(p.wholesalePrice) : num(p.retailPrice); }
  function codeOf(p: Product) { return p.barcode || p.sku; }

  function print() {
    if (totalLabels === 0) return toast.error('เลือกสินค้าที่จะพิมพ์ก่อน');
    const done = () => { window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    setTimeout(() => window.print(), 150); // let barcodes render
  }

  const sheet = (
    <div className="label-sheet" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
      {cells.map((p, i) => (
        <div key={i} className="label-cell">
          {showName && <div className="l-name">{p.name}</div>}
          <Barcode value={codeOf(p)} height={cols >= 4 ? 30 : 38} width={cols >= 4 ? 1.1 : 1.4} />
          {showPrice && <div className="l-price">{money(priceOf(p))}</div>}
        </div>
      ))}
    </div>
  );

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-extrabold text-ink-900"><i className="fa-solid fa-barcode mr-2 text-brand-600" />พิมพ์ป้ายราคา / บาร์โค้ด</h1>
          <p className="text-sm text-slate-400">เลือกสินค้า กำหนดจำนวนป้าย แล้วพิมพ์เป็นแผ่น A4</p>
        </div>
        <button className="btn-primary" disabled={totalLabels === 0} onClick={print}>
          <i className="fa-solid fa-print mr-1.5" />พิมพ์ {totalLabels > 0 ? `(${totalLabels} ป้าย)` : ''}
        </button>
      </div>

      <div className="grid flex-1 grid-cols-1 gap-4 overflow-hidden lg:grid-cols-2">
        {/* product picker */}
        <div className="card flex flex-col overflow-hidden p-4">
          <div className="mb-3 flex gap-2">
            <div className="flex flex-1 items-center gap-2 rounded-xl bg-slate-50 px-3 ring-1 ring-slate-200">
              <i className="fa-solid fa-magnifying-glass text-slate-400" />
              <input className="w-full bg-transparent py-2 text-sm outline-none" placeholder="ค้นหาสินค้า / SKU / บาร์โค้ด…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <select className="input w-40" value={catId ?? ''} onChange={(e) => setCatId(e.target.value ? Number(e.target.value) : null)}>
              <option value="">ทุกหมวด</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <button className="mb-2 self-start text-xs font-semibold text-brand-600" onClick={addAllVisible}>+ เพิ่มทั้งหมดที่แสดง ({list.length})</button>
          <div className="flex-1 overflow-auto rounded-xl ring-1 ring-slate-100">
            {list.map((p) => (
              <button key={p.id} onClick={() => add(p)} className="flex w-full items-center justify-between border-b border-slate-50 px-3 py-2 text-left text-sm hover:bg-slate-50 last:border-0">
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{p.name}</span>
                  <span className="block font-mono text-[11px] text-slate-400">{p.barcode || p.sku} · {money(num(p.retailPrice))}</span>
                </span>
                {sel[p.id] ? <span className="chip bg-emerald-50 text-emerald-700">เลือกแล้ว</span> : <i className="fa-solid fa-plus text-slate-300" />}
              </button>
            ))}
          </div>
        </div>

        {/* options + selected + preview */}
        <div className="card flex flex-col overflow-hidden p-4">
          <div className="grid grid-cols-2 gap-3 border-b border-slate-100 pb-3">
            <div>
              <label className="label">ป้ายต่อแถว</label>
              <select className="input" value={cols} onChange={(e) => setCols(Number(e.target.value) as (typeof COLS)[number])}>
                {COLS.map((c) => <option key={c} value={c}>{c} ป้าย</option>)}
              </select>
            </div>
            <div>
              <label className="label">ราคาที่แสดง</label>
              <select className="input" value={priceKind} onChange={(e) => setPriceKind(e.target.value as 'retail' | 'wholesale')}>
                <option value="retail">ราคาปลีก</option>
                <option value="wholesale">ราคาส่ง</option>
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-brand-600" checked={showName} onChange={(e) => setShowName(e.target.checked)} /> แสดงชื่อสินค้า</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-brand-600" checked={showPrice} onChange={(e) => setShowPrice(e.target.checked)} /> แสดงราคา</label>
          </div>

          <div className="py-2 text-xs font-semibold text-slate-400">สินค้าที่เลือก ({selected.length})</div>
          <div className="max-h-44 overflow-auto rounded-xl ring-1 ring-slate-100">
            {selected.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-slate-400">ยังไม่ได้เลือกสินค้า</p>
            ) : selected.map((s) => (
              <div key={s.product.id} className="flex items-center justify-between border-b border-slate-50 px-3 py-2 text-sm last:border-0">
                <span className="min-w-0 flex-1 truncate">{s.product.name}</span>
                <div className="flex items-center gap-1">
                  <button className="grid h-6 w-6 place-items-center rounded bg-slate-100 text-slate-500" onClick={() => setCopies(s.product.id, s.copies - 1)}>−</button>
                  <input className="w-10 rounded bg-slate-50 py-1 text-center text-sm ring-1 ring-slate-200 outline-none" value={s.copies} onChange={(e) => setCopies(s.product.id, Math.max(0, Math.floor(Number(e.target.value)) || 0))} />
                  <button className="grid h-6 w-6 place-items-center rounded bg-slate-100 text-slate-500" onClick={() => setCopies(s.product.id, s.copies + 1)}>+</button>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-3 flex-1 overflow-auto rounded-xl bg-slate-50 p-3">
            <div className="mb-2 text-xs font-semibold text-slate-400">ตัวอย่าง</div>
            {totalLabels === 0 ? <p className="text-center text-sm text-slate-400">เลือกสินค้าเพื่อดูตัวอย่างป้าย</p> : <div className="rounded-lg bg-white p-2">{sheet}</div>}
          </div>
        </div>
      </div>

      {/* off-screen print sheet */}
      <div className="label-print">{sheet}</div>
    </div>
  );
}
