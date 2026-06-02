import type { PrismaClient } from '@prisma/client';

const num = (d: unknown) => Number(d ?? 0);
const round2 = (n: number) => Math.round(n * 100) / 100;

export interface DailySummary {
  orders: number;
  revenue: number;
  cost: number;
  tax: number;
  grossProfit: number;
  expenses: number;
  byMethod: { method: string; total: number }[];
  topItems: { name: string; qty: number; revenue: number }[];
}

/** Compute a single day's sales summary (PAID sales between from..to). DB query. */
export async function computeDailySummary(prisma: PrismaClient, from: Date, to: Date): Promise<DailySummary> {
  const range = { gte: from, lte: to };
  const [sales, byMethodRaw, items, expenseAgg] = await Promise.all([
    prisma.sale.findMany({ where: { status: 'PAID', createdAt: range }, include: { items: true } }),
    prisma.salePayment.groupBy({ by: ['method'], _sum: { amount: true }, where: { sale: { status: 'PAID', createdAt: range } } }),
    prisma.saleItem.findMany({ where: { sale: { status: 'PAID', createdAt: range } }, select: { nameSnapshot: true, qty: true, lineTotal: true } }),
    prisma.expense.aggregate({ _sum: { amount: true }, where: { date: range } }),
  ]);

  let revenue = 0, cost = 0, tax = 0;
  for (const s of sales) {
    revenue += num(s.total);
    tax += num(s.taxAmount);
    cost += s.items.reduce((a, i) => a + num(i.unitCost) * i.qty, 0);
  }

  const itemMap = new Map<string, { name: string; qty: number; revenue: number }>();
  for (const i of items) {
    const row = itemMap.get(i.nameSnapshot) || { name: i.nameSnapshot, qty: 0, revenue: 0 };
    row.qty += i.qty;
    row.revenue += num(i.lineTotal);
    itemMap.set(i.nameSnapshot, row);
  }
  const topItems = [...itemMap.values()].sort((a, b) => b.qty - a.qty).slice(0, 5)
    .map((r) => ({ name: r.name, qty: r.qty, revenue: round2(r.revenue) }));

  return {
    orders: sales.length,
    revenue: round2(revenue),
    cost: round2(cost),
    tax: round2(tax),
    grossProfit: round2(revenue - tax - cost),
    expenses: round2(num(expenseAgg._sum.amount)),
    byMethod: byMethodRaw.map((g) => ({ method: g.method, total: round2(num(g._sum.amount)) })),
    topItems,
  };
}

/**
 * Whether the scheduled daily report should fire right now. Pure (takes `now` and
 * a `localDate` "YYYY-MM-DD" string for today): true when enabled, a recipient is
 * set, the local hour matches, and we haven't already sent today.
 */
export function shouldSendDailyReport(
  s: { reportEmailEnabled: boolean; reportEmailTo: string; reportEmailHour: number; reportEmailLastSent: string },
  now: Date,
  localDate: string
): boolean {
  return (
    !!s.reportEmailEnabled &&
    !!s.reportEmailTo.trim() &&
    now.getHours() === s.reportEmailHour &&
    s.reportEmailLastSent !== localDate
  );
}
