import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { PageHeader } from '../../components/ui';
import { dateTime, money, num } from '../../lib/format';
import type { Shift } from '../../types';

export default function Shifts() {
  const [shifts, setShifts] = useState<Shift[]>([]);

  useEffect(() => {
    api<Shift[]>('/shifts').then(setShifts).catch(() => {});
  }, []);

  return (
    <div className="space-y-4">
      <PageHeader title="การเงิน / กะการขาย" subtitle="รอบลิ้นชักเงินสดและการกระทบยอดเมื่อปิดกะ" icon="🕒" />

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-4 py-3">#</th>
              <th className="px-4 py-3">แคชเชียร์</th>
              <th className="px-4 py-3">เปิดกะ</th>
              <th className="px-4 py-3">ปิดกะ</th>
              <th className="px-4 py-3 text-right">เงินตั้งต้น</th>
              <th className="px-4 py-3 text-right">ที่ควรมี</th>
              <th className="px-4 py-3 text-right">นับจริง</th>
              <th className="px-4 py-3 text-right">ส่วนต่าง</th>
              <th className="px-4 py-3">สถานะ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {shifts.map((s) => {
              const diff = s.cashDiff != null ? num(s.cashDiff) : null;
              return (
                <tr key={s.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-semibold">{s.id}</td>
                  <td className="px-4 py-3">{s.user?.name}</td>
                  <td className="px-4 py-3 text-slate-500">{dateTime(s.openedAt)}</td>
                  <td className="px-4 py-3 text-slate-500">{s.closedAt ? dateTime(s.closedAt) : '—'}</td>
                  <td className="px-4 py-3 text-right">{money(s.openingFloat)}</td>
                  <td className="px-4 py-3 text-right">{s.expectedCash != null ? money(s.expectedCash) : '—'}</td>
                  <td className="px-4 py-3 text-right">{s.countedCash != null ? money(s.countedCash) : '—'}</td>
                  <td className={`px-4 py-3 text-right font-semibold ${diff == null ? 'text-slate-400' : diff === 0 ? 'text-slate-600' : diff > 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                    {diff == null ? '—' : `${diff > 0 ? '+' : ''}${money(diff)}`}
                  </td>
                  <td className="px-4 py-3"><span className={`chip ${s.status === 'OPEN' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{s.status === 'OPEN' ? 'เปิดอยู่' : 'ปิดแล้ว'}</span></td>
                </tr>
              );
            })}
            {shifts.length === 0 && <tr><td colSpan={9} className="px-4 py-10 text-center text-slate-400">ยังไม่มีกะการขาย</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
