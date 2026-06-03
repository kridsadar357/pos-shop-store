// Ad-hoc report engine (the "custom report builder"). Pure + unit-tested.
//
// Operates on a flat list of sale-item "facts" (one row per sold line, carrying its
// parent sale's attributes). The route flattens Prisma rows into ReportFact[] and hands
// them here; this file never touches the DB so it stays trivially testable.

const round2 = (n: number) => Math.round(n * 100) / 100;

// One sold line + its parent sale's groupable attributes.
export interface ReportFact {
  saleId: number;
  day: string; // YYYY-MM-DD
  branch: string;
  cashier: string;
  paymentMethod: string;
  type: string; // RETAIL | WHOLESALE
  category: string;
  product: string;
  member: string;
  qty: number;
  sales: number; // line revenue (lineTotal)
  cost: number; // unitCost * qty
}

export type Dimension =
  | 'day'
  | 'month'
  | 'branch'
  | 'cashier'
  | 'paymentMethod'
  | 'type'
  | 'category'
  | 'product'
  | 'member';

export type Metric = 'orders' | 'qty' | 'sales' | 'cost' | 'profit' | 'marginPct';

export interface ReportConfig {
  groupBy: Dimension[]; // 1 or 2 dimensions
  metrics: Metric[]; // at least one
  sort?: { key: string; dir: 'asc' | 'desc' };
}

// Self-describing metadata (Thai labels) so the API response carries its own column headers.
export const DIMENSIONS: { key: Dimension; label: string }[] = [
  { key: 'day', label: 'วัน' },
  { key: 'month', label: 'เดือน' },
  { key: 'branch', label: 'สาขา' },
  { key: 'cashier', label: 'พนักงาน' },
  { key: 'paymentMethod', label: 'วิธีชำระ' },
  { key: 'type', label: 'ประเภท (ปลีก/ส่ง)' },
  { key: 'category', label: 'หมวดหมู่' },
  { key: 'product', label: 'สินค้า' },
  { key: 'member', label: 'ลูกค้า' },
];

export const METRICS: { key: Metric; label: string }[] = [
  { key: 'orders', label: 'จำนวนบิล' },
  { key: 'qty', label: 'จำนวนชิ้น' },
  { key: 'sales', label: 'ยอดขาย' },
  { key: 'cost', label: 'ต้นทุน' },
  { key: 'profit', label: 'กำไรขั้นต้น' },
  { key: 'marginPct', label: 'อัตรากำไร %' },
];

const DIM_KEYS = new Set(DIMENSIONS.map((d) => d.key));
const METRIC_KEYS = new Set(METRICS.map((m) => m.key));
const dimLabel = (k: Dimension) => DIMENSIONS.find((d) => d.key === k)?.label ?? k;
const metricLabel = (k: Metric) => METRICS.find((m) => m.key === k)?.label ?? k;

// Normalise + validate a raw config (from the API / a saved definition). Throws on nonsense
// so the route can return 400.
export function normalizeConfig(raw: unknown): ReportConfig {
  const r = (raw ?? {}) as Partial<ReportConfig>;
  const groupBy = (Array.isArray(r.groupBy) ? r.groupBy : [])
    .filter((d): d is Dimension => DIM_KEYS.has(d as Dimension))
    .filter((d, i, a) => a.indexOf(d) === i) // de-dupe
    .slice(0, 2);
  let metrics = (Array.isArray(r.metrics) ? r.metrics : [])
    .filter((m): m is Metric => METRIC_KEYS.has(m as Metric))
    .filter((m, i, a) => a.indexOf(m) === i);
  // status 400 so the Express error handler returns a client error, not a 500.
  if (!groupBy.length) throw Object.assign(new Error('เลือกการจัดกลุ่ม (group by) อย่างน้อย 1 รายการ'), { status: 400 });
  if (!metrics.length) metrics = ['orders', 'sales', 'profit'];
  const sort =
    r.sort && typeof r.sort.key === 'string' && (r.sort.dir === 'asc' || r.sort.dir === 'desc')
      ? { key: r.sort.key, dir: r.sort.dir }
      : undefined;
  return { groupBy, metrics, sort };
}

const dimValue = (f: ReportFact, dim: Dimension): string => {
  if (dim === 'month') return f.day.slice(0, 7);
  return String(f[dim] ?? '');
};

interface Bucket {
  keys: string[];
  saleIds: Set<number>;
  qty: number;
  sales: number;
  cost: number;
}

const computeMetric = (b: Bucket, m: Metric): number => {
  switch (m) {
    case 'orders':
      return b.saleIds.size;
    case 'qty':
      return b.qty;
    case 'sales':
      return round2(b.sales);
    case 'cost':
      return round2(b.cost);
    case 'profit':
      return round2(b.sales - b.cost);
    case 'marginPct':
      return b.sales ? round2(((b.sales - b.cost) / b.sales) * 100) : 0;
  }
};

export interface ReportColumn {
  key: string;
  label: string;
  kind: 'dimension' | 'metric';
}

export interface ReportResult {
  columns: ReportColumn[];
  rows: Record<string, string | number>[];
  totals: Record<string, number>;
}

// The engine: group facts by the chosen dimension(s), aggregate the chosen metrics, sort,
// and emit table-shaped rows + a grand-total row.
export function runCustomReport(facts: ReportFact[], config: ReportConfig): ReportResult {
  const { groupBy, metrics } = config;
  const buckets = new Map<string, Bucket>();
  const grand: Bucket = { keys: [], saleIds: new Set(), qty: 0, sales: 0, cost: 0 };

  for (const f of facts) {
    const keys = groupBy.map((d) => dimValue(f, d));
    const id = keys.join('');
    let b = buckets.get(id);
    if (!b) {
      b = { keys, saleIds: new Set(), qty: 0, sales: 0, cost: 0 };
      buckets.set(id, b);
    }
    b.saleIds.add(f.saleId);
    b.qty += f.qty;
    b.sales += f.sales;
    b.cost += f.cost;
    grand.saleIds.add(f.saleId);
    grand.qty += f.qty;
    grand.sales += f.sales;
    grand.cost += f.cost;
  }

  const columns: ReportColumn[] = [
    ...groupBy.map((d) => ({ key: d, label: dimLabel(d), kind: 'dimension' as const })),
    ...metrics.map((m) => ({ key: m, label: metricLabel(m), kind: 'metric' as const })),
  ];

  const rows = [...buckets.values()].map((b) => {
    const row: Record<string, string | number> = {};
    groupBy.forEach((d, i) => (row[d] = b.keys[i] || '—'));
    for (const m of metrics) row[m] = computeMetric(b, m);
    return row;
  });

  // Sort: explicit config, else by the first metric descending (ties → first dimension asc).
  const sortKey = config.sort?.key ?? metrics[0];
  const sortDir = config.sort?.dir ?? 'desc';
  const isMetric = METRIC_KEYS.has(sortKey as Metric);
  rows.sort((a, b) => {
    const av = a[sortKey];
    const bv = b[sortKey];
    let cmp: number;
    if (isMetric) cmp = Number(av) - Number(bv);
    else cmp = String(av).localeCompare(String(bv), 'th');
    if (cmp === 0) cmp = String(a[groupBy[0]]).localeCompare(String(b[groupBy[0]]), 'th');
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const totals: Record<string, number> = {};
  for (const m of metrics) totals[m] = computeMetric(grand, m);

  return { columns, rows, totals };
}
