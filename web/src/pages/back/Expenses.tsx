import { useEffect, useMemo, useState } from 'react';
import { api } from '../../api/client';
import { Modal } from '../../components/Modal';
import { DataTable } from '../../components/DataTable';
import { ListToolbar } from '../../components/ListToolbar';
import { makeExporters, type Column } from '../../lib/export';
import { useBranch } from '../../store/branch';
import { dateTime, money, num } from '../../lib/format';
import { toast } from '../../components/Toast';
import type { Expense } from '../../types';

function today() { return new Date().toISOString().slice(0, 10); }

// Common Thai retail expense categories (free text is still allowed).
const CATEGORIES = ['ค่าเช่า', 'ค่าน้ำ-ไฟ', 'เงินเดือน/ค่าแรง', 'วัสดุสิ้นเปลือง', 'ค่าขนส่ง', 'ค่าการตลาด', 'ซ่อมบำรุง', 'ภาษี/ค่าธรรมเนียม', 'อื่นๆ'];

const empty = { date: today(), category: 'อื่นๆ', amount: 0, vendor: '', note: '', paymentMethod: 'CASH' as 'CASH' | 'TRANSFER', branchId: null as number | null };
type Form = typeof empty;

export default function Expenses() {
  const branches = useBranch((s) => s.branches);
  const activeBranch = useBranch((s) => s.activeId);
  const [rows, setRows] = useState<Expense[]>([]);
  const [q, setQ] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [branch, setBranch] = useState('');
  const [category, setCategory] = useState('');
  const [editing, setEditing] = useState<Expense | null>(null);
  const [form, setForm] = useState<Form | null>(null);

  async function load() {
    const query: Record<string, string> = {};
    if (from) query.from = new Date(`${from}T00:00:00`).toISOString();
    if (to) query.to = new Date(`${to}T23:59:59`).toISOString();
    if (branch) query.branchId = branch;
    if (category) query.category = category;
    setRows(await api<Expense[]>('/expenses', { query }));
  }
  useEffect(() => { load(); }, [from, to, branch, category]);

  function openNew() { setEditing(null); setForm({ ...empty, branchId: activeBranch ?? null }); }
  function openEdit(e: Expense) {
    setEditing(e);
    setForm({ date: e.date.slice(0, 10), category: e.category, amount: num(e.amount), vendor: e.vendor, note: e.note, paymentMethod: e.paymentMethod, branchId: e.branchId });
  }

  async function save() {
    if (!form) return;
    try {
      const body = { ...form, date: new Date(`${form.date}T12:00:00`).toISOString() };
      if (editing) await api(`/expenses/${editing.id}`, { method: 'PUT', body });
      else await api('/expenses', { method: 'POST', body });
      toast.success('บันทึกแล้ว');
      setForm(null);
      load();
    } catch (e) { toast.error((e as Error).message); }
  }
  async function remove(e: Expense) {
    if (!confirm(`ลบรายจ่าย "${e.category} · ${money(e.amount)}"?`)) return;
    await api(`/expenses/${e.id}`, { method: 'DELETE' });
    load();
  }

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((e) => e.category.toLowerCase().includes(term) || e.vendor.toLowerCase().includes(term) || e.note.toLowerCase().includes(term));
  }, [rows, q]);

  const total = useMemo(() => filtered.reduce((s, e) => s + num(e.amount), 0), [filtered]);
  const byCategory = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of filtered) m.set(e.category, (m.get(e.category) ?? 0) + num(e.amount));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [filtered]);

  const filterCount = [branch, category, from, to].filter(Boolean).length;

  const columns: Column<Expense>[] = [
    { label: 'วันที่', value: (e) => dateTime(e.date) },
    { label: 'หมวดหมู่', value: (e) => e.category },
    { label: 'ผู้รับเงิน', value: (e) => e.vendor },
    { label: 'หมายเหตุ', value: (e) => e.note },
    { label: 'การชำระ', value: (e) => (e.paymentMethod === 'CASH' ? 'เงินสด' : 'โอน') },
    { label: 'สาขา', value: (e) => e.branch?.name ?? '' },
    { label: 'จำนวนเงิน', value: (e) => num(e.amount), right: true },
  ];
  const exporters = makeExporters({ filename: 'expenses', title: 'รายงานค่าใช้จ่าย', columns, rows: () => filtered });

  return (
    <div className="flex h-full flex-col gap-4">
      <ListToolbar
        title="ค่าใช้จ่าย"
        subtitle="บันทึกค่าใช้จ่ายในการดำเนินงาน เช่น ค่าเช่า ค่าน้ำ-ไฟ เงินเดือน"
        icon={<i className="fa-solid fa-money-bill-wave" />}
        q={q} setQ={setQ} placeholder="ค้นหาหมวดหมู่ / ผู้รับเงิน / หมายเหตุ…"
        primary={<button className="btn-primary" onClick={openNew}><i className="fa-solid fa-plus mr-1.5" />เพิ่มรายจ่าย</button>}
        dateRange={
          <div className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 ring-1 ring-slate-200">
            <i className="fa-regular fa-calendar text-slate-400" />
            <input type="date" className="bg-transparent text-sm outline-none" value={from} max={to || today()} onChange={(e) => setFrom(e.target.value)} />
            <span className="text-slate-300">—</span>
            <input type="date" className="bg-transparent text-sm outline-none" value={to} min={from} max={today()} onChange={(e) => setTo(e.target.value)} />
          </div>
        }
        exports={exporters}
        filterCount={filterCount}
        onResetFilter={() => { setBranch(''); setCategory(''); setFrom(''); setTo(''); }}
        filter={
          <>
            {branches.length > 1 && (
              <div>
                <label className="label">สาขา</label>
                <select className="input" value={branch} onChange={(e) => setBranch(e.target.value)}>
                  <option value="">ทุกสาขา</option>
                  {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
            )}
            <div>
              <label className="label">หมวดหมู่</label>
              <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="">ทั้งหมด</option>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </>
        }
      />

      {/* summary: total + top categories for the current filter */}
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="card flex flex-col justify-center p-4">
          <div className="text-xs font-semibold text-slate-400">รวมค่าใช้จ่าย (ตามตัวกรอง)</div>
          <div className="mt-1 text-2xl font-extrabold text-rose-600">{money(total)}</div>
          <div className="text-[11px] text-slate-400">{filtered.length} รายการ</div>
        </div>
        <div className="card p-4 sm:col-span-3">
          <div className="mb-2 text-xs font-semibold text-slate-400">แยกตามหมวดหมู่</div>
          {byCategory.length === 0 ? (
            <p className="text-sm text-slate-400">ไม่มีข้อมูล</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {byCategory.map(([c, v]) => (
                <span key={c} className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                  {c} <span className="text-rose-600">{money(v)}</span>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <DataTable
        rows={filtered}
        colCount={7}
        empty="ยังไม่มีรายการค่าใช้จ่าย"
        head={<tr><th className="px-4 py-3">วันที่</th><th className="px-4 py-3">หมวดหมู่</th><th className="px-4 py-3">ผู้รับเงิน</th><th className="px-4 py-3">หมายเหตุ</th><th className="px-4 py-3">การชำระ</th><th className="px-4 py-3 text-right">จำนวนเงิน</th><th /></tr>}
        renderRow={(e) => (
          <tr key={e.id} className="hover:bg-slate-50">
            <td className="px-4 py-3 text-slate-500">{dateTime(e.date)}</td>
            <td className="px-4 py-3"><span className="chip bg-amber-50 text-amber-700">{e.category}</span></td>
            <td className="px-4 py-3">{e.vendor || '—'}</td>
            <td className="px-4 py-3 text-slate-500">{e.note || '—'}</td>
            <td className="px-4 py-3"><span className="chip bg-slate-100 text-slate-500">{e.paymentMethod === 'CASH' ? 'เงินสด' : 'โอน'}</span></td>
            <td className="px-4 py-3 text-right font-bold text-rose-600">{money(e.amount)}</td>
            <td className="px-4 py-3 text-right whitespace-nowrap">
              <button className="text-sm font-semibold text-brand-600" onClick={() => openEdit(e)}>แก้ไข</button>
              <button className="ml-3 text-sm font-semibold text-rose-600" onClick={() => remove(e)}>ลบ</button>
            </td>
          </tr>
        )}
      />

      {form && (
        <Modal title={editing ? 'แก้ไขรายจ่าย' : 'เพิ่มรายจ่าย'} onClose={() => setForm(null)}>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">วันที่</label><input type="date" className="input" value={form.date} max={today()} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
            <div><label className="label">จำนวนเงิน (฿)</label><input type="number" className="input" value={form.amount || ''} onChange={(e) => setForm({ ...form, amount: Math.max(0, Number(e.target.value)) })} /></div>
            <div>
              <label className="label">หมวดหมู่</label>
              <select className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="label">การชำระ</label>
              <select className="input" value={form.paymentMethod} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value as 'CASH' | 'TRANSFER' })}>
                <option value="CASH">เงินสด</option>
                <option value="TRANSFER">โอน</option>
              </select>
            </div>
            {branches.length > 1 && (
              <div className="col-span-2">
                <label className="label">สาขา</label>
                <select className="input" value={form.branchId ?? ''} onChange={(e) => setForm({ ...form, branchId: e.target.value ? Number(e.target.value) : null })}>
                  {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
            )}
            <div className="col-span-2"><label className="label">ผู้รับเงิน / ร้านค้า</label><input className="input" value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} placeholder="ไม่บังคับ" /></div>
            <div className="col-span-2"><label className="label">หมายเหตุ</label><input className="input" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="ไม่บังคับ" /></div>
          </div>
          <div className="mt-5 flex gap-2"><button className="btn-ghost flex-1" onClick={() => setForm(null)}>ยกเลิก</button><button className="btn-primary flex-1" disabled={!form.amount} onClick={save}>บันทึก</button></div>
        </Modal>
      )}
    </div>
  );
}
