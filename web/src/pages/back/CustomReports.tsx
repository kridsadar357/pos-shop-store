import { useEffect, useMemo, useState } from 'react';
import { api } from '../../api/client';
import { PageHeader, EmptyState } from '../../components/ui';
import { toast } from '../../components/Toast';
import { money } from '../../lib/format';
import { makeExporters, type Column } from '../../lib/export';
import { useBranch } from '../../store/branch';
import type { Setting } from '../../types';

type Dimension = 'day' | 'month' | 'branch' | 'cashier' | 'paymentMethod' | 'type' | 'category' | 'product' | 'member';
type Metric = 'orders' | 'qty' | 'sales' | 'cost' | 'profit' | 'marginPct';

interface Meta {
  dimensions: { key: Dimension; label: string }[];
  metrics: { key: Metric; label: string }[];
}
interface ReportConfig {
  groupBy: Dimension[];
  metrics: Metric[];
  sort?: { key: string; dir: 'asc' | 'desc' };
}
interface ReportColumn { key: string; label: string; kind: 'dimension' | 'metric' }
interface RunResult {
  columns: ReportColumn[];
  rows: Record<string, string | number>[];
  totals: Record<string, number>;
}
interface SavedReport { id: number; name: string; config: ReportConfig; createdBy: string | null; updatedAt: string }

const MONEY_METRICS = new Set<string>(['sales', 'cost', 'profit']);

function todayISO() { return new Date().toISOString().slice(0, 10); }
function daysAgoISO(n: number) { return new Date(Date.now() - n * 864e5).toISOString().slice(0, 10); }

function fmtCell(col: ReportColumn, v: string | number): string {
  if (col.kind === 'dimension') return String(v ?? '—');
  if (col.key === 'marginPct') return `${Number(v).toFixed(1)}%`;
  if (MONEY_METRICS.has(col.key)) return money(Number(v));
  return Number(v).toLocaleString('th-TH');
}

export default function CustomReports() {
  const branches = useBranch((s) => s.branches);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [store, setStore] = useState('POS Suite');

  // Builder state
  const [groupBy, setGroupBy] = useState<Dimension[]>(['category']);
  const [metrics, setMetrics] = useState<Metric[]>(['orders', 'sales', 'profit']);
  const [from, setFrom] = useState(daysAgoISO(30));
  const [to, setTo] = useState(todayISO());
  const [branchId, setBranchId] = useState('');

  const [result, setResult] = useState<RunResult | null>(null);
  const [running, setRunning] = useState(false);
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | undefined>(undefined);

  // Saved definitions
  const [saved, setSaved] = useState<SavedReport[]>([]);
  const [loadedId, setLoadedId] = useState<number | null>(null);

  useEffect(() => {
    api<Meta>('/custom-reports/meta').then(setMeta).catch(() => {});
    api<Setting>('/settings').then((s) => setStore(s.storeName)).catch(() => {});
    loadSaved();
  }, []);

  function loadSaved() {
    api<SavedReport[]>('/custom-reports').then(setSaved).catch(() => {});
  }

  const config = useMemo<ReportConfig>(() => ({ groupBy, metrics, sort }), [groupBy, metrics, sort]);

  function toggleDim(d: Dimension) {
    setGroupBy((cur) => {
      if (cur.includes(d)) return cur.filter((x) => x !== d);
      if (cur.length >= 2) return [cur[1], d]; // keep max 2 (drop the oldest)
      return [...cur, d];
    });
  }
  function toggleMetric(m: Metric) {
    setMetrics((cur) => (cur.includes(m) ? cur.filter((x) => x !== m) : [...cur, m]));
  }

  async function run(cfg: ReportConfig = config) {
    if (!cfg.groupBy.length) return toast.error('เลือกการจัดกลุ่มอย่างน้อย 1 รายการ');
    if (!cfg.metrics.length) return toast.error('เลือกค่าที่ต้องการวัดอย่างน้อย 1 รายการ');
    setRunning(true);
    try {
      const res = await api<RunResult>('/custom-reports/run', {
        method: 'POST',
        body: {
          from: new Date(from).toISOString(),
          to: new Date(to + 'T23:59:59').toISOString(),
          branchId: branchId ? Number(branchId) : null,
          config: cfg,
        },
      });
      setResult(res);
    } catch (e) {
      toast.error((e as Error).message || 'รันรายงานไม่สำเร็จ');
    } finally {
      setRunning(false);
    }
  }

  function onHeaderSort(key: string) {
    const dir: 'asc' | 'desc' = sort?.key === key && sort.dir === 'desc' ? 'asc' : 'desc';
    const next = { key, dir };
    setSort(next);
    run({ ...config, sort: next });
  }

  async function save() {
    const name = window.prompt('ตั้งชื่อรายงาน', saved.find((s) => s.id === loadedId)?.name || '');
    if (!name?.trim()) return;
    try {
      const existing = saved.find((s) => s.name === name.trim());
      if (existing) {
        await api(`/custom-reports/${existing.id}`, { method: 'PUT', body: { name: name.trim(), config } });
        setLoadedId(existing.id);
      } else {
        const created = await api<{ id: number }>('/custom-reports', { method: 'POST', body: { name: name.trim(), config } });
        setLoadedId(created.id);
      }
      toast.success('บันทึกรายงานแล้ว');
      loadSaved();
    } catch (e) {
      toast.error((e as Error).message || 'บันทึกไม่สำเร็จ');
    }
  }

  function applySaved(r: SavedReport) {
    setLoadedId(r.id);
    setGroupBy(r.config.groupBy);
    setMetrics(r.config.metrics);
    setSort(r.config.sort);
    run(r.config);
  }

  async function remove(r: SavedReport) {
    if (!window.confirm(`ลบรายงาน "${r.name}" ?`)) return;
    await api(`/custom-reports/${r.id}`, { method: 'DELETE' }).catch(() => {});
    if (loadedId === r.id) setLoadedId(null);
    loadSaved();
  }

  const exporters = useMemo(() => {
    if (!result) return null;
    const columns: Column<Record<string, string | number>>[] = result.columns.map((c) => ({
      label: c.label,
      value: (row) => (c.kind === 'metric' ? Number(row[c.key]) : String(row[c.key] ?? '')),
      right: c.kind === 'metric',
    }));
    return makeExporters({
      filename: 'custom-report',
      title: 'รายงานแบบกำหนดเอง',
      subtitle: `${from} – ${to}`,
      columns,
      rows: () => result.rows,
      storeName: store,
    });
  }, [result, from, to, store]);

  if (!meta) return <div className="p-6 text-slate-400">กำลังโหลด…</div>;

  return (
    <div className="space-y-5">
      <PageHeader
        title="รายงานแบบกำหนดเอง"
        subtitle="สร้างรายงานเอง: เลือกการจัดกลุ่ม ค่าที่ต้องการวัด ช่วงเวลา แล้วบันทึกไว้ใช้ซ้ำ"
        icon={<i className="fa-solid fa-table-cells" />}
        actions={
          exporters && (
            <div className="flex items-center gap-2">
              <button onClick={exporters.excel} className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700"><i className="fa-solid fa-file-excel mr-1" /> Excel</button>
              <button onClick={exporters.csv} className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-200">CSV</button>
              <button onClick={exporters.pdf} className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-200"><i className="fa-solid fa-file-pdf mr-1" /> PDF</button>
            </div>
          )
        }
      />

      <div className="grid gap-5 lg:grid-cols-[300px,1fr]">
        {/* Builder panel */}
        <div className="space-y-4 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
          <div>
            <div className="mb-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">จัดกลุ่มตาม (สูงสุด 2)</div>
            <div className="flex flex-wrap gap-1.5">
              {meta.dimensions.map((d) => {
                const i = groupBy.indexOf(d.key);
                const on = i >= 0;
                return (
                  <button key={d.key} onClick={() => toggleDim(d.key)}
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 transition ${on ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50'}`}>
                    {on && <span className="mr-1 opacity-80">{i + 1}.</span>}{d.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div className="mb-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">ค่าที่ต้องการวัด</div>
            <div className="flex flex-wrap gap-1.5">
              {meta.metrics.map((m) => {
                const on = metrics.includes(m.key);
                return (
                  <button key={m.key} onClick={() => toggleMetric(m.key)}
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 transition ${on ? 'bg-amber-500 text-white ring-amber-500' : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50'}`}>
                    {m.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs font-semibold text-slate-500">จากวันที่
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm" />
            </label>
            <label className="text-xs font-semibold text-slate-500">ถึงวันที่
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm" />
            </label>
          </div>
          {branches.length > 1 && (
            <label className="block text-xs font-semibold text-slate-500">สาขา
              <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm">
                <option value="">ทุกสาขา</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </label>
          )}

          <div className="flex gap-2 pt-1">
            <button onClick={() => run()} disabled={running} className="flex-1 rounded-lg bg-brand-600 px-3 py-2 text-sm font-bold text-white hover:bg-brand-700 disabled:opacity-50">
              {running ? 'กำลังรัน…' : <><i className="fa-solid fa-play mr-1" /> รันรายงาน</>}
            </button>
            <button onClick={save} className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-200"><i className="fa-solid fa-floppy-disk mr-1" /> บันทึก</button>
          </div>

          {/* Saved definitions */}
          {saved.length > 0 && (
            <div className="border-t border-slate-100 pt-3">
              <div className="mb-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">รายงานที่บันทึกไว้</div>
              <div className="space-y-1">
                {saved.map((r) => (
                  <div key={r.id} className={`flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm ${loadedId === r.id ? 'bg-brand-50 ring-1 ring-brand-200' : 'hover:bg-slate-50'}`}>
                    <button onClick={() => applySaved(r)} className="min-w-0 flex-1 truncate text-left font-semibold text-slate-700" title={r.name}>{r.name}</button>
                    <button onClick={() => remove(r)} className="shrink-0 px-1 text-slate-400 hover:text-rose-500" title="ลบ"><i className="fa-solid fa-trash text-xs" /></button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Results */}
        <div className="min-w-0 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
          {!result ? (
            <EmptyState icon={<i className="fa-solid fa-table-cells" />} title="ยังไม่มีรายงาน" hint="ตั้งค่าทางซ้ายแล้วกด “รันรายงาน”" />
          ) : result.rows.length === 0 ? (
            <EmptyState icon="∅" title="ไม่มีข้อมูลในช่วงนี้" hint="ลองปรับช่วงวันที่หรือสาขา" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                    {result.columns.map((c) => (
                      <th key={c.key} onClick={() => onHeaderSort(c.key)}
                        className={`cursor-pointer select-none py-2 px-2 font-bold hover:text-brand-600 ${c.kind === 'metric' ? 'text-right' : ''}`}>
                        {c.label}
                        {sort?.key === c.key && <i className={`ml-1 fa-solid ${sort.dir === 'asc' ? 'fa-caret-up' : 'fa-caret-down'}`} />}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((row, i) => (
                    <tr key={i} className="border-b border-slate-50 hover:bg-slate-50">
                      {result.columns.map((c) => (
                        <td key={c.key} className={`py-1.5 px-2 ${c.kind === 'metric' ? 'text-right tabular-nums' : 'font-medium text-slate-700'}`}>
                          {fmtCell(c, row[c.key])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-300 font-bold text-ink-900">
                    {result.columns.map((c, idx) => (
                      <td key={c.key} className={`py-2 px-2 ${c.kind === 'metric' ? 'text-right tabular-nums' : ''}`}>
                        {idx === 0 ? 'รวม' : c.kind === 'metric' ? fmtCell(c, result.totals[c.key]) : ''}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              </table>
              <div className="mt-2 text-xs text-slate-400">{result.rows.length} แถว</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
