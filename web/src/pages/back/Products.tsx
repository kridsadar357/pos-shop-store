import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, uploadFile } from '../../api/client';
import { Modal } from '../../components/Modal';
import { ProductImage } from '../../components/ProductImage';
import { DataTable } from '../../components/DataTable';
import { ListToolbar } from '../../components/ListToolbar';
import { toast } from '../../components/Toast';
import { makeExporters, exportProductsZip, type Column } from '../../lib/export';
import { money, num } from '../../lib/format';
import type { Category, Product } from '../../types';

const empty = {
  sku: '',
  barcode: '',
  name: '',
  imageUrl: '' as string | null,
  categoryId: null as number | null,
  unit: 'pc',
  purchaseUnit: '',
  unitsPerPurchase: 1,
  cost: 0,
  retailPrice: 0,
  wholesalePrice: 0,
  wholesaleMinQty: 1,
  reorderLevel: 0,
  isActive: true,
};
type Form = typeof empty;

export default function Products() {
  const [searchParams] = useSearchParams();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [q, setQ] = useState(searchParams.get('q') ?? '');
  const [catFilter, setCatFilter] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [stockFilter, setStockFilter] = useState('');
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [costHistory, setCostHistory] = useState<{ refNo: string; date: string; supplier: string; qty: number; unitCost: string }[]>([]);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    setProducts(await api<Product[]>('/products', { query: { q } }));
  }
  useEffect(() => {
    api<Category[]>('/categories').then(setCategories);
  }, []);
  useEffect(() => {
    const t = setTimeout(load, 150);
    return () => clearTimeout(t);
  }, [q]);

  function openNew() {
    setEditing(null);
    setImageFile(null);
    setCostHistory([]);
    setForm({ ...empty });
  }
  function openEdit(p: Product) {
    setEditing(p);
    setImageFile(null);
    setCostHistory([]);
    api<typeof costHistory>(`/products/${p.id}/cost-history`).then(setCostHistory).catch(() => {});
    setForm({
      sku: p.sku,
      barcode: p.barcode ?? '',
      name: p.name,
      imageUrl: p.imageUrl ?? '',
      categoryId: p.categoryId,
      unit: p.unit,
      purchaseUnit: p.purchaseUnit ?? '',
      unitsPerPurchase: p.unitsPerPurchase ?? 1,
      cost: num(p.cost),
      retailPrice: num(p.retailPrice),
      wholesalePrice: num(p.wholesalePrice),
      wholesaleMinQty: p.wholesaleMinQty,
      reorderLevel: p.reorderLevel,
      isActive: p.isActive,
    });
  }

  async function save() {
    if (!form) return;
    try {
      const body = { ...form, barcode: form.barcode || null, imageUrl: form.imageUrl || null };
      const saved = editing
        ? await api<Product>(`/products/${editing.id}`, { method: 'PUT', body })
        : await api<Product>('/products', { method: 'POST', body });
      // Upload a newly picked image to the (now-existing) product.
      if (imageFile) await uploadFile(`/products/${saved.id}/image`, 'image', imageFile);
      toast.success('บันทึกแล้ว');
      setForm(null);
      setImageFile(null);
      load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const previewUrl = imageFile ? URL.createObjectURL(imageFile) : form?.imageUrl || null;

  const filtered = useMemo(() => {
    const lo = minPrice ? Number(minPrice) : -Infinity;
    const hi = maxPrice ? Number(maxPrice) : Infinity;
    return products.filter((p) => {
      const price = num(p.retailPrice);
      if (catFilter && String(p.categoryId ?? '') !== catFilter) return false;
      if (price < lo || price > hi) return false;
      if (stockFilter === 'out' && p.stockQty > 0) return false;
      if (stockFilter === 'low' && !(p.stockQty > 0 && p.stockQty <= p.reorderLevel)) return false;
      if (stockFilter === 'in' && p.stockQty <= p.reorderLevel) return false;
      return true;
    });
  }, [products, catFilter, minPrice, maxPrice, stockFilter]);

  const filterCount = [catFilter, minPrice, maxPrice, stockFilter].filter(Boolean).length;

  const columns: Column<Product>[] = [
    { label: 'SKU', value: (p) => p.sku },
    { label: 'บาร์โค้ด', value: (p) => p.barcode ?? '' },
    { label: 'ชื่อสินค้า', value: (p) => p.name },
    { label: 'หมวดหมู่', value: (p) => p.category?.name ?? '' },
    { label: 'หน่วย', value: (p) => p.unit },
    { label: 'ทุน', value: (p) => num(p.cost), right: true },
    { label: 'ราคาปลีก', value: (p) => num(p.retailPrice), right: true },
    { label: 'ราคาส่ง', value: (p) => num(p.wholesalePrice), right: true },
    { label: 'ขั้นต่ำราคาส่ง', value: (p) => p.wholesaleMinQty, right: true },
    { label: 'จุดสั่งซื้อซ้ำ', value: (p) => p.reorderLevel, right: true },
    { label: 'คงเหลือ', value: (p) => p.stockQty, right: true },
    { label: 'สถานะ', value: (p) => (p.isActive ? 'ใช้งาน' : 'ปิด') },
  ];
  const exporters = makeExporters({ filename: 'products', title: 'รายการสินค้า', columns, rows: () => filtered });

  return (
    <div className="flex h-full flex-col gap-4">
      <ListToolbar
        title="สินค้าและสต็อก"
        subtitle={`${filtered.length} รายการ`}
        icon={<i className="fa-solid fa-box" />}
        q={q} setQ={setQ} placeholder="ค้นหาชื่อ / รหัส SKU / บาร์โค้ด…"
        primary={<button className="btn-primary" onClick={openNew}><i className="fa-solid fa-plus mr-1.5" />เพิ่มสินค้า</button>}
        exports={{ ...exporters, zip: () => exportProductsZip('products-with-images.zip', columns, filtered) }}
        filterCount={filterCount}
        onResetFilter={() => { setCatFilter(''); setMinPrice(''); setMaxPrice(''); setStockFilter(''); }}
        filter={
          <>
            <div>
              <label className="label">หมวดหมู่</label>
              <select className="input" value={catFilter} onChange={(e) => setCatFilter(e.target.value)}>
                <option value="">ทุกหมวดหมู่</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">ช่วงราคาปลีก (฿)</label>
              <div className="flex items-center gap-2">
                <input type="number" className="input" placeholder="ต่ำสุด" value={minPrice} onChange={(e) => setMinPrice(e.target.value)} />
                <span className="text-slate-300">—</span>
                <input type="number" className="input" placeholder="สูงสุด" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} />
              </div>
            </div>
            <div>
              <label className="label">สถานะสต็อก</label>
              <select className="input" value={stockFilter} onChange={(e) => setStockFilter(e.target.value)}>
                <option value="">ทั้งหมด</option>
                <option value="in">สต็อกปกติ</option>
                <option value="low">ใกล้หมด (≤ จุดสั่งซื้อ)</option>
                <option value="out">หมดสต็อก</option>
              </select>
            </div>
          </>
        }
      />

      <DataTable
        rows={filtered}
        colCount={8}
        reserve={300}
        head={
          <tr>
            <th className="px-4 py-3 w-14"></th>
            <th className="px-4 py-3">สินค้า</th>
            <th className="px-4 py-3">หมวดหมู่</th>
            <th className="px-4 py-3 text-right">ทุน</th>
            <th className="px-4 py-3 text-right">ปลีก</th>
            <th className="px-4 py-3 text-right">ส่ง</th>
            <th className="px-4 py-3 text-right">คงเหลือ</th>
            <th></th>
          </tr>
        }
        renderRow={(p) => (
          <tr key={p.id} className="hover:bg-slate-50">
            <td className="py-2 pl-4">
              <ProductImage src={p.imageUrl} name={p.name} className="h-10 w-10 rounded-lg ring-1 ring-slate-200" />
            </td>
            <td className="px-4 py-3">
              <div className="font-semibold">{p.name}</div>
              <div className="text-xs text-slate-400">{p.sku} {p.barcode && `• ${p.barcode}`}</div>
            </td>
            <td className="px-4 py-3 text-slate-500">{p.category?.name ?? '—'}</td>
            <td className="px-4 py-3 text-right">{money(p.cost)}</td>
            <td className="px-4 py-3 text-right">{money(p.retailPrice)}</td>
            <td className="px-4 py-3 text-right">{money(p.wholesalePrice)} <span className="text-xs text-slate-400">≥{p.wholesaleMinQty}</span></td>
            <td className="px-4 py-3 text-right">
              <span className={`chip ${p.stockQty <= p.reorderLevel ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-700'}`}>
                {p.stockQty} {p.unit}
              </span>
            </td>
            <td className="px-4 py-3 text-right">
              <button className="text-sm font-semibold text-brand-600" onClick={() => openEdit(p)}>แก้ไข</button>
            </td>
          </tr>
        )}
      />

      {form && (
        <Modal title={editing ? 'แก้ไขสินค้า' : 'เพิ่มสินค้า'} wide onClose={() => setForm(null)}>
          <div className="mb-3 flex items-center gap-4">
            <ProductImage src={previewUrl} name={form.name || '?'} className="h-20 w-20 rounded-2xl ring-1 ring-slate-200" />
            <div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
              />
              <button type="button" className="btn-ghost" onClick={() => fileRef.current?.click()}>📷 อัปโหลดรูป</button>
              {(imageFile || form.imageUrl) && (
                <button type="button" className="ml-2 text-sm font-semibold text-rose-600" onClick={() => { setImageFile(null); setForm({ ...form, imageUrl: '' }); }}>
                  ลบรูป
                </button>
              )}
              <p className="mt-1 text-xs text-slate-400">PNG/JPG ไม่เกิน 4MB</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="ชื่อสินค้า" className="col-span-2">
              <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label="รหัส SKU">
              <input className="input" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
            </Field>
            <Field label="บาร์โค้ด">
              <input className="input" value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} />
            </Field>
            <Field label="หมวดหมู่">
              <select className="input" value={form.categoryId ?? ''} onChange={(e) => setForm({ ...form, categoryId: e.target.value ? Number(e.target.value) : null })}>
                <option value="">—</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            <Field label="หน่วยขาย (หน่วยฐาน)">
              <input className="input" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="เช่น ชิ้น" />
            </Field>
            <Field label="หน่วยซื้อ (แพ็ก/ลัง)">
              <input className="input" value={form.purchaseUnit} onChange={(e) => setForm({ ...form, purchaseUnit: e.target.value })} placeholder="เช่น ลัง (เว้นว่าง = เท่าหน่วยขาย)" />
            </Field>
            <NumField label={`จำนวนต่อ${form.purchaseUnit || 'หน่วยซื้อ'} (ชิ้น)`} v={form.unitsPerPurchase} set={(v) => setForm({ ...form, unitsPerPurchase: v })} />
            <NumField label="ทุน" v={form.cost} set={(v) => setForm({ ...form, cost: v })} />
            <NumField label="ราคาปลีก" v={form.retailPrice} set={(v) => setForm({ ...form, retailPrice: v })} />
            <NumField label="ราคาส่ง" v={form.wholesalePrice} set={(v) => setForm({ ...form, wholesalePrice: v })} />
            <NumField label="จำนวนขั้นต่ำราคาส่ง" v={form.wholesaleMinQty} set={(v) => setForm({ ...form, wholesaleMinQty: v })} />
            <NumField label="จุดสั่งซื้อซ้ำ" v={form.reorderLevel} set={(v) => setForm({ ...form, reorderLevel: v })} />
          </div>
          {editing && <p className="mt-3 text-xs text-slate-400">การปรับสต็อกทำผ่าน รับสินค้า / นับสต็อก / บัญชีสต็อก — สต็อกควบคุมด้วยบัญชีเดินสินค้า</p>}

          {editing && costHistory.length > 0 && (
            <div className="mt-3 border-t border-slate-100 pt-3">
              <div className="mb-2 text-sm font-bold text-ink-900"><i className="fa-solid fa-clock-rotate-left mr-1.5 text-brand-600" />ประวัติราคาทุน (จากการรับสินค้า)</div>
              <div className="max-h-40 overflow-auto rounded-xl ring-1 ring-slate-200">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400"><tr><th className="px-3 py-2">วันที่</th><th className="px-3 py-2">ผู้จำหน่าย</th><th className="px-3 py-2 text-right">จำนวน</th><th className="px-3 py-2 text-right">ทุน/หน่วย</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {costHistory.map((h, i) => (
                      <tr key={i}><td className="px-3 py-1.5 text-slate-500">{new Date(h.date).toLocaleDateString('th-TH')}</td><td className="px-3 py-1.5">{h.supplier}</td><td className="px-3 py-1.5 text-right">{h.qty}</td><td className="px-3 py-1.5 text-right font-medium">{money(h.unitCost)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          <div className="mt-5 flex gap-2">
            <button className="btn-ghost flex-1" onClick={() => setForm(null)}>ยกเลิก</button>
            <button className="btn-primary flex-1" onClick={save}>บันทึก</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="label">{label}</label>
      {children}
    </div>
  );
}
function NumField({ label, v, set }: { label: string; v: number; set: (v: number) => void }) {
  return (
    <Field label={label}>
      <input type="number" className="input" value={v} onChange={(e) => set(Number(e.target.value))} />
    </Field>
  );
}
