import { useEffect } from 'react';
import { money, num, dateTime } from '../lib/format';
import type { Setting, Shift } from '../types';

/**
 * Off-screen 80mm X/Z report. Mirrors ReceiptPrint: only `.receipt-print` is
 * visible during printing, triggers window.print() on mount and calls onDone
 * after. mode 'X' = mid-shift snapshot (open), 'Z' = end-of-day close report.
 */
export function ShiftReport({ shift, setting, mode, onDone }: { shift: Shift; setting: Setting | null; mode: 'X' | 'Z'; onDone: () => void }) {
  useEffect(() => {
    const done = () => { window.removeEventListener('afterprint', done); onDone(); };
    window.addEventListener('afterprint', done);
    const t = setTimeout(() => window.print(), 120);
    return () => { clearTimeout(t); window.removeEventListener('afterprint', done); };
  }, []);

  const currency = setting?.currency || 'THB';
  const t = shift.totals;
  const bm = t?.byMethod;
  const expected = num(shift.expectedCash ?? 0);
  const counted = shift.countedCash != null ? num(shift.countedCash) : null;
  const diff = shift.cashDiff != null ? num(shift.cashDiff) : counted != null ? counted - expected : null;
  const payIn = num(t?.payIn ?? 0);
  const payOut = num(t?.payOut ?? 0);

  return (
    <div className="receipt-print">
      <div className="receipt-paper">
        <div className="r-center">
          <div style={{ fontSize: 15, fontWeight: 800 }}>{setting?.storeName || 'POS Store'}</div>
          {shift.branch?.name && <div>{shift.branch.name}</div>}
          <div style={{ fontSize: 14, fontWeight: 800, marginTop: 4 }}>
            {mode === 'Z' ? 'รายงานปิดกะ (Z-Report)' : 'รายงานยอดขายระหว่างกะ (X-Report)'}
          </div>
        </div>

        <div className="r-hr" />
        <div className="r-row"><span>กะที่</span><span>#{shift.id}</span></div>
        {shift.user?.name && <div className="r-row"><span>แคชเชียร์</span><span>{shift.user.name}</span></div>}
        <div className="r-row"><span>เปิดกะ</span><span>{dateTime(shift.openedAt)}</span></div>
        <div className="r-row"><span>{mode === 'Z' ? 'ปิดกะ' : 'พิมพ์เมื่อ'}</span><span>{dateTime(shift.closedAt ?? new Date().toISOString())}</span></div>

        <div className="r-hr" />
        <div className="r-row" style={{ fontWeight: 700 }}><span>ยอดขาย</span><span /></div>
        <div className="r-row"><span>จำนวนบิล</span><span>{t?.orders ?? 0}</span></div>
        <div className="r-row"><span>ยกเลิกบิล</span><span>{t?.voids ?? 0}</span></div>
        <div className="r-row" style={{ fontWeight: 700 }}><span>ยอดขายรวม</span><span>{money(t?.totalSales ?? 0, currency)}</span></div>

        <div className="r-hr" />
        <div className="r-row" style={{ fontWeight: 700 }}><span>แยกตามการชำระ</span><span /></div>
        <div className="r-row"><span>เงินสด</span><span>{money(bm?.CASH ?? t?.cashSales ?? 0, currency)}</span></div>
        <div className="r-row"><span>โอน/พร้อมเพย์</span><span>{money(bm?.TRANSFER ?? t?.transferSales ?? 0, currency)}</span></div>
        {(bm?.CARD ?? 0) > 0 && <div className="r-row"><span>บัตรเครดิต</span><span>{money(bm?.CARD ?? 0, currency)}</span></div>}
        {(bm?.CREDIT ?? 0) > 0 && <div className="r-row"><span>เงินเชื่อ</span><span>{money(bm?.CREDIT ?? 0, currency)}</span></div>}
        {(bm?.GIFT ?? 0) > 0 && <div className="r-row"><span>บัตรของขวัญ</span><span>{money(bm?.GIFT ?? 0, currency)}</span></div>}

        <div className="r-hr" />
        <div className="r-row" style={{ fontWeight: 700 }}><span>ลิ้นชักเงินสด</span><span /></div>
        <div className="r-row"><span>เงินทอนตั้งต้น</span><span>{money(shift.openingFloat, currency)}</span></div>
        <div className="r-row"><span>ขายเงินสด</span><span>{money(bm?.CASH ?? t?.cashSales ?? 0, currency)}</span></div>
        {payIn > 0 && <div className="r-row"><span>เงินเข้า (+)</span><span>{money(payIn, currency)}</span></div>}
        {payOut > 0 && <div className="r-row"><span>เงินออก (−)</span><span>{money(payOut, currency)}</span></div>}
        <div className="r-row" style={{ fontWeight: 700 }}><span>เงินสดที่ควรมี</span><span>{money(expected, currency)}</span></div>
        {mode === 'Z' && counted != null && (
          <>
            <div className="r-row"><span>นับเงินสดจริง</span><span>{money(counted, currency)}</span></div>
            <div className="r-row" style={{ fontWeight: 800 }}><span>ส่วนต่าง</span><span>{diff != null ? `${diff > 0 ? '+' : ''}${money(diff, currency)}` : '—'}</span></div>
          </>
        )}

        {mode === 'Z' && shift.note && (
          <>
            <div className="r-hr" />
            <div style={{ fontSize: 11 }}>หมายเหตุ: {shift.note}</div>
          </>
        )}

        <div className="r-hr" />
        <div className="r-center" style={{ fontSize: 11, marginTop: 6 }}>
          *** {mode === 'Z' ? 'ปิดกะ' : 'X-Report'} #{shift.id} ***
        </div>
      </div>
    </div>
  );
}
