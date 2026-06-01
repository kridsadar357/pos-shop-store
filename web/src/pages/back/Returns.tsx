import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../api/client';
import { Modal } from '../../components/Modal';
import { DataTable } from '../../components/DataTable';
import { ListToolbar } from '../../components/ListToolbar';
import { toast } from '../../components/Toast';
import { makeExporters, type Column } from '../../lib/export';
import { dateTime, money, num } from '../../lib/format';
import type { ReturnListItem, Returnable, Sale } from '../../types';

const PAY_TH: Record<string, string> = { CASH: 'เงินสด', TRANSFER: 'โอนเงิน', CARD: 'บัตร', CREDIT: 'เงินเชื่อ' };
function today() { return new Date().toISOString().slice(0, 10); }
function daysAgo(n: number) { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); }

export default function Returns() {
  const [params, setParams] = useSearchParams();
  const [rows, setRows] = useState<ReturnListItem[]>([]);
  const [q, setQ] = useState('');
  const [from, setFrom] = useState(daysAgo(30));
  const [to, setTo] = useState(today());
  const [creating, setCreating] = useState(false);
  const [preSaleId, setPreSaleId] = useState<number | null>(null);

  async function load() {
    setRows(await api<ReturnListItem[]>('/returns', { query: { from: `${from}T00:00:00`, to: `${to}T23:59:59` } }));
  }
  useEffect(() => { load(); }, [from, to]);

  // Deep-link from a sale's bill-detail: /back/returns?sale=<id>
  useEffect(() => {
    const s = params.get('sale');
    if (s) { setPreSaleId(Number(s)); setCreating(true); params.delete('sale'); setParams(params, { replace: true }); }
  }, []);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return rows.filter((r) => !t || r.refNo.toLowerCase().includes(t) || r.orderNo.toLowerCase().includes(t));
  }, [rows, q]);

  const columns: Column<ReturnListItem>[] = [
    { label: 'เลขที่คืน', value: (r) => r.refNo },
    { label: 'บิลอ้างอิง', value: (r) => r.orderNo },
    { label: 'วันที่', value: (r) => dateTime(r.createdAt) },
    { label: 'จำนวนคืน', value: (r) => r.qty, right: true },
    { label: 'วิธีคืนเงิน', value: (r) => PAY_TH[r.refundMethod] ?? r.refundMethod },
    { label: 'ยอดคืน', value: (r) => num(r.total), right: true },
    { label: 'เหตุผล', value: (r) => r.reason },
  ];
  const exporters = makeExporters({ filename: `returns_${from}_${to}`, title: 'การคืนสินค้า', subtitle: `${from} ถึง ${to}`, columns, rows: () => filtered });

  const refundTotal = filtered.reduce((a, r) => a + num(r.total), 0);

  return (
    <div className="flex h-full flex-col gap-4">
      <ListToolbar
        title="การคืนสินค้า"
        subtitle={`${filtered.length} รายการ · คืนเงินรวม ${money(refundTotal)}`}
        icon={<i className="fa-solid fa-rotate-left" />}
        q={q} setQ={setQ} placeholder="ค้นหาเลขที่คืน / เลขบิล…"
        dateRange={
          <div className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 ring-1 ring-slate-200">
            <i className="fa-regular fa-calendar text-slate-400" />
            <input type="date" className="bg-transparent text-sm outline-none" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
            <span className="text-slate-300">—</span>
            <input type="date" className="bg-transparent text-sm outline-none" value={to} min={from} max={today()} onChange={(e) => setTo(e.target.value)} />
          </div>
        }
        primary={<button className="btn-primary" onClick={() => { setPreSaleId(null); setCreating(true); }}><i className="fa-solid fa-plus mr-1.5" />สร้างการคืนสินค้า</button>}
        exports={exporters}
      />

      <DataTable
        rows={filtered}
        colCount={7}
        empty="ยังไม่มีการคืนสินค้า"
        head={<tr><th className="px-4 py-3">เลขที่คืน</th><th className="px-4 py-3">บิลอ้างอิง</th><th className="px-4 py-3">วันที่</th><th className="px-4 py-3 text-right">จำนวน</th><th className="px-4 py-3">วิธีคืนเงิน</th><th className="px-4 py-3 text-right">ยอดคืน</th><th className="px-4 py-3">เหตุผล</th></tr>}
        renderRow={(r) => (
          <tr key={r.id} className="hover:bg-slate-50">
            <td className="px-4 py-3 font-semibold">{r.refNo}</td>
            <td className="px-4 py-3 text-brand-600">{r.orderNo}</td>
            <td className="px-4 py-3 text-slate-500">{dateTime(r.createdAt)}</td>
            <td className="px-4 py-3 text-right">{r.qty}</td>
            <td className="px-4 py-3">{PAY_TH[r.refundMethod] ?? r.refundMethod}</td>
            <td className="px-4 py-3 text-right font-semibold text-rose-600">-{money(r.total)}</td>
            <td className="px-4 py-3 text-slate-500">{r.reason || '—'}</td>
          </tr>
        )}
      />

      {creating && <ReturnModal preSaleId={preSaleId} onClose={() => setCreating(false)} onDone={() => { setCreating(false); load(); }} />}
    </div>
  );
}

/* ── Create-return modal: pick a bill → choose quantities → refund ── */
function ReturnModal({ preSaleId, onClose, onDone }: { preSaleId: number | null; onClose: () => void; onDone: () => void }) {
  const [sale, setSale] = useState<Returnable | null>(null);
  const [recentSales, setRecentSales] = useState<Sale[]>([]);
  const [search, setSearch] = useState('');
  const [qtys, setQtys] = useState<Record<number, number>>({});
  const [reason, setReason] = useState('');
  const [refundMethod, setRefundMethod] = useState('CASH');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (preSaleId) { loadSale(preSaleId); return; }
    api<Sale[]>('/sales', { query: { from: `${daysAgo(60)}T00:00:00`, to: `${today()}T23:59:59` } }).then((s) => setRecentSales(s.filter((x) => x.status === 'PAID'))).catch(() => {});
  }, []);

  async function loadSale(id: number) {
    try {
      const r = await api<Returnable>(`/returns/returnable/${id}`);
      setSale(r);
      setQtys(Object.fromEntries(r.items.map((i) => [i.saleItemId, 0])));
    } catch (e) { toast.error((e as Error).message); }
  }

  const ratio = sale && num(sale.sale.subtotal) > 0 ? num(sale.sale.total) / num(sale.sale.subtotal) : 1;
  const gross = sale ? sale.items.reduce((s, it) => s + (qtys[it.saleItemId] || 0) * num(it.unitPrice), 0) : 0;
  const refund = Math.round(gross * ratio * 100) / 100;
  const anyQty = Object.values(qtys).some((q) => q > 0);

  async function submit() {
    if (!sale || !anyQty) return;
    setBusy(true);
    try {
      const items = sale.items.map((i) => ({ saleItemId: i.saleItemId, qty: qtys[i.saleItemId] || 0 })).filter((x) => x.qty > 0);
      const r = await api<{ refNo: string }>('/returns', { method: 'POST', body: { saleId: sale.sale.id, refundMethod, reason, items } });
      toast.success(`บันทึกการคืนแล้ว · ${r.refNo}`);
      onDone();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }

  const filteredSales = recentSales.filter((s) => !search || s.orderNo.toLowerCase().includes(search.toLowerCase()));

  return (
    <Modal title="สร้างการคืนสินค้า" wide onClose={onClose}>
      {!sale ? (
        <div>
          <label className="label">เลือกบิลที่ต้องการคืน</label>
          <input className="input" placeholder="ค้นหาเลขที่บิล…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <div className="mt-2 max-h-80 overflow-auto rounded-xl ring-1 ring-slate-200">
            {filteredSales.length === 0 && <div className="px-4 py-10 text-center text-sm text-slate-400">ไม่พบบิลที่ชำระแล้ว</div>}
            {filteredSales.slice(0, 50).map((s) => (
              <button key={s.id} onClick={() => loadSale(s.id)} className="flex w-full items-center justify-between border-b border-slate-50 px-4 py-2.5 text-left text-sm hover:bg-slate-50">
                <span><span className="font-semibold">{s.orderNo}</span> <span className="text-slate-400">· {dateTime(s.createdAt)}</span></span>
                <span className="font-semibold">{money(s.total)}</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div>
          <div className="mb-3 flex items-center justify-between rounded-xl bg-slate-50 px-4 py-2.5 text-sm">
            <div><span className="font-bold">{sale.sale.orderNo}</span> <span className="text-slate-400">· {dateTime(sale.sale.createdAt)} · ยอดบิล {money(sale.sale.total)}</span></div>
            {!preSaleId && <button className="text-xs font-semibold text-brand-600" onClick={() => setSale(null)}>เปลี่ยนบิล</button>}
          </div>

          <div className="overflow-hidden rounded-xl ring-1 ring-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
                <tr><th className="px-3 py-2.5">สินค้า</th><th className="px-3 py-2.5 text-right">ราคา</th><th className="px-3 py-2.5 text-right">ซื้อ</th><th className="px-3 py-2.5 text-right">คืนแล้ว</th><th className="px-3 py-2.5 w-28 text-right">คืนครั้งนี้</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sale.items.map((it) => (
                  <tr key={it.saleItemId} className={it.returnable === 0 ? 'opacity-50' : ''}>
                    <td className="px-3 py-2">{it.name}</td>
                    <td className="px-3 py-2 text-right text-slate-500">{money(it.unitPrice)}</td>
                    <td className="px-3 py-2 text-right">{it.sold}</td>
                    <td className="px-3 py-2 text-right text-amber-600">{it.returned}</td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <input type="number" min={0} max={it.returnable} disabled={it.returnable === 0}
                          className="input w-16 py-1 text-right" value={qtys[it.saleItemId] ?? 0}
                          onChange={(e) => setQtys({ ...qtys, [it.saleItemId]: Math.max(0, Math.min(it.returnable, Number(e.target.value))) })} />
                        <span className="text-xs text-slate-400">/{it.returnable}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3">
            <div><label className="label">วิธีคืนเงิน</label>
              <select className="input" value={refundMethod} onChange={(e) => setRefundMethod(e.target.value)}>
                <option value="CASH">เงินสด</option><option value="TRANSFER">โอนเงิน</option><option value="CARD">บัตร</option><option value="CREDIT">เงินเชื่อ</option>
              </select>
            </div>
            <div><label className="label">เหตุผลการคืน</label><input className="input" placeholder="เช่น สินค้าชำรุด / ลูกค้าเปลี่ยนใจ" value={reason} onChange={(e) => setReason(e.target.value)} /></div>
          </div>

          <div className="mt-4 flex items-center justify-between">
            <div className="text-sm text-slate-500">ยอดคืนเงิน <span className="ml-2 text-2xl font-extrabold text-rose-600">{money(refund)}</span></div>
            <div className="flex gap-2">
              <button className="btn-ghost" onClick={onClose}>ยกเลิก</button>
              <button className="btn-primary" disabled={busy || !anyQty} onClick={submit}><i className="fa-solid fa-rotate-left mr-1.5" />ยืนยันการคืน</button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
