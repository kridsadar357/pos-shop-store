import { useEffect, useMemo, useState } from 'react';
import { api } from '../../api/client';
import { Modal } from '../../components/Modal';
import { DataTable } from '../../components/DataTable';
import { ListToolbar } from '../../components/ListToolbar';
import { toast } from '../../components/Toast';
import { makeExporters, type Column } from '../../lib/export';
import { useBranch } from '../../store/branch';
import { dateTime } from '../../lib/format';
import type { BranchStockItem, TransferListItem } from '../../types';

function today() { return new Date().toISOString().slice(0, 10); }
function daysAgo(n: number) { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); }

export default function Transfers() {
  const branches = useBranch((s) => s.branches);
  const [rows, setRows] = useState<TransferListItem[]>([]);
  const [q, setQ] = useState('');
  const [from, setFrom] = useState(daysAgo(30));
  const [to, setTo] = useState(today());
  const [creating, setCreating] = useState(false);

  async function load() {
    setRows(await api<TransferListItem[]>('/transfers', { query: { from: `${from}T00:00:00`, to: `${to}T23:59:59` } }));
  }
  useEffect(() => { load(); }, [from, to]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return rows.filter((r) => !t || r.refNo.toLowerCase().includes(t) || r.fromBranch.includes(t) || r.toBranch.includes(t));
  }, [rows, q]);

  const columns: Column<TransferListItem>[] = [
    { label: 'เลขที่', value: (r) => r.refNo },
    { label: 'วันที่', value: (r) => dateTime(r.createdAt) },
    { label: 'จาก', value: (r) => r.fromBranch },
    { label: 'ไป', value: (r) => r.toBranch },
    { label: 'รายการ', value: (r) => r.lineCount, right: true },
    { label: 'จำนวนรวม', value: (r) => r.qty, right: true },
  ];
  const exporters = makeExporters({ filename: `transfers_${from}_${to}`, title: 'การโอนสินค้าระหว่างสาขา', columns, rows: () => filtered });

  return (
    <div className="flex h-full flex-col gap-4">
      <ListToolbar
        title="โอนสินค้าระหว่างสาขา"
        subtitle={`${filtered.length} ใบโอน`}
        icon={<i className="fa-solid fa-right-left" />}
        q={q} setQ={setQ} placeholder="ค้นหาเลขที่ / สาขา…"
        dateRange={
          <div className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 ring-1 ring-slate-200">
            <i className="fa-regular fa-calendar text-slate-400" />
            <input type="date" className="bg-transparent text-sm outline-none" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
            <span className="text-slate-300">—</span>
            <input type="date" className="bg-transparent text-sm outline-none" value={to} min={from} max={today()} onChange={(e) => setTo(e.target.value)} />
          </div>
        }
        primary={branches.length > 1 ? <button className="btn-primary" onClick={() => setCreating(true)}><i className="fa-solid fa-plus mr-1.5" />สร้างใบโอน</button> : undefined}
        exports={exporters}
      />

      {branches.length < 2 && (
        <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-700 ring-1 ring-amber-100"><i className="fa-solid fa-circle-info mr-1.5" />ต้องมีอย่างน้อย 2 สาขาเพื่อโอนสินค้า — เพิ่มสาขาได้ที่เมนู “สาขา”</div>
      )}

      <DataTable
        rows={filtered}
        colCount={6}
        empty="ยังไม่มีการโอนสินค้า"
        head={<tr><th className="px-4 py-3">เลขที่</th><th className="px-4 py-3">วันที่</th><th className="px-4 py-3">จากสาขา</th><th className="px-4 py-3">ไปสาขา</th><th className="px-4 py-3 text-right">รายการ</th><th className="px-4 py-3 text-right">จำนวนรวม</th></tr>}
        renderRow={(r) => (
          <tr key={r.id} className="hover:bg-slate-50">
            <td className="px-4 py-3 font-semibold">{r.refNo}</td>
            <td className="px-4 py-3 text-slate-500">{dateTime(r.createdAt)}</td>
            <td className="px-4 py-3">{r.fromBranch}</td>
            <td className="px-4 py-3"><i className="fa-solid fa-arrow-right-long mr-2 text-slate-300" />{r.toBranch}</td>
            <td className="px-4 py-3 text-right">{r.lineCount}</td>
            <td className="px-4 py-3 text-right font-semibold">{r.qty}</td>
          </tr>
        )}
      />

      {creating && <TransferModal onClose={() => setCreating(false)} onDone={() => { setCreating(false); load(); }} />}
    </div>
  );
}

function TransferModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const branches = useBranch((s) => s.branches);
  const [fromId, setFromId] = useState<number | ''>('');
  const [toId, setToId] = useState<number | ''>('');
  const [stock, setStock] = useState<BranchStockItem[]>([]);
  const [search, setSearch] = useState('');
  const [lines, setLines] = useState<{ item: BranchStockItem; qty: number }[]>([]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!fromId) { setStock([]); return; }
    api<BranchStockItem[]>('/inventory/branch-stock', { query: { branchId: fromId } }).then((s) => setStock(s.filter((x) => x.qty > 0))).catch(() => {});
    setLines([]);
  }, [fromId]);

  const available = stock.filter((s) => !search || s.name.includes(search) || s.sku.toLowerCase().includes(search.toLowerCase()));
  const add = (it: BranchStockItem) => { if (!lines.some((l) => l.item.id === it.id)) setLines([...lines, { item: it, qty: 1 }]); setSearch(''); };
  const totalQty = lines.reduce((s, l) => s + l.qty, 0);

  async function submit() {
    if (!fromId || !toId || !lines.length) return;
    setBusy(true);
    try {
      await api('/transfers', { method: 'POST', body: { fromBranchId: fromId, toBranchId: toId, note, items: lines.map((l) => ({ productId: l.item.id, qty: l.qty })) } });
      toast.success('บันทึกการโอนแล้ว');
      onDone();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <Modal title="สร้างใบโอนสินค้า" wide onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="label">จากสาขา (ต้นทาง)</label>
          <select className="input" value={fromId} onChange={(e) => setFromId(e.target.value ? Number(e.target.value) : '')}>
            <option value="">— เลือก —</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
        <div><label className="label">ไปสาขา (ปลายทาง)</label>
          <select className="input" value={toId} onChange={(e) => setToId(e.target.value ? Number(e.target.value) : '')}>
            <option value="">— เลือก —</option>{branches.filter((b) => b.id !== fromId).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
      </div>

      {fromId && (
        <div className="relative mt-3">
          <label className="label">เพิ่มสินค้า (เฉพาะที่มีสต็อกในสาขาต้นทาง)</label>
          <input className="input" placeholder="ค้นหาสินค้า…" value={search} onChange={(e) => setSearch(e.target.value)} />
          {search && (
            <div className="absolute left-0 right-0 z-10 mt-1 max-h-56 overflow-auto rounded-xl bg-white shadow-card ring-1 ring-slate-200">
              {available.length === 0 && <div className="px-3 py-3 text-sm text-slate-400">ไม่พบสินค้าที่มีสต็อก</div>}
              {available.slice(0, 12).map((it) => (
                <button key={it.id} onClick={() => add(it)} className="flex w-full justify-between px-3 py-2 text-left text-sm hover:bg-slate-50">
                  <span>{it.name} <span className="text-xs text-slate-400">{it.sku}</span></span><span className="text-slate-400">มี {it.qty} {it.unit}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="mt-3 overflow-hidden rounded-xl ring-1 ring-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400"><tr><th className="px-3 py-2.5">สินค้า</th><th className="px-3 py-2.5 text-right">มีในต้นทาง</th><th className="px-3 py-2.5 w-28 text-right">โอน</th><th /></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {lines.length === 0 && <tr><td colSpan={4} className="px-3 py-8 text-center text-slate-400">{fromId ? 'ค้นหาด้านบนเพื่อเพิ่มสินค้า' : 'เลือกสาขาต้นทางก่อน'}</td></tr>}
            {lines.map((l) => (
              <tr key={l.item.id}>
                <td className="px-3 py-2"><div className="font-medium">{l.item.name}</div><div className="text-xs text-slate-400">{l.item.sku}</div></td>
                <td className="px-3 py-2 text-right text-slate-500">{l.item.qty}</td>
                <td className="px-3 py-2 text-right"><input type="number" min={1} max={l.item.qty} className="input w-20 py-1 text-right" value={l.qty} onChange={(e) => setLines(lines.map((x) => x.item.id === l.item.id ? { ...x, qty: Math.max(1, Math.min(l.item.qty, Number(e.target.value))) } : x))} /></td>
                <td className="px-3 py-2 text-right"><button className="text-slate-300 hover:text-rose-500" onClick={() => setLines(lines.filter((x) => x.item.id !== l.item.id))}>✕</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div><label className="label mt-3">หมายเหตุ</label><input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></div>

      <div className="mt-4 flex items-center justify-between">
        <div className="text-sm text-slate-500">รวมโอน <span className="ml-2 text-xl font-extrabold text-ink-900">{totalQty}</span> ชิ้น</div>
        <div className="flex gap-2">
          <button className="btn-ghost" onClick={onClose}>ยกเลิก</button>
          <button className="btn-primary" disabled={busy || !fromId || !toId || !lines.length} onClick={submit}><i className="fa-solid fa-right-left mr-1.5" />ยืนยันการโอน</button>
        </div>
      </div>
    </Modal>
  );
}
