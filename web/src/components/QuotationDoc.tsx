import { useEffect } from 'react';
import { money, num, dateTime } from '../lib/format';
import type { Quotation, Setting } from '../types';

/** Off-screen A4 quotation document; prints on mount (reuses .report-print scope). */
export function QuotationDoc({ quotation, setting, onDone }: { quotation: Quotation; setting: Setting | null; onDone: () => void }) {
  useEffect(() => {
    const done = () => { window.removeEventListener('afterprint', done); onDone(); };
    window.addEventListener('afterprint', done);
    const t = setTimeout(() => window.print(), 150);
    return () => { clearTimeout(t); window.removeEventListener('afterprint', done); };
  }, []);

  const currency = setting?.currency || 'THB';
  const items = quotation.items ?? [];

  return (
    <div className="report-print">
      <div className="report-paper" style={{ padding: '0 4mm' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{setting?.storeName || 'POS Store'}</div>
            {setting?.address && <div style={{ fontSize: 12 }}>{setting.address}</div>}
            {setting?.phone && <div style={{ fontSize: 12 }}>โทร. {setting.phone}</div>}
            {setting?.taxId && <div style={{ fontSize: 12 }}>เลขผู้เสียภาษี {setting.taxId}</div>}
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 20, fontWeight: 800 }}>ใบเสนอราคา</div>
            <div style={{ fontSize: 12 }}>เลขที่ {quotation.refNo}</div>
            <div style={{ fontSize: 12 }}>วันที่ {dateTime(quotation.createdAt)}</div>
            {quotation.validUntil && <div style={{ fontSize: 12 }}>ยืนราคาถึง {dateTime(quotation.validUntil)}</div>}
          </div>
        </div>

        <div style={{ marginBottom: 8, fontSize: 13 }}>
          <strong>ลูกค้า:</strong> {quotation.customerName || 'ลูกค้าทั่วไป'} · <strong>ประเภทราคา:</strong> {quotation.type === 'WHOLESALE' ? 'ขายส่ง' : 'ขายปลีก'}
        </div>

        <table>
          <thead>
            <tr><th style={{ width: '6%' }}>#</th><th>รายการ</th><th style={{ width: '12%', textAlign: 'right' }}>จำนวน</th><th style={{ width: '18%', textAlign: 'right' }}>ราคา/หน่วย</th><th style={{ width: '20%', textAlign: 'right' }}>รวม</th></tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={i}>
                <td>{i + 1}</td>
                <td>{it.nameSnapshot}</td>
                <td style={{ textAlign: 'right' }}>{it.qty}</td>
                <td style={{ textAlign: 'right' }}>{num(it.unitPrice).toFixed(2)}</td>
                <td style={{ textAlign: 'right' }}>{num(it.lineTotal).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr><td colSpan={4} style={{ textAlign: 'right' }}>รวมเป็นเงิน</td><td style={{ textAlign: 'right' }}>{num(quotation.subtotal).toFixed(2)}</td></tr>
            {num(quotation.discount) > 0 && <tr><td colSpan={4} style={{ textAlign: 'right' }}>ส่วนลด</td><td style={{ textAlign: 'right' }}>-{num(quotation.discount).toFixed(2)}</td></tr>}
            <tr><td colSpan={4} style={{ textAlign: 'right' }}>ภาษีมูลค่าเพิ่ม{setting?.taxInclusive ? ' (รวมแล้ว)' : ''}</td><td style={{ textAlign: 'right' }}>{num(quotation.taxAmount).toFixed(2)}</td></tr>
            <tr><td colSpan={4} style={{ textAlign: 'right', fontWeight: 800 }}>ยอดสุทธิ</td><td style={{ textAlign: 'right', fontWeight: 800 }}>{money(quotation.total, currency)}</td></tr>
          </tfoot>
        </table>

        {quotation.note && <div style={{ marginTop: 10, fontSize: 12 }}><strong>หมายเหตุ:</strong> {quotation.note}</div>}
        <div style={{ marginTop: 40, display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
          <div style={{ textAlign: 'center', width: '40%' }}>...........................................<br />ผู้เสนอราคา</div>
          <div style={{ textAlign: 'center', width: '40%' }}>...........................................<br />ผู้อนุมัติ / ลูกค้า</div>
        </div>
      </div>
    </div>
  );
}
