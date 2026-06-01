import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { Modal } from '../../components/Modal';
import { DataTable } from '../../components/DataTable';
import { ListToolbar } from '../../components/ListToolbar';
import { makeExporters, type Column } from '../../lib/export';
import { dateTime, money, num } from '../../lib/format';
import { toast } from '../../components/Toast';
import type { Payable, Supplier, SupplierPayment } from '../../types';

const PS_LABEL: Record<Payable['paymentStatus'], string> = { PAID: 'ชำระครบ', PARTIAL: 'ชำระบางส่วน', UNPAID: 'ยังไม่ชำระ' };
const PS_CHIP: Record<Payable['paymentStatus'], string> = {
  PAID: 'bg-emerald-50 text-emerald-700',
  PARTIAL: 'bg-amber-50 text-amber-700',
  UNPAID: 'bg-rose-50 text-rose-700',
};

export default function Payables() {
  const [rows, setRows] = useState<Payable[]>([]);
  const [totals, setTotals] = useState({ total: 0, paid: 0, outstanding: 0 });
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [q, setQ] = useState('');
  const [supplier, setSupplier] = useState('');
  const [view, setView] = useState('outstanding');
  const [pay, setPay] = useState<Payable | null>(null);

  async function load() {
    const query: Record<string, string> = {};
    if (supplier) query.supplierId = supplier;
    if (view) query.view = view;
    const r = await api<{ rows: Payable[]; totals: typeof totals }>('/payables', { query });
    setRows(r.rows);
    setTotals(r.totals);
  }
  useEffect(() => { load(); }, [supplier, view]);
  useEffect(() => { api<Supplier[]>('/suppliers').then(setSuppliers).catch(() => {}); }, []);

  const filtered = rows.filter((r) => {
    const term = q.trim().toLowerCase();
    if (!term) return true;
    return r.refNo.toLowerCase().includes(term) || (r.supplier?.name ?? '').toLowerCase().includes(term);
  });

  const columns: Column<Payable>[] = [
    { label: 'เลขที่ PO', value: (r) => r.refNo },
    { label: 'ผู้จำหน่าย', value: (r) => r.supplier?.name ?? '' },
    { label: 'วันที่', value: (r) => dateTime(r.createdAt) },
    { label: 'ยอดรวม', value: (r) => r.total, right: true },
    { label: 'ชำระแล้ว', value: (r) => r.paid, right: true },
    { label: 'คงค้าง', value: (r) => r.outstanding, right: true },
    { label: 'สถานะชำระ', value: (r) => PS_LABEL[r.paymentStatus] },
  ];
  const exporters = makeExporters({ filename: 'payables', title: 'เจ้าหนี้การค้า (Accounts Payable)', columns, rows: () => filtered });

  return (
    <div className="flex h-full flex-col gap-4">
      <ListToolbar
        title="เจ้าหนี้การค้า"
        subtitle="ยอดค้างชำระต่อผู้จำหน่ายจากใบสั่งซื้อ และการบันทึกการจ่ายเงิน"
        icon={<i className="fa-solid fa-file-invoice-dollar" />}
        q={q} setQ={setQ} placeholder="ค้นหาเลขที่ PO / ผู้จำหน่าย…"
        exports={exporters}
        filterCount={[supplier, view].filter(Boolean).length}
        onResetFilter={() => { setSupplier(''); setView(''); }}
        filter={
          <>
            <div>
              <label className="label">ผู้จำหน่าย</label>
              <select className="input" value={supplier} onChange={(e) => setSupplier(e.target.value)}>
                <option value="">ทั้งหมด</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">สถานะ</label>
              <select className="input" value={view} onChange={(e) => setView(e.target.value)}>
                <option value="">ทั้งหมด</option>
                <option value="outstanding">ค้างชำระ</option>
                <option value="paid">ชำระครบ</option>
              </select>
            </div>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi label="ยอดรวมทั้งหมด" value={money(totals.total)} tone="text-slate-700" />
        <Kpi label="ชำระแล้ว" value={money(totals.paid)} tone="text-emerald-600" />
        <Kpi label="คงค้างชำระ" value={money(totals.outstanding)} tone="text-rose-600" />
      </div>

      <DataTable
        rows={filtered}
        colCount={8}
        empty="ไม่มีใบสั่งซื้อที่ต้องชำระ"
        head={<tr><th className="px-4 py-3">เลขที่ PO</th><th className="px-4 py-3">ผู้จำหน่าย</th><th className="px-4 py-3">วันที่</th><th className="px-4 py-3 text-right">ยอดรวม</th><th className="px-4 py-3 text-right">ชำระแล้ว</th><th className="px-4 py-3 text-right">คงค้าง</th><th className="px-4 py-3">สถานะ</th><th /></tr>}
        renderRow={(r) => (
          <tr key={r.id} className="hover:bg-slate-50">
            <td className="px-4 py-3 font-mono text-xs font-semibold">{r.refNo}</td>
            <td className="px-4 py-3">{r.supplier?.name ?? '—'}</td>
            <td className="px-4 py-3 text-slate-500">{dateTime(r.createdAt)}</td>
            <td className="px-4 py-3 text-right">{money(r.total)}</td>
            <td className="px-4 py-3 text-right text-emerald-600">{money(r.paid)}</td>
            <td className="px-4 py-3 text-right font-bold text-rose-600">{money(r.outstanding)}</td>
            <td className="px-4 py-3"><span className={`chip ${PS_CHIP[r.paymentStatus]}`}>{PS_LABEL[r.paymentStatus]}</span></td>
            <td className="px-4 py-3 text-right">
              {r.outstanding > 0 ? (
                <button className="text-sm font-semibold text-brand-600" onClick={() => setPay(r)}>ชำระเงิน</button>
              ) : (
                <button className="text-sm font-semibold text-slate-400" onClick={() => setPay(r)}>ดูประวัติ</button>
              )}
            </td>
          </tr>
        )}
      />

      {pay && <PaymentModal po={pay} onClose={() => setPay(null)} onPaid={load} />}
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="card flex flex-col justify-center p-4">
      <div className="text-xs font-semibold text-slate-400">{label}</div>
      <div className={`mt-1 text-2xl font-extrabold ${tone}`}>{value}</div>
    </div>
  );
}

function PaymentModal({ po, onClose, onPaid }: { po: Payable; onClose: () => void; onPaid: () => void }) {
  const [amount, setAmount] = useState(po.outstanding);
  const [method, setMethod] = useState<'CASH' | 'TRANSFER'>('TRANSFER');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<SupplierPayment[]>([]);

  async function loadHistory() {
    setHistory(await api<SupplierPayment[]>(`/payables/${po.id}/payments`).catch(() => []));
  }
  useEffect(() => { loadHistory(); }, [po.id]);

  async function submit() {
    if (amount <= 0) return toast.error('กรอกจำนวนเงิน');
    setBusy(true);
    try {
      await api(`/payables/${po.id}/payments`, { method: 'POST', body: { amount, method, reference: reference.trim(), note: note.trim() } });
      toast.success('บันทึกการชำระเงินแล้ว');
      onPaid();
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={`ชำระเงิน · ${po.refNo}`} onClose={onClose}>
      <div className="space-y-1.5 rounded-xl bg-slate-50 p-4 text-sm">
        <div className="flex justify-between"><span className="text-slate-500">ผู้จำหน่าย</span><span className="font-semibold">{po.supplier?.name ?? '—'}</span></div>
        <div className="flex justify-between"><span className="text-slate-500">ยอดรวม</span><span>{money(po.total)}</span></div>
        <div className="flex justify-between"><span className="text-slate-500">ชำระแล้ว</span><span className="text-emerald-600">{money(po.paid)}</span></div>
        <div className="flex justify-between border-t border-slate-200 pt-1.5 font-bold"><span>คงค้างชำระ</span><span className="text-rose-600">{money(po.outstanding)}</span></div>
      </div>

      {po.outstanding > 0 && (
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div>
            <label className="label">จำนวนเงิน (฿)</label>
            <input type="number" className="input" value={amount || ''} onChange={(e) => setAmount(Math.max(0, Number(e.target.value)))} />
            <button className="mt-1 text-xs font-semibold text-brand-600" onClick={() => setAmount(po.outstanding)}>ชำระเต็มจำนวน</button>
          </div>
          <div>
            <label className="label">วิธีชำระ</label>
            <select className="input" value={method} onChange={(e) => setMethod(e.target.value as 'CASH' | 'TRANSFER')}>
              <option value="TRANSFER">โอนเงิน</option>
              <option value="CASH">เงินสด</option>
            </select>
          </div>
          <div className="col-span-2"><label className="label">เลขอ้างอิง</label><input className="input" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="เลขที่ใบเสร็จ / อ้างอิงการโอน" /></div>
          <div className="col-span-2"><label className="label">หมายเหตุ</label><input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></div>
        </div>
      )}

      {history.length > 0 && (
        <div className="mt-4">
          <div className="mb-1 text-xs font-semibold text-slate-400">ประวัติการชำระ</div>
          <div className="max-h-40 overflow-auto rounded-xl ring-1 ring-slate-100">
            {history.map((h) => (
              <div key={h.id} className="flex items-center justify-between border-b border-slate-50 px-3 py-2 text-sm last:border-0">
                <span className="text-slate-500">{dateTime(h.createdAt)} · {h.method === 'CASH' ? 'เงินสด' : 'โอน'}{h.reference ? ` · ${h.reference}` : ''}</span>
                <span className="font-bold text-emerald-600">{money(num(h.amount))}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-5 flex gap-2">
        <button className="btn-ghost flex-1" onClick={onClose}>ปิด</button>
        {po.outstanding > 0 && <button className="btn-primary flex-1" disabled={busy || amount <= 0} onClick={submit}>บันทึกการชำระ</button>}
      </div>
    </Modal>
  );
}
