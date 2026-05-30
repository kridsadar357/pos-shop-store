import { useEffect } from 'react';
import { money, num, dateTime } from '../lib/format';
import type { Sale, Setting } from '../types';

const PM: Record<string, string> = { CASH: 'เงินสด', TRANSFER: 'โอนเงิน/พร้อมเพย์', CARD: 'บัตรเครดิต', CREDIT: 'เงินเชื่อ' };

/**
 * Off-screen 80mm thermal receipt. When mounted it triggers the browser print
 * dialog and calls onDone once printing finishes (or is cancelled). Only this
 * element is visible during printing (see .receipt-print rules in index.css).
 */
export function ReceiptPrint({ sale, setting, onDone }: { sale: Sale; setting: Setting | null; onDone: () => void }) {
  useEffect(() => {
    const done = () => { window.removeEventListener('afterprint', done); onDone(); };
    window.addEventListener('afterprint', done);
    const t = setTimeout(() => window.print(), 80); // let layout settle
    return () => { clearTimeout(t); window.removeEventListener('afterprint', done); };
  }, []);

  const currency = setting?.currency || 'THB';
  const discount = num(sale.discount);
  const promo = num(sale.promoDiscount ?? 0);
  const manual = Math.max(0, discount - promo);

  return (
    <div className="receipt-print">
      <div className="receipt-paper">
        <div className="r-center">
          <div style={{ fontSize: 15, fontWeight: 800 }}>{setting?.storeName || 'POS Store'}</div>
          {setting?.address && <div>{setting.address}</div>}
          {setting?.phone && <div>โทร. {setting.phone}</div>}
          {setting?.taxId && <div>เลขผู้เสียภาษี {setting.taxId}</div>}
        </div>

        <div className="r-hr" />
        <div className="r-row"><span>เลขที่บิล</span><span>{sale.orderNo}</span></div>
        <div className="r-row"><span>วันที่</span><span>{dateTime(sale.createdAt)}</span></div>
        {sale.cashier?.name && <div className="r-row"><span>แคชเชียร์</span><span>{sale.cashier.name}</span></div>}
        {sale.member && <div className="r-row"><span>สมาชิก</span><span>{sale.member.name}</span></div>}

        <div className="r-hr" />
        {sale.items.map((i) => (
          <div key={i.id} style={{ marginBottom: 3 }}>
            <div>{i.nameSnapshot}</div>
            <div className="r-row"><span>{i.qty} x {num(i.unitPrice).toFixed(2)}</span><span>{num(i.lineTotal).toFixed(2)}</span></div>
          </div>
        ))}

        <div className="r-hr" />
        <div className="r-row"><span>รวมราคาสินค้า</span><span>{num(sale.subtotal).toFixed(2)}</span></div>
        {manual > 0 && <div className="r-row"><span>ส่วนลดบิล</span><span>-{manual.toFixed(2)}</span></div>}
        {promo > 0 && <div className="r-row"><span>ส่วนลดโปรโมชั่น</span><span>-{promo.toFixed(2)}</span></div>}
        {promo > 0 && sale.promoNames && <div style={{ fontSize: 11 }}>({sale.promoNames})</div>}
        <div className="r-row"><span>ภาษีมูลค่าเพิ่ม{setting?.taxInclusive ? ' (รวม)' : ''} {num(setting?.taxRatePct ?? 7)}%</span><span>{num(sale.taxAmount).toFixed(2)}</span></div>

        <div className="r-hr" />
        <div className="r-row" style={{ fontSize: 16, fontWeight: 800 }}><span>ยอดสุทธิ</span><span>{money(sale.total, currency)}</span></div>

        <div className="r-hr" />
        <div className="r-row"><span>ชำระโดย</span><span>{PM[sale.paymentMethod] ?? sale.paymentMethod}</span></div>
        {sale.paymentMethod === 'CASH' && (
          <>
            <div className="r-row"><span>รับเงิน</span><span>{num(sale.cashReceived).toFixed(2)}</span></div>
            <div className="r-row"><span>เงินทอน</span><span>{num(sale.changeDue).toFixed(2)}</span></div>
          </>
        )}
        {sale.paymentMethod === 'TRANSFER' && <div className="r-center" style={{ marginTop: 4 }}>ชำระผ่าน PromptPay</div>}

        <div className="r-hr" />
        <div className="r-center" style={{ marginTop: 4 }}>{setting?.receiptFooter || 'ขอบคุณที่ใช้บริการ'}</div>
        <div className="r-center" style={{ fontSize: 11, marginTop: 6 }}>*** {sale.orderNo} ***</div>
      </div>
    </div>
  );
}
