import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { toast } from '../../components/Toast';
import { PageHeader } from '../../components/ui';
import { ReceiptPrint } from '../../components/ReceiptPrint';
import { dateTime, money } from '../../lib/format';
import type { Sale, Setting } from '../../types';

export default function Sales() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [setting, setSetting] = useState<Setting | null>(null);
  const [printSale, setPrintSale] = useState<Sale | null>(null);

  async function load() {
    setSales(await api<Sale[]>('/sales'));
  }
  useEffect(() => {
    load();
    api<Setting>('/settings').then(setSetting).catch(() => {});
  }, []);

  async function voidSale(id: number) {
    if (!confirm('ยกเลิกบิลนี้? สต็อกจะถูกคืนเข้าคลัง')) return;
    try {
      await api(`/sales/${id}/void`, { method: 'POST' });
      toast.success('ยกเลิกบิลแล้ว — คืนสต็อกเรียบร้อย');
      load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const TYPE_TH: Record<string, string> = { RETAIL: 'ปลีก', WHOLESALE: 'ส่ง' };

  return (
    <div className="space-y-4">
      <PageHeader title="การขาย" subtitle="รายการขายล่าสุด · การยกเลิกจะคืนสต็อกผ่านบัญชีเดินสินค้า" icon="🧾" />

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
            <tr><th className="px-4 py-3">เลขที่บิล</th><th className="px-4 py-3">วันที่</th><th className="px-4 py-3">ประเภท</th><th className="px-4 py-3">ชำระเงิน</th><th className="px-4 py-3">แคชเชียร์</th><th className="px-4 py-3 text-right">ยอดรวม</th><th className="px-4 py-3">สถานะ</th><th /></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sales.map((s) => (
              <tr key={s.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-semibold">{s.orderNo}</td>
                <td className="px-4 py-3 text-slate-500">{dateTime(s.createdAt)}</td>
                <td className="px-4 py-3"><span className="chip bg-slate-100 text-slate-600">{TYPE_TH[s.type] ?? s.type}</span></td>
                <td className="px-4 py-3">{({ CASH: '💵 เงินสด', TRANSFER: '📱 โอนเงิน', CARD: '💳 บัตร', CREDIT: '🪙 เงินเชื่อ' } as Record<string, string>)[s.paymentMethod] ?? s.paymentMethod}</td>
                <td className="px-4 py-3 text-slate-500">{s.cashier?.name}</td>
                <td className="px-4 py-3 text-right font-semibold">{money(s.total)}</td>
                <td className="px-4 py-3"><span className={`chip ${s.status === 'VOID' ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-700'}`}>{s.status === 'VOID' ? 'ยกเลิก' : 'ชำระแล้ว'}</span></td>
                <td className="px-4 py-3 text-right">
                  <button className="text-sm font-semibold text-brand-600" onClick={() => setPrintSale(s)}>ใบเสร็จ</button>
                  {s.status === 'PAID' && <button className="ml-3 text-sm font-semibold text-rose-600" onClick={() => voidSale(s.id)}>ยกเลิก</button>}
                </td>
              </tr>
            ))}
            {sales.length === 0 && <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-400">ยังไม่มีรายการขาย</td></tr>}
          </tbody>
        </table>
      </div>
      {printSale && <ReceiptPrint sale={printSale} setting={setting} onDone={() => setPrintSale(null)} />}
    </div>
  );
}
