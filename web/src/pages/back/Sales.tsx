import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { toast } from '../../components/Toast';
import { DataTable } from '../../components/DataTable';
import { ListToolbar } from '../../components/ListToolbar';
import { Modal } from '../../components/Modal';
import { ReceiptPrint } from '../../components/ReceiptPrint';
import { printReceipt } from '../../lib/printing';
import { makeExporters, type Column } from '../../lib/export';
import { useBranch } from '../../store/branch';
import { dateTime, money, num } from '../../lib/format';
import type { Sale, Setting } from '../../types';

const TYPE_TH: Record<string, string> = { RETAIL: 'ปลีก', WHOLESALE: 'ส่ง' };
const PAY_TH: Record<string, string> = { CASH: 'เงินสด', TRANSFER: 'โอนเงิน', CARD: 'บัตร', CREDIT: 'เงินเชื่อ' };

function today() { return new Date().toISOString().slice(0, 10); }
function daysAgo(n: number) { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); }

export default function Sales() {
  const navigate = useNavigate();
  const [sales, setSales] = useState<Sale[]>([]);
  const [setting, setSetting] = useState<Setting | null>(null);
  const [printSale, setPrintSale] = useState<Sale | null>(null);
  const [detail, setDetail] = useState<Sale | null>(null);

  const [from, setFrom] = useState(daysAgo(30));
  const [to, setTo] = useState(today());
  const [q, setQ] = useState('');
  const [pay, setPay] = useState('');
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');
  const [branch, setBranch] = useState('');
  const branches = useBranch((s) => s.branches);

  async function load() {
    setSales(await api<Sale[]>('/sales', { query: { from: `${from}T00:00:00`, to: `${to}T23:59:59` } }));
  }
  useEffect(() => { load(); }, [from, to]);
  useEffect(() => { api<Setting>('/settings').then(setSetting).catch(() => {}); }, []);

  async function voidSale(id: number) {
    if (!confirm('ยกเลิกบิลนี้? สต็อกจะถูกคืนเข้าคลัง')) return;
    try {
      await api(`/sales/${id}/void`, { method: 'POST' });
      toast.success('ยกเลิกบิลแล้ว — คืนสต็อกเรียบร้อย');
      load();
    } catch (e) { toast.error((e as Error).message); }
  }

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return sales.filter((s) =>
      (!term || s.orderNo.toLowerCase().includes(term) || s.cashier?.name?.toLowerCase().includes(term) || s.member?.name?.toLowerCase().includes(term)) &&
      (!pay || s.paymentMethod === pay) &&
      (!type || s.type === type) &&
      (!status || s.status === status) &&
      (!branch || s.branchId === Number(branch))
    );
  }, [sales, q, pay, type, status, branch]);

  const filterCount = [pay, type, status, branch].filter(Boolean).length;
  const doPrint = (sale: Sale) => printReceipt(sale, setting, () => setPrintSale(sale));

  const columns: Column<Sale>[] = [
    { label: 'เลขที่บิล', value: (s) => s.orderNo },
    { label: 'วันที่', value: (s) => dateTime(s.createdAt) },
    { label: 'ประเภท', value: (s) => TYPE_TH[s.type] ?? s.type },
    { label: 'ชำระเงิน', value: (s) => PAY_TH[s.paymentMethod] ?? s.paymentMethod },
    { label: 'แคชเชียร์', value: (s) => s.cashier?.name ?? '' },
    { label: 'จำนวนรายการ', value: (s) => s.items?.length ?? 0, right: true },
    { label: 'ส่วนลด', value: (s) => num(s.discount), right: true },
    { label: 'ภาษี', value: (s) => num(s.taxAmount), right: true },
    { label: 'ยอดรวม', value: (s) => num(s.total), right: true },
    { label: 'สถานะ', value: (s) => (s.status === 'VOID' ? 'ยกเลิก' : 'ชำระแล้ว') },
  ];
  const exporters = makeExporters({
    filename: `sales_${from}_${to}`,
    title: 'รายงานการขาย',
    subtitle: `ช่วงวันที่ ${from} ถึง ${to}`,
    columns,
    rows: () => filtered,
    storeName: setting?.storeName,
  });

  const grandTotal = filtered.filter((s) => s.status === 'PAID').reduce((a, s) => a + num(s.total), 0);

  return (
    <div className="flex h-full flex-col gap-4">
      <ListToolbar
        title="รายการขาย"
        subtitle={`พบ ${filtered.length} บิล · ยอดขายรวม ${money(grandTotal)}`}
        icon={<i className="fa-solid fa-receipt" />}
        q={q} setQ={setQ} placeholder="ค้นหาเลขบิล / แคชเชียร์ / ลูกค้า…"
        dateRange={
          <div className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 ring-1 ring-slate-200">
            <i className="fa-regular fa-calendar text-slate-400" />
            <input type="date" className="bg-transparent text-sm outline-none" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
            <span className="text-slate-300">—</span>
            <input type="date" className="bg-transparent text-sm outline-none" value={to} min={from} max={today()} onChange={(e) => setTo(e.target.value)} />
          </div>
        }
        exports={exporters}
        filterCount={filterCount}
        onResetFilter={() => { setPay(''); setType(''); setStatus(''); setBranch(''); }}
        filter={
          <>
            {branches.length > 1 && <Sel label="สาขา" value={branch} onChange={setBranch} options={[['', 'ทุกสาขา'], ...branches.map((b) => [String(b.id), b.name] as [string, string])]} />}
            <Sel label="วิธีชำระเงิน" value={pay} onChange={setPay} options={[['', 'ทั้งหมด'], ['CASH', 'เงินสด'], ['TRANSFER', 'โอนเงิน'], ['CARD', 'บัตร'], ['CREDIT', 'เงินเชื่อ']]} />
            <Sel label="ประเภทการขาย" value={type} onChange={setType} options={[['', 'ทั้งหมด'], ['RETAIL', 'ปลีก'], ['WHOLESALE', 'ส่ง']]} />
            <Sel label="สถานะ" value={status} onChange={setStatus} options={[['', 'ทั้งหมด'], ['PAID', 'ชำระแล้ว'], ['VOID', 'ยกเลิก']]} />
          </>
        }
      />

      <DataTable
        rows={filtered}
        colCount={8}
        empty="ไม่พบรายการขายในช่วงที่เลือก"
        head={<tr><th className="px-4 py-3">เลขที่บิล</th><th className="px-4 py-3">วันที่</th><th className="px-4 py-3">ประเภท</th><th className="px-4 py-3">ชำระเงิน</th><th className="px-4 py-3">แคชเชียร์</th><th className="px-4 py-3 text-right">ยอดรวม</th><th className="px-4 py-3">สถานะ</th><th /></tr>}
        renderRow={(s) => (
          <tr key={s.id} className="hover:bg-slate-50">
            <td className="px-4 py-3 font-semibold">{s.orderNo}</td>
            <td className="px-4 py-3 text-slate-500">{dateTime(s.createdAt)}</td>
            <td className="px-4 py-3"><span className="chip bg-slate-100 text-slate-600">{TYPE_TH[s.type] ?? s.type}</span></td>
            <td className="px-4 py-3">{PAY_TH[s.paymentMethod] ?? s.paymentMethod}</td>
            <td className="px-4 py-3 text-slate-500">{s.cashier?.name}</td>
            <td className="px-4 py-3 text-right font-semibold">{money(s.total)}</td>
            <td className="px-4 py-3"><span className={`chip ${s.status === 'VOID' ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-700'}`}>{s.status === 'VOID' ? 'ยกเลิก' : 'ชำระแล้ว'}</span></td>
            <td className="px-4 py-3 text-right whitespace-nowrap">
              <button className="text-sm font-semibold text-brand-600" onClick={() => setDetail(s)}><i className="fa-solid fa-eye mr-1" />ดูบิล</button>
              <button className="ml-3 text-sm font-semibold text-slate-500 hover:text-slate-700" onClick={() => doPrint(s)}><i className="fa-solid fa-print" /></button>
              {s.status === 'PAID' && <button className="ml-3 text-sm font-semibold text-rose-600" onClick={() => voidSale(s.id)}>ยกเลิก</button>}
            </td>
          </tr>
        )}
      />

      {detail && (
        <Modal title={`บิล ${detail.orderNo}`} wide onClose={() => setDetail(null)}>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-4">
            <Info label="วันที่" value={dateTime(detail.createdAt)} />
            <Info label="ประเภท" value={TYPE_TH[detail.type] ?? detail.type} />
            <Info label="ชำระเงิน" value={PAY_TH[detail.paymentMethod] ?? detail.paymentMethod} />
            <Info label="แคชเชียร์" value={detail.cashier?.name ?? '—'} />
            {detail.member && <Info label="ลูกค้า" value={`${detail.member.name} (${detail.member.phone})`} />}
            <Info label="สถานะ" value={detail.status === 'VOID' ? 'ยกเลิก' : 'ชำระแล้ว'} />
          </div>

          <div className="mt-4 overflow-hidden rounded-xl ring-1 ring-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
                <tr><th className="px-3 py-2.5">สินค้า</th><th className="px-3 py-2.5 text-right">ราคา</th><th className="px-3 py-2.5 text-right">จำนวน</th><th className="px-3 py-2.5 text-right">รวม</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {detail.items.map((it) => (
                  <tr key={it.id}>
                    <td className="px-3 py-2">{it.nameSnapshot}</td>
                    <td className="px-3 py-2 text-right text-slate-500">{money(it.unitPrice)}</td>
                    <td className="px-3 py-2 text-right">{it.qty}</td>
                    <td className="px-3 py-2 text-right font-medium">{money(it.lineTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 ml-auto w-full max-w-xs space-y-1.5 text-sm">
            <Row label="ยอดรวมย่อย" value={money(detail.subtotal)} />
            {num(detail.discount) > 0 && <Row label="ส่วนลด" value={`-${money(detail.discount)}`} />}
            <Row label="ภาษี" value={money(detail.taxAmount)} />
            <div className="flex items-center justify-between border-t border-slate-200 pt-1.5 text-base font-extrabold">
              <span>ยอดสุทธิ</span><span>{money(detail.total)}</span>
            </div>
            {detail.paymentMethod === 'CASH' && (
              <>
                <Row label="รับเงิน" value={money(detail.cashReceived)} />
                <Row label="เงินทอน" value={money(detail.changeDue)} />
              </>
            )}
          </div>

          <div className="mt-5 flex gap-2">
            <button className="btn-ghost flex-1" onClick={() => setDetail(null)}>ปิด</button>
            {detail.status === 'PAID' && (
              <button className="btn-ghost flex-1 text-amber-600" onClick={() => navigate(`/back/returns?sale=${detail.id}`)}><i className="fa-solid fa-rotate-left mr-1.5" />คืนสินค้า</button>
            )}
            <button className="btn-primary flex-1" onClick={() => { doPrint(detail); setDetail(null); }}><i className="fa-solid fa-print mr-1.5" />พิมพ์ใบเสร็จ</button>
          </div>
        </Modal>
      )}

      {printSale && <ReceiptPrint sale={printSale} setting={setting} onDone={() => setPrintSale(null)} />}
    </div>
  );
}

function Sel({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <div>
      <label className="label">{label}</label>
      <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </div>
  );
}
function Info({ label, value }: { label: string; value: string }) {
  return <div><div className="text-[11px] uppercase tracking-wide text-slate-400">{label}</div><div className="font-medium text-ink-900">{value}</div></div>;
}
function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between text-slate-600"><span>{label}</span><span>{value}</span></div>;
}
