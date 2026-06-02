import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { DataTable } from '../../components/DataTable';
import { ListToolbar } from '../../components/ListToolbar';
import { makeExporters, type Column } from '../../lib/export';
import { dateTime } from '../../lib/format';

interface SerialRow {
  id: number;
  serialNo: string;
  status: 'IN_STOCK' | 'SOLD' | 'RETURNED';
  note: string;
  receivedRef: string;
  receivedAt: string;
  soldAt: string | null;
  orderNo: string | null;
  product?: { name: string; sku: string } | null;
}

const STATUSES = ['', 'IN_STOCK', 'SOLD', 'RETURNED'];
const STATUS_TH: Record<string, string> = { '': 'ทุกสถานะ', IN_STOCK: 'อยู่ในสต็อก', SOLD: 'ขายแล้ว', RETURNED: 'รับคืน' };
const STATUS_COLOR: Record<string, string> = {
  IN_STOCK: 'bg-emerald-50 text-emerald-700',
  SOLD: 'bg-brand-50 text-brand-700',
  RETURNED: 'bg-amber-50 text-amber-700',
};

export default function Serials() {
  const [rows, setRows] = useState<SerialRow[]>([]);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        setRows(await api<SerialRow[]>('/products/serials/search', { query: { q: q.trim() || undefined, status: status || undefined } }));
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q, status]);

  const columns: Column<SerialRow>[] = [
    { label: 'หมายเลขซีเรียล', value: (r) => r.serialNo },
    { label: 'สินค้า', value: (r) => r.product?.name ?? '' },
    { label: 'SKU', value: (r) => r.product?.sku ?? '' },
    { label: 'สถานะ', value: (r) => STATUS_TH[r.status] ?? r.status },
    { label: 'รับเข้า', value: (r) => dateTime(r.receivedAt) },
    { label: 'อ้างอิงรับเข้า', value: (r) => r.receivedRef },
    { label: 'ขายเมื่อ', value: (r) => (r.soldAt ? dateTime(r.soldAt) : '') },
    { label: 'เลขที่บิล', value: (r) => r.orderNo ?? '' },
  ];
  const exporters = makeExporters({ filename: 'serials', title: 'ทะเบียนหมายเลขซีเรียล / รับประกัน', columns, rows: () => rows });

  return (
    <div className="flex h-full flex-col gap-4">
      <ListToolbar
        title="ซีเรียล / รับประกัน"
        subtitle="ค้นหาหมายเลขซีเรียลเพื่อตรวจสอบสถานะ การรับเข้า และการขาย (ใช้ที่จุดบริการรับประกัน)"
        icon={<i className="fa-solid fa-barcode" />}
        q={q} setQ={setQ} placeholder="สแกน/พิมพ์หมายเลขซีเรียล หรือชื่อสินค้า / SKU…"
        exports={exporters}
        filterCount={status ? 1 : 0}
        onResetFilter={() => setStatus('')}
        filter={
          <div>
            <label className="label">สถานะ</label>
            <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
              {STATUSES.map((s) => <option key={s} value={s}>{STATUS_TH[s]}</option>)}
            </select>
          </div>
        }
      />

      <DataTable
        rows={rows}
        colCount={6}
        reserve={370}
        empty={loading ? 'กำลังค้นหา…' : 'ไม่พบหมายเลขซีเรียล — เปิดติดตามซีเรียลที่หน้าสินค้าและรับเข้าพร้อมหมายเลข'}
        head={<tr><th className="px-4 py-3">หมายเลขซีเรียล</th><th className="px-4 py-3">สินค้า</th><th className="px-4 py-3">สถานะ</th><th className="px-4 py-3">รับเข้า</th><th className="px-4 py-3">ขายเมื่อ</th><th className="px-4 py-3">เลขที่บิล</th></tr>}
        renderRow={(r) => (
          <tr key={r.id} className="hover:bg-slate-50">
            <td className="px-4 py-2.5 font-mono font-medium">{r.serialNo}</td>
            <td className="px-4 py-2.5"><div className="font-medium">{r.product?.name}</div><div className="text-xs text-slate-400">{r.product?.sku}</div></td>
            <td className="px-4 py-2.5"><span className={`chip ${STATUS_COLOR[r.status] ?? 'bg-slate-100 text-slate-600'}`}>{STATUS_TH[r.status] ?? r.status}</span></td>
            <td className="px-4 py-2.5 text-slate-500"><div>{dateTime(r.receivedAt)}</div>{r.receivedRef && <div className="text-xs text-slate-400">{r.receivedRef}</div>}</td>
            <td className="px-4 py-2.5 text-slate-500">{r.soldAt ? dateTime(r.soldAt) : '—'}</td>
            <td className="px-4 py-2.5 text-slate-500">{r.orderNo ?? '—'}</td>
          </tr>
        )}
      />
    </div>
  );
}
