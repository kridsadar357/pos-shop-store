import { Router } from 'express';
import { prisma } from '../prisma.js';
import { ah, requireAuth, requireRole } from '../middleware/auth.js';

export const reportsRouter = Router();
reportsRouter.use(requireAuth, requireRole('ADMIN', 'MANAGER'));

function range(req: { query: Record<string, unknown> }) {
  const from = req.query.from ? new Date(String(req.query.from)) : new Date(Date.now() - 30 * 864e5);
  const to = req.query.to ? new Date(String(req.query.to)) : new Date();
  const branchId = req.query.branchId ? Number(req.query.branchId) : undefined;
  return { from, to, branchId };
}

const num = (d: unknown) => Number(d ?? 0);

// --- Sales summary + daily series ---
reportsRouter.get(
  '/summary',
  ah(async (req, res) => {
    const { from, to, branchId } = range(req);
    const sales = await prisma.sale.findMany({
      where: { status: 'PAID', branchId, createdAt: { gte: from, lte: to } },
      include: { items: true },
    });

    let revenue = 0;
    let cost = 0;
    let tax = 0;
    let discount = 0;
    const byDay = new Map<string, { date: string; revenue: number; orders: number; profit: number }>();

    for (const s of sales) {
      const total = num(s.total);
      const lineCost = s.items.reduce((acc, i) => acc + num(i.unitCost) * i.qty, 0);
      revenue += total;
      cost += lineCost;
      tax += num(s.taxAmount);
      discount += num(s.discount);
      const day = s.createdAt.toISOString().slice(0, 10);
      const row = byDay.get(day) || { date: day, revenue: 0, orders: 0, profit: 0 };
      row.revenue += total;
      row.orders += 1;
      row.profit += total - num(s.taxAmount) - lineCost;
      byDay.set(day, row);
    }

    const grossProfit = revenue - tax - cost;
    res.json({
      from,
      to,
      orders: sales.length,
      revenue: round2(revenue),
      tax: round2(tax),
      discount: round2(discount),
      cost: round2(cost),
      grossProfit: round2(grossProfit),
      marginPct: revenue ? round2((grossProfit / (revenue - tax || 1)) * 100) : 0,
      avgOrderValue: sales.length ? round2(revenue / sales.length) : 0,
      byDay: [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date)),
    });
  })
);

// --- Payment method breakdown ---
reportsRouter.get(
  '/payment-methods',
  ah(async (req, res) => {
    const { from, to, branchId } = range(req);
    // Money per method comes from SalePayment (split-aware); order count is per sale.
    const grouped = await prisma.salePayment.groupBy({
      by: ['method'],
      where: { sale: { status: 'PAID', branchId, createdAt: { gte: from, lte: to } } },
      _sum: { amount: true },
      _count: { _all: true },
    });
    res.json(grouped.map((g) => ({ method: g.method, total: round2(num(g._sum.amount)), orders: g._count._all })));
  })
);

// --- Top selling products ---
reportsRouter.get(
  '/top-products',
  ah(async (req, res) => {
    const { from, to, branchId } = range(req);
    const limit = Number(req.query.limit || 20);
    const items = await prisma.saleItem.findMany({
      where: { sale: { status: 'PAID', branchId, createdAt: { gte: from, lte: to } } },
      select: { productId: true, nameSnapshot: true, qty: true, lineTotal: true, unitCost: true },
    });
    const map = new Map<number, { productId: number; name: string; qty: number; revenue: number; profit: number }>();
    for (const i of items) {
      const row = map.get(i.productId) || { productId: i.productId, name: i.nameSnapshot, qty: 0, revenue: 0, profit: 0 };
      row.qty += i.qty;
      row.revenue += num(i.lineTotal);
      row.profit += num(i.lineTotal) - num(i.unitCost) * i.qty;
      map.set(i.productId, row);
    }
    const rows = [...map.values()]
      .map((r) => ({ ...r, revenue: round2(r.revenue), profit: round2(r.profit) }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, limit);
    res.json(rows);
  })
);

// --- Low stock / reorder report ---
reportsRouter.get(
  '/low-stock',
  ah(async (req, res) => {
    const branchId = req.query.branchId ? Number(req.query.branchId) : undefined;
    const products = await prisma.product.findMany({
      where: { isActive: true },
      include: { category: { select: { name: true } }, ...(branchId ? { branchStock: { where: { branchId }, select: { qty: true } } } : {}) },
      orderBy: { stockQty: 'asc' },
    });
    const onHand = (p: any) => (branchId ? (p.branchStock?.[0]?.qty ?? 0) : p.stockQty);
    res.json(
      products
        .filter((p) => onHand(p) <= p.reorderLevel)
        .map((p) => ({
          id: p.id,
          sku: p.sku,
          name: p.name,
          category: p.category?.name ?? '',
          stockQty: onHand(p),
          reorderLevel: p.reorderLevel,
          unit: p.unit,
        }))
    );
  })
);

// --- Inventory valuation (qty * cost) ---
reportsRouter.get(
  '/inventory-valuation',
  ah(async (req, res) => {
    const branchId = req.query.branchId ? Number(req.query.branchId) : undefined;
    const products = await prisma.product.findMany({
      where: { isActive: true },
      include: { category: { select: { name: true } }, ...(branchId ? { branchStock: { where: { branchId }, select: { qty: true } } } : {}) },
      orderBy: { name: 'asc' },
    });
    const onHand = (p: any) => (branchId ? (p.branchStock?.[0]?.qty ?? 0) : p.stockQty);
    let totalCost = 0;
    let totalRetail = 0;
    const rows = products.map((p) => {
      const qty = onHand(p);
      const costValue = round2(num(p.cost) * qty);
      const retailValue = round2(num(p.retailPrice) * qty);
      totalCost += costValue;
      totalRetail += retailValue;
      return {
        sku: p.sku,
        name: p.name,
        category: p.category?.name ?? '',
        stockQty: qty,
        cost: num(p.cost),
        costValue,
        retailValue,
      };
    });
    res.json({
      totalCost: round2(totalCost),
      totalRetail: round2(totalRetail),
      potentialProfit: round2(totalRetail - totalCost),
      rows,
    });
  })
);

// --- Daily Z-report (per cashier, per day) ---
reportsRouter.get(
  '/z-report',
  ah(async (req, res) => {
    const day = req.query.date ? new Date(String(req.query.date)) : new Date();
    const start = new Date(day);
    start.setHours(0, 0, 0, 0);
    const end = new Date(day);
    end.setHours(23, 59, 59, 999);
    const branchId = req.query.branchId ? Number(req.query.branchId) : undefined;

    const sales = await prisma.sale.findMany({
      where: { branchId, createdAt: { gte: start, lte: end } },
      include: { cashier: { select: { name: true } }, payments: { select: { method: true, amount: true } } },
    });

    const byCashier = new Map<string, { cashier: string; orders: number; cash: number; transfer: number; total: number; voids: number }>();
    let cash = 0;
    let transfer = 0;
    let voids = 0;
    for (const s of sales) {
      const name = s.cashier.name;
      const row = byCashier.get(name) || { cashier: name, orders: 0, cash: 0, transfer: 0, total: 0, voids: 0 };
      if (s.status === 'VOID') {
        row.voids += 1;
        voids += 1;
      } else {
        row.orders += 1;
        row.total += num(s.total);
        // Split-aware: cash vs non-cash from the sale's tenders.
        for (const p of s.payments) {
          const amt = num(p.amount);
          if (p.method === 'CASH') { row.cash += amt; cash += amt; }
          else { row.transfer += amt; transfer += amt; }
        }
      }
      byCashier.set(name, row);
    }

    res.json({
      date: start.toISOString().slice(0, 10),
      totalCash: round2(cash),
      totalTransfer: round2(transfer),
      grandTotal: round2(cash + transfer),
      voids,
      byCashier: [...byCashier.values()].map((r) => ({
        ...r,
        cash: round2(r.cash),
        transfer: round2(r.transfer),
        total: round2(r.total),
      })),
    });
  })
);

// --- Profit by category ---
reportsRouter.get(
  '/profit-by-category',
  ah(async (req, res) => {
    const { from, to, branchId } = range(req);
    const items = await prisma.saleItem.findMany({
      where: { sale: { status: 'PAID', branchId, createdAt: { gte: from, lte: to } } },
      select: { qty: true, lineTotal: true, unitCost: true, product: { select: { category: { select: { name: true } } } } },
    });
    const map = new Map<string, { category: string; qty: number; revenue: number; cost: number }>();
    for (const i of items) {
      const cat = i.product?.category?.name ?? 'Uncategorized';
      const row = map.get(cat) || { category: cat, qty: 0, revenue: 0, cost: 0 };
      row.qty += i.qty;
      row.revenue += num(i.lineTotal);
      row.cost += num(i.unitCost) * i.qty;
      map.set(cat, row);
    }
    res.json(
      [...map.values()]
        .map((r) => ({
          category: r.category,
          qty: r.qty,
          revenue: round2(r.revenue),
          cost: round2(r.cost),
          profit: round2(r.revenue - r.cost),
          marginPct: r.revenue ? round2(((r.revenue - r.cost) / r.revenue) * 100) : 0,
        }))
        .sort((a, b) => b.profit - a.profit)
    );
  })
);

// --- Profit & Loss: revenue − COGS − operating expenses = net profit ---
reportsRouter.get(
  '/profit-loss',
  ah(async (req, res) => {
    const { from, to, branchId } = range(req);
    const sales = await prisma.sale.findMany({
      where: { status: 'PAID', branchId, createdAt: { gte: from, lte: to } },
      select: { total: true, taxAmount: true, items: { select: { unitCost: true, qty: true } } },
    });
    let revenue = 0, tax = 0, cogs = 0;
    for (const s of sales) {
      revenue += num(s.total);
      tax += num(s.taxAmount);
      cogs += s.items.reduce((a, i) => a + num(i.unitCost) * i.qty, 0);
    }
    const netRevenue = revenue - tax; // ex-VAT sales
    const grossProfit = netRevenue - cogs;

    const exp = await prisma.expense.groupBy({
      by: ['category'],
      where: { date: { gte: from, lte: to }, branchId },
      _sum: { amount: true },
    });
    const expenses = exp
      .map((e) => ({ category: e.category, amount: round2(num(e._sum.amount)) }))
      .sort((a, b) => b.amount - a.amount);
    const totalExpenses = round2(expenses.reduce((a, e) => a + e.amount, 0));

    res.json({
      orders: sales.length,
      revenue: round2(revenue),
      vat: round2(tax),
      netRevenue: round2(netRevenue),
      cogs: round2(cogs),
      grossProfit: round2(grossProfit),
      grossMarginPct: netRevenue ? round2((grossProfit / netRevenue) * 100) : 0,
      expenses,
      totalExpenses,
      netProfit: round2(grossProfit - totalExpenses),
      netMarginPct: netRevenue ? round2(((grossProfit - totalExpenses) / netRevenue) * 100) : 0,
    });
  })
);

// --- Cash flow: where the cash drawer money came from / went over a period ---
reportsRouter.get(
  '/cash-flow',
  ah(async (req, res) => {
    const { from, to, branchId } = range(req);
    const dateRange = { gte: from, lte: to };
    const [cashSalesAgg, cm, expAgg, refAgg] = await Promise.all([
      prisma.salePayment.aggregate({ _sum: { amount: true }, where: { method: 'CASH', sale: { status: 'PAID', branchId, createdAt: dateRange } } }),
      prisma.cashMovement.groupBy({ by: ['type'], _sum: { amount: true }, where: { createdAt: dateRange, shift: { branchId } } }),
      prisma.expense.aggregate({ _sum: { amount: true }, where: { paymentMethod: 'CASH', date: dateRange, branchId } }),
      prisma.return.aggregate({ _sum: { total: true }, where: { refundMethod: 'CASH', createdAt: dateRange, sale: { branchId } } }),
    ]);
    const cashSales = round2(num(cashSalesAgg._sum.amount));
    const payIn = round2(num(cm.find((x) => x.type === 'PAY_IN')?._sum.amount));
    const payOut = round2(num(cm.find((x) => x.type === 'PAY_OUT')?._sum.amount));
    const cashExpenses = round2(num(expAgg._sum.amount));
    const cashRefunds = round2(num(refAgg._sum.total));
    const inflow = round2(cashSales + payIn);
    const outflow = round2(payOut + cashExpenses + cashRefunds);
    res.json({ cashSales, payIn, payOut, cashExpenses, cashRefunds, inflow, outflow, net: round2(inflow - outflow) });
  })
);

// --- Sales by hour of day ---
reportsRouter.get(
  '/sales-by-hour',
  ah(async (req, res) => {
    const { from, to, branchId } = range(req);
    const sales = await prisma.sale.findMany({
      where: { status: 'PAID', branchId, createdAt: { gte: from, lte: to } },
      select: { total: true, createdAt: true },
    });
    const hours = Array.from({ length: 24 }, (_, h) => ({ hour: h, label: `${String(h).padStart(2, '0')}:00`, revenue: 0, orders: 0 }));
    for (const s of sales) {
      const h = s.createdAt.getHours();
      hours[h].revenue += num(s.total);
      hours[h].orders += 1;
    }
    res.json(hours.map((h) => ({ ...h, revenue: round2(h.revenue) })));
  })
);

// --- VAT / tax summary ---
reportsRouter.get(
  '/tax-summary',
  ah(async (req, res) => {
    const { from, to, branchId } = range(req);
    const setting = await prisma.setting.findUniqueOrThrow({ where: { id: 1 } });
    const sales = await prisma.sale.findMany({
      where: { status: 'PAID', branchId, createdAt: { gte: from, lte: to } },
      select: { total: true, taxAmount: true, createdAt: true },
    });
    let gross = 0;
    let vat = 0;
    const byDay = new Map<string, { date: string; sales: number; vat: number }>();
    for (const s of sales) {
      gross += num(s.total);
      vat += num(s.taxAmount);
      const d = s.createdAt.toISOString().slice(0, 10);
      const row = byDay.get(d) || { date: d, sales: 0, vat: 0 };
      row.sales += num(s.total);
      row.vat += num(s.taxAmount);
      byDay.set(d, row);
    }
    res.json({
      taxInclusive: setting.taxInclusive,
      ratePct: num(setting.taxRatePct),
      grossSales: round2(gross),
      vat: round2(vat),
      netSales: round2(gross - vat),
      orders: sales.length,
      byDay: [...byDay.values()]
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((r) => ({ date: r.date, sales: round2(r.sales), vat: round2(r.vat) })),
    });
  })
);

// --- Unified dashboard aggregate (powers the back-office dashboard) ---
reportsRouter.get(
  '/dashboard',
  ah(async (req, res) => {
    const { from, to } = range(req);
    const branchId = req.query.branchId ? Number(req.query.branchId) : undefined;
    const spanMs = to.getTime() - from.getTime();
    const prevFrom = new Date(from.getTime() - spanMs);
    const prevTo = new Date(from.getTime());
    const delta = (cur: number, prev: number) => (prev ? round2(((cur - prev) / prev) * 100) : null);
    const dayKey = (d: Date) => d.toISOString().slice(0, 10);

    const [setting, curSales, prevSales, newCust, prevCust, products] = await Promise.all([
      prisma.setting.findUniqueOrThrow({ where: { id: 1 } }),
      prisma.sale.findMany({
        where: { status: 'PAID', branchId, createdAt: { gte: from, lte: to } },
        include: { items: { select: { productId: true, qty: true, lineTotal: true, unitCost: true, nameSnapshot: true, product: { select: { category: { select: { name: true } } } } } } },
      }),
      prisma.sale.findMany({ where: { status: 'PAID', branchId, createdAt: { gte: prevFrom, lt: prevTo } }, include: { items: { select: { unitCost: true, qty: true } } } }),
      prisma.member.count({ where: { createdAt: { gte: from, lte: to } } }),
      prisma.member.count({ where: { createdAt: { gte: prevFrom, lt: prevTo } } }),
      prisma.product.findMany({ where: { isActive: true }, select: { stockQty: true, reorderLevel: true, cost: true, ...(branchId ? { branchStock: { where: { branchId }, select: { qty: true } } } : {}) } as any }),
    ]);
    // Effective on-hand for inventory metrics (branch view uses BranchStock).
    const onHand = (p: any) => (branchId ? (p.branchStock?.[0]?.qty ?? 0) : p.stockQty);

    const sumSales = (rows: typeof curSales) => {
      let rev = 0, tax = 0, cogs = 0;
      for (const s of rows) { rev += num(s.total); tax += num(s.taxAmount); cogs += s.items.reduce((a, i) => a + num(i.unitCost) * i.qty, 0); }
      return { rev: round2(rev), tax: round2(tax), cogs: round2(cogs), profit: round2(rev - tax - cogs), orders: rows.length };
    };
    const cur = sumSales(curSales);
    const prev = sumSales(prevSales as typeof curSales);

    // daily series (revenue / profit / orders)
    const byDay = new Map<string, { date: string; sales: number; profit: number; orders: number }>();
    for (const s of curSales) {
      const k = dayKey(s.createdAt);
      const row = byDay.get(k) || { date: k, sales: 0, profit: 0, orders: 0 };
      const cogs = s.items.reduce((a, i) => a + num(i.unitCost) * i.qty, 0);
      row.sales += num(s.total); row.profit += num(s.total) - num(s.taxAmount) - cogs; row.orders += 1;
      byDay.set(k, row);
    }
    const prevByDay = new Map<string, number>();
    for (const s of prevSales) { const k = dayKey(s.createdAt); prevByDay.set(k, (prevByDay.get(k) || 0) + num(s.total)); }
    const days = [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date)).map((d) => ({ ...d, sales: round2(d.sales), profit: round2(d.profit) }));

    // by channel (sale type)
    const chan = new Map<string, number>();
    for (const s of curSales) chan.set(s.type, (chan.get(s.type) || 0) + num(s.total));
    const channelLabels: Record<string, string> = { RETAIL: 'หน้าร้าน (POS)', WHOLESALE: 'ขายส่ง' };
    const byChannel = [...chan.entries()].map(([k, v]) => ({ name: channelLabels[k] ?? k, value: round2(v), pct: cur.rev ? round2((v / cur.rev) * 100) : 0 }));

    // top products + categories
    const prodMap = new Map<number, { name: string; category: string; qty: number; revenue: number }>();
    const catMap = new Map<string, number>();
    for (const s of curSales) for (const i of s.items) {
      const catName = i.product?.category?.name ?? 'อื่นๆ';
      const p = prodMap.get(i.productId) || { name: i.nameSnapshot, category: catName, qty: 0, revenue: 0 };
      p.qty += i.qty; p.revenue += num(i.lineTotal); prodMap.set(i.productId, p);
      catMap.set(catName, (catMap.get(catName) || 0) + num(i.lineTotal));
    }
    const topProducts = [...prodMap.values()].sort((a, b) => b.qty - a.qty).slice(0, 10).map((p, i) => ({ rank: i + 1, ...p, revenue: round2(p.revenue) }));
    const topCategories = [...catMap.entries()].map(([name, v]) => ({ name, revenue: round2(v) })).sort((a, b) => b.revenue - a.revenue).slice(0, 5).map((c, i) => ({ rank: i + 1, ...c }));

    // inventory metrics
    const lowStock = products.filter((p) => onHand(p) <= p.reorderLevel).length;
    const outOfStock = products.filter((p) => onHand(p) <= 0).length;
    const inventoryValue = round2(products.reduce((a, p) => a + num(p.cost) * onHand(p), 0));
    const [openCounts, creditSales] = await Promise.all([
      prisma.stockCount.count({ where: { status: 'OPEN' } }),
      prisma.sale.count({ where: { status: 'PAID', branchId, paymentMethod: 'CREDIT', createdAt: { gte: from, lte: to } } }),
    ]);

    const notifications = [
      { tone: 'amber', icon: '📦', title: `สินค้าใกล้หมดสต็อก ${lowStock} รายการ`, detail: 'ตรวจสอบสินค้าที่ใกล้หมดสต็อก' },
      { tone: 'rose', icon: '⛔', title: `สินค้าหมดสต็อก ${outOfStock} รายการ`, detail: 'ควรเติมสต็อกโดยด่วน' },
      { tone: 'blue', icon: '🧾', title: `ใบนับสต็อกค้างอยู่ ${openCounts} รายการ`, detail: 'รอการตรวจนับและโพสต์' },
      { tone: 'violet', icon: '💳', title: `ขายเงินเชื่อ ${creditSales} รายการ`, detail: 'ในช่วงเวลาที่เลือก' },
    ];

    res.json({
      range: { from, to },
      kpis: {
        sales: { value: cur.rev, deltaPct: delta(cur.rev, prev.rev), series: days.map((d) => ({ x: d.date, y: d.sales })) },
        grossProfit: { value: cur.profit, deltaPct: delta(cur.profit, prev.profit), series: days.map((d) => ({ x: d.date, y: d.profit })) },
        orders: { value: cur.orders, deltaPct: delta(cur.orders, prev.orders), series: days.map((d) => ({ x: d.date, y: d.orders })) },
        newCustomers: { value: newCust, deltaPct: delta(newCust, prevCust), series: [] },
        lowStock: { value: lowStock, deltaPct: null, series: [] },
        inventoryValue: { value: inventoryValue, deltaPct: null, series: [] },
      },
      salesByDay: days.map((d) => ({ date: d.date, sales: d.sales, prev: round2(prevByDay.get(dayKey(new Date(new Date(d.date).getTime() - spanMs))) || 0) })),
      byChannel,
      notifications,
      topProducts,
      topCategories,
      finance: { revenue: cur.rev, cogs: cur.cogs, grossProfit: cur.profit, marginPct: cur.rev ? round2((cur.profit / (cur.rev - cur.tax || 1)) * 100) : 0 },
      taxInclusive: setting.taxInclusive,
    });
  })
);

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
