import { useEffect } from 'react';
import { money, num, dateTime } from '../lib/format';
import type { Sale, Setting, TaxInvoice } from '../types';

/**
 * Off-screen A4 full VAT tax invoice (ใบกำกับภาษีเต็มรูป). Prices are VAT-inclusive,
 * so the base and VAT are derived from the sale total. Prints on mount.
 */
export function TaxInvoiceDoc({ sale, invoice, setting, onDone }: { sale: Sale; invoice: TaxInvoice; setting: Setting | null; onDone: () => void }) {
  useEffect(() => {
    const done = () => { window.removeEventListener('afterprint', done); onDone(); };
    window.addEventListener('afterprint', done);
    const t = setTimeout(() => window.print(), 150);
    return () => { clearTimeout(t); window.removeEventListener('afterprint', done); };
  }, []);

  const currency = setting?.currency || 'THB';
  const rate = num(setting?.taxRatePct ?? 7);
  const total = num(sale.total);
  // VAT-inclusive: derive base + VAT from the grand total.
  const base = Math.round((total / (1 + rate / 100)) * 100) / 100;
  const vat = Math.round((total - base) * 100) / 100;
  const items = sale.items ?? [];

  return (
    <div className="report-print">
      <div className="report-paper" style={{ padding: '0 4mm' }}>
        <div style={{ textAlign: 'center', fontSize: 18, fontWeight: 800, marginBottom: 2 }}>ใบกำกับภาษี / Tax Invoice</div>
        <div style={{ textAlign: 'center', fontSize: 12, marginBottom: 10 }}>(ต้นฉบับ / Original)</div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
          <div style={{ fontSize: 12 }}>
            <div style={{ fontSize: 15, fontWeight: 800 }}>{setting?.storeName || 'POS Store'}</div>
            {setting?.address && <div>{setting.address}</div>}
            {setting?.phone && <div>โทร. {setting.phone}</div>}
            {setting?.taxId && <div>เลขประจำตัวผู้เสียภาษี {setting.taxId}</div>}
          </div>
          <div style={{ textAlign: 'right', fontSize: 12 }}>
            <div>เลขที่ / No. <strong>{invoice.number}</strong></div>
            <div>วันที่ / Date {dateTime(invoice.issuedAt)}</div>
            <div>อ้างอิงบิล {sale.orderNo}</div>
          </div>
        </div>

        <div style={{ border: '1px solid #cbd5e1', borderRadius: 4, padding: '6px 8px', marginBottom: 10, fontSize: 12 }}>
          <div><strong>ลูกค้า / Customer:</strong> {invoice.buyerName}</div>
          {invoice.buyerAddress && <div><strong>ที่อยู่:</strong> {invoice.buyerAddress}</div>}
          <div style={{ display: 'flex', gap: 24 }}>
            {invoice.buyerTaxId && <span><strong>เลขประจำตัวผู้เสียภาษี:</strong> {invoice.buyerTaxId}</span>}
            {invoice.buyerBranch && <span><strong>สาขา:</strong> {invoice.buyerBranch}</span>}
          </div>
        </div>

        <table>
          <thead>
            <tr><th style={{ width: '6%' }}>#</th><th>รายการ</th><th style={{ width: '12%', textAlign: 'right' }}>จำนวน</th><th style={{ width: '18%', textAlign: 'right' }}>ราคา/หน่วย</th><th style={{ width: '20%', textAlign: 'right' }}>จำนวนเงิน</th></tr>
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
            {num(sale.discount) > 0 && <tr><td colSpan={4} style={{ textAlign: 'right' }}>ส่วนลด</td><td style={{ textAlign: 'right' }}>-{num(sale.discount).toFixed(2)}</td></tr>}
            <tr><td colSpan={4} style={{ textAlign: 'right' }}>มูลค่าสินค้า (ก่อน VAT)</td><td style={{ textAlign: 'right' }}>{base.toFixed(2)}</td></tr>
            <tr><td colSpan={4} style={{ textAlign: 'right' }}>ภาษีมูลค่าเพิ่ม {rate}%</td><td style={{ textAlign: 'right' }}>{vat.toFixed(2)}</td></tr>
            <tr><td colSpan={4} style={{ textAlign: 'right', fontWeight: 800 }}>รวมทั้งสิ้น</td><td style={{ textAlign: 'right', fontWeight: 800 }}>{money(total, currency)}</td></tr>
          </tfoot>
        </table>

        <div style={{ marginTop: 6, fontSize: 11, color: '#475569' }}>* ราคาดังกล่าวรวมภาษีมูลค่าเพิ่มแล้ว</div>
        <div style={{ marginTop: 40, display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
          <div style={{ textAlign: 'center', width: '40%' }}>...........................................<br />ผู้รับสินค้า / Customer</div>
          <div style={{ textAlign: 'center', width: '40%' }}>...........................................<br />ผู้มีอำนาจลงนาม / Authorized</div>
        </div>
      </div>
    </div>
  );
}
