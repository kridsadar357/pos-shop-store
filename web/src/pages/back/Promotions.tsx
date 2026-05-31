import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { Modal } from '../../components/Modal';
import { PageHeader } from '../../components/ui';
import { toast } from '../../components/Toast';
import { money } from '../../lib/format';
import type { Category, Product } from '../../types';

type PromoType = 'PERCENT' | 'FIXED' | 'BXGY';
type PromoScope = 'BILL' | 'PRODUCT' | 'CATEGORY';
interface Promotion {
  id: number;
  code: string | null;
  name: string;
  type: PromoType;
  scope: PromoScope;
  value: string;
  buyQty: number;
  getQty: number;
  productId: number | null;
  categoryId: number | null;
  minSpend: string;
  autoApply: boolean;
  isActive: boolean;
  product?: { name: string } | null;
  category?: { name: string } | null;
}

const empty = {
  code: '', name: '', type: 'PERCENT' as PromoType, scope: 'BILL' as PromoScope,
  value: 0, buyQty: 1, getQty: 1, productId: null as number | null, categoryId: null as number | null,
  minSpend: 0, autoApply: true, isActive: true,
};
type Form = typeof empty;

const TYPE_LABEL: Record<PromoType, string> = { PERCENT: '% ส่วนลด', FIXED: 'ลดจำนวนเงิน', BXGY: 'ซื้อ X แถม Y' };
const SCOPE_LABEL: Record<PromoScope, string> = { BILL: 'ทั้งบิล', PRODUCT: 'สินค้า', CATEGORY: 'หมวดหมู่' };

export default function Promotions() {
  const [promos, setPromos] = useState<Promotion[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [editing, setEditing] = useState<Promotion | null>(null);
  const [form, setForm] = useState<Form | null>(null);

  async function load() { setPromos(await api<Promotion[]>('/promotions')); }
  useEffect(() => {
    load();
    api<Category[]>('/categories').then(setCategories);
    api<Product[]>('/products').then(setProducts);
  }, []);

  function openNew() { setEditing(null); setForm({ ...empty }); }
  function openEdit(p: Promotion) {
    setEditing(p);
    setForm({
      code: p.code ?? '', name: p.name, type: p.type, scope: p.scope,
      value: Number(p.value), buyQty: p.buyQty || 1, getQty: p.getQty || 1,
      productId: p.productId, categoryId: p.categoryId, minSpend: Number(p.minSpend),
      autoApply: p.autoApply, isActive: p.isActive,
    });
  }

  async function save() {
    if (!form) return;
    try {
      const body: any = { ...form, code: form.code || null };
      if (editing) await api(`/promotions/${editing.id}`, { method: 'PUT', body });
      else await api('/promotions', { method: 'POST', body });
      toast.success('บันทึกแล้ว');
      setForm(null);
      load();
    } catch (e) { toast.error((e as Error).message); }
  }
  async function remove(p: Promotion) {
    if (!confirm(`ลบโปรโมชั่น "${p.name}"?`)) return;
    await api(`/promotions/${p.id}`, { method: 'DELETE' });
    load();
  }

  function describe(p: Promotion) {
    if (p.type === 'BXGY') return `ซื้อ ${p.buyQty} แถม ${p.getQty} · ${p.product?.name ?? p.category?.name ?? ''}`;
    const v = p.type === 'PERCENT' ? `${Number(p.value)}%` : money(p.value);
    const tgt = p.scope === 'BILL' ? 'ทั้งบิล' : p.scope === 'CATEGORY' ? p.category?.name : p.product?.name;
    return `ลด ${v} · ${tgt ?? ''}`;
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="การตลาด / โปรโมชั่น"
        subtitle="ส่วนลด/โปรโมชั่น · เปอร์เซ็นต์ จำนวนเงิน และซื้อ X แถม Y (อัตโนมัติหรือคูปอง)"
        icon="🎯"
        actions={<button className="btn-primary" onClick={openNew}>+ เพิ่มโปรโมชั่น</button>}
      />

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
            <tr><th className="px-4 py-3">ชื่อ</th><th className="px-4 py-3">ประเภท</th><th className="px-4 py-3">รายละเอียด</th><th className="px-4 py-3">คูปอง</th><th className="px-4 py-3">ซื้อขั้นต่ำ</th><th className="px-4 py-3">สถานะ</th><th /></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {promos.map((p) => (
              <tr key={p.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-semibold">{p.name}</td>
                <td className="px-4 py-3"><span className="chip bg-violet-50 text-violet-700">{TYPE_LABEL[p.type]}</span></td>
                <td className="px-4 py-3 text-slate-500">{describe(p)}</td>
                <td className="px-4 py-3">{p.autoApply ? <span className="chip bg-emerald-50 text-emerald-700">อัตโนมัติ</span> : <span className="chip bg-amber-50 text-amber-700 font-mono">{p.code}</span>}</td>
                <td className="px-4 py-3 text-right">{Number(p.minSpend) ? money(p.minSpend) : '—'}</td>
                <td className="px-4 py-3"><span className={`chip ${p.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{p.isActive ? 'ใช้งาน' : 'ปิด'}</span></td>
                <td className="px-4 py-3 text-right">
                  <button className="text-sm font-semibold text-brand-600" onClick={() => openEdit(p)}>แก้ไข</button>
                  <button className="ml-3 text-sm font-semibold text-rose-600" onClick={() => remove(p)}>ลบ</button>
                </td>
              </tr>
            ))}
            {promos.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-400">ยังไม่มีโปรโมชั่น</td></tr>}
          </tbody>
        </table>
      </div>

      {form && (
        <Modal title={editing ? 'แก้ไขโปรโมชั่น' : 'เพิ่มโปรโมชั่น'} wide onClose={() => setForm(null)}>
          <div className="grid grid-cols-2 gap-3">
            <F label="ชื่อโปรโมชั่น" className="col-span-2"><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></F>
            <F label="ประเภท">
              <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as PromoType })}>
                {(['PERCENT', 'FIXED', 'BXGY'] as const).map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
              </select>
            </F>
            <F label="ขอบเขต">
              <select className="input" value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value as PromoScope })}>
                {(['BILL', 'PRODUCT', 'CATEGORY'] as const).map((s) => <option key={s} value={s}>{SCOPE_LABEL[s]}</option>)}
              </select>
            </F>

            {form.type !== 'BXGY' ? (
              <F label={form.type === 'PERCENT' ? 'เปอร์เซ็นต์ (%)' : 'จำนวนเงิน (฿)'}>
                <input type="number" className="input" value={form.value} onChange={(e) => setForm({ ...form, value: Number(e.target.value) })} />
              </F>
            ) : (
              <>
                <F label="ซื้อกี่ชิ้น"><input type="number" className="input" value={form.buyQty} onChange={(e) => setForm({ ...form, buyQty: Number(e.target.value) })} /></F>
                <F label="แถมฟรีกี่ชิ้น"><input type="number" className="input" value={form.getQty} onChange={(e) => setForm({ ...form, getQty: Number(e.target.value) })} /></F>
              </>
            )}

            {(form.scope === 'PRODUCT' || form.type === 'BXGY') && (
              <F label="สินค้า">
                <select className="input" value={form.productId ?? ''} onChange={(e) => setForm({ ...form, productId: e.target.value ? Number(e.target.value) : null })}>
                  <option value="">— เลือก —</option>
                  {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </F>
            )}
            {form.scope === 'CATEGORY' && (
              <F label="หมวดหมู่">
                <select className="input" value={form.categoryId ?? ''} onChange={(e) => setForm({ ...form, categoryId: e.target.value ? Number(e.target.value) : null })}>
                  <option value="">— เลือก —</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </F>
            )}

            <F label="ซื้อขั้นต่ำ (฿)"><input type="number" className="input" value={form.minSpend} onChange={(e) => setForm({ ...form, minSpend: Number(e.target.value) })} /></F>
            <F label="รหัสคูปอง (เว้นว่าง = อัตโนมัติ)"><input className="input font-mono" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value, autoApply: !e.target.value })} placeholder="auto-apply" /></F>

            <label className="col-span-2 flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-brand-600" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} /> ใช้งาน</label>
          </div>
          <div className="mt-5 flex gap-2">
            <button className="btn-ghost flex-1" onClick={() => setForm(null)}>ยกเลิก</button>
            <button className="btn-primary flex-1" disabled={!form.name} onClick={save}>บันทึก</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function F({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return <div className={className}><label className="label">{label}</label>{children}</div>;
}
