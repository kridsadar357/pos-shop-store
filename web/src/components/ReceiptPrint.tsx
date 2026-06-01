import { useEffect, useState } from 'react';
import { api, resolveUrl } from '../api/client';
import { QRCanvas } from './QRCode';
import { money, num, dateTime } from '../lib/format';
import type { Sale, Setting } from '../types';

const PM: Record<string, string> = { CASH: 'เงินสด', TRANSFER: 'โอนเงิน/พร้อมเพย์', CARD: 'บัตรเครดิต', CREDIT: 'เงินเชื่อ' };

/**
 * Off-screen 80mm thermal receipt. When mounted it triggers the browser print
 * dialog and calls onDone once printing finishes (or is cancelled). Only this
 * element is visible during printing (see .receipt-print rules in index.css).
 * Honours the receipt design settings (logo, header, footer PromptPay QR).
 */
export function ReceiptPrint({ sale, setting, onDone }: { sale: Sale; setting: Setting | null; onDone: () => void }) {
  const needQR = !!(setting?.receiptShowQR && setting?.promptPayId);
  const [qr, setQr] = useState(sale.qrPayload || '');
  const [ready, setReady] = useState(!needQR);

  // Fetch a PromptPay payload (with this bill's amount) for the footer QR.
  useEffect(() => {
    if (!needQR) return;
    if (qr) { setReady(true); return; }
    api<{ payload: string }>('/settings/promptpay', { query: { amount: num(sale.total).toFixed(2), branchId: sale.branchId ?? undefined } })
      .then((r) => { setQr(r.payload); })
      .catch(() => {})
      .finally(() => setReady(true));
  }, [needQR]);

  useEffect(() => {
    if (!ready) return;
    const done = () => { window.removeEventListener('afterprint', done); onDone(); };
    window.addEventListener('afterprint', done);
    const t = setTimeout(() => window.print(), 120); // let layout + QR settle
    return () => { clearTimeout(t); window.removeEventListener('afterprint', done); };
  }, [ready]);

  const currency = setting?.currency || 'THB';
  const discount = num(sale.discount);
  const promo = num(sale.promoDiscount ?? 0);
  const manual = Math.max(0, discount - promo);

  return (
    <div className="receipt-print">
      <div className="receipt-paper">
        <div className="r-center">
          {setting?.receiptLogoUrl && <img src={resolveUrl(setting.receiptLogoUrl)} alt="" style={{ maxHeight: 56, margin: '0 auto 4px', objectFit: 'contain' }} />}
          <div style={{ fontSize: 15, fontWeight: 800 }}>{setting?.storeName || 'POS Store'}</div>
          {setting?.address && <div>{setting.address}</div>}
          {setting?.phone && <div>โทร. {setting.phone}</div>}
          {setting?.taxId && <div>เลขผู้เสียภาษี {setting.taxId}</div>}
          {setting?.receiptHeader && <div style={{ marginTop: 3, whiteSpace: 'pre-line' }}>{setting.receiptHeader}</div>}
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
        {(sale.pointsRedeemed ?? 0) > 0 && <div className="r-row"><span>ส่วนลดจากแต้ม ({sale.pointsRedeemed})</span><span>-{((sale.pointsRedeemed ?? 0) * num(setting?.pointsRedeemValue ?? 0)).toFixed(2)}</span></div>}
        <div className="r-row"><span>ภาษีมูลค่าเพิ่ม{setting?.taxInclusive ? ' (รวม)' : ''} {num(setting?.taxRatePct ?? 7)}%</span><span>{num(sale.taxAmount).toFixed(2)}</span></div>

        <div className="r-hr" />
        <div className="r-row" style={{ fontSize: 16, fontWeight: 800 }}><span>ยอดสุทธิ</span><span>{money(sale.total, currency)}</span></div>

        <div className="r-hr" />
        {sale.payments && sale.payments.length > 1 ? (
          <>
            <div className="r-row"><span>ชำระโดย</span><span>แยกชำระ</span></div>
            {sale.payments.map((p, i) => (
              <div className="r-row" key={i}><span>· {PM[p.method] ?? p.method}</span><span>{num(p.amount).toFixed(2)}</span></div>
            ))}
            {num(sale.cashReceived) > 0 && <div className="r-row"><span>รับเงินสด</span><span>{num(sale.cashReceived).toFixed(2)}</span></div>}
            {num(sale.changeDue) > 0 && <div className="r-row"><span>เงินทอน</span><span>{num(sale.changeDue).toFixed(2)}</span></div>}
          </>
        ) : (
          <>
            <div className="r-row"><span>ชำระโดย</span><span>{PM[sale.paymentMethod] ?? sale.paymentMethod}</span></div>
            {sale.paymentMethod === 'CASH' && (
              <>
                <div className="r-row"><span>รับเงิน</span><span>{num(sale.cashReceived).toFixed(2)}</span></div>
                <div className="r-row"><span>เงินทอน</span><span>{num(sale.changeDue).toFixed(2)}</span></div>
              </>
            )}
          </>
        )}
        {sale.paymentMethod === 'TRANSFER' && <div className="r-center" style={{ marginTop: 4 }}>ชำระผ่าน PromptPay</div>}

        {needQR && qr && (
          <>
            <div className="r-hr" />
            <div className="r-center" style={{ marginTop: 4 }}>
              <div style={{ fontSize: 11, fontWeight: 700 }}>สแกนเพื่อชำระ (PromptPay)</div>
              <div style={{ margin: '4px auto 0', width: 'fit-content' }}><QRCanvas value={qr} size={120} /></div>
              <div style={{ fontSize: 11 }}>{money(sale.total, currency)}</div>
            </div>
          </>
        )}

        {sale.member && (sale.pointsEarned ?? 0) > 0 && (
          <>
            <div className="r-hr" />
            <div className="r-row"><span>ได้รับแต้มสะสม</span><span>+{sale.pointsEarned} แต้ม</span></div>
          </>
        )}

        <div className="r-hr" />
        <div className="r-center" style={{ marginTop: 4 }}>{setting?.receiptFooter || 'ขอบคุณที่ใช้บริการ'}</div>
        <div className="r-center" style={{ fontSize: 11, marginTop: 6 }}>*** {sale.orderNo} ***</div>
      </div>
    </div>
  );
}
