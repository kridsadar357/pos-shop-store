import { Router } from 'express';
import { prisma } from '../prisma.js';
import { ah, requireAuth, requireRole } from '../middleware/auth.js';

export const reportsRouter = Router();
reportsRouter.use(requireAuth, requireRole('ADMIN', 'MANAGER'));

function range(req: { query: Record<string, unknown> }) {
  const from = req.query.from ? new Date(String(req.query.from)) : new Date(Date.now() - 30 * 864e5);
  const to = req.query.to ? new Date(String(req.query.to)) : new Date();
  return { from, to };
}

const num = (d: unknown) => Number(d ?? 0);

// --- Sales summary + daily series ---
reportsRouter.get(
  '/summary',
  ah(async (req, res) => {
    const { from, to } = range(req);
    const sales = await prisma.sale.findMany({
      where: { status: 'PAID', createdAt: { gte: from, lte: to } },
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
    const { from, to } = range(req);
    const grouped = await prisma.sale.groupBy({
      by: ['paymentMethod'],
      where: { status: 'PAID', createdAt: { gte: from, lte: to } },
      _sum: { total: true },
      _count: { _all: true },
    });
    res.json(grouped.map((g) => ({ method: g.paymentMethod, total: round2(num(g._sum.total)), orders: g._count._all })));
  })
);

// --- Top selling products ---
reportsRouter.get(
  '/top-products',
  ah(async (req, res) => {
    const { from, to } = range(req);
    const limit = Number(req.query.limit || 20);
    const items = await prisma.saleItem.findMany({
      where: { sale: { status: 'PAID', createdAt: { gte: from, lte: to } } },
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
  ah(async (_req, res) => {
    const products = await prisma.product.findMany({
      where: { isActive: true },
      include: { category: { select: { name: true } } },
      orderBy: { stockQty: 'asc' },
    });
    res.json(
      products
        .filter((p) => p.stockQty <= p.reorderLevel)
        .map((p) => ({
          id: p.id,
          sku: p.sku,
          name: p.name,
          category: p.category?.name ?? '',
          stockQty: p.stockQty,
          reorderLevel: p.reorderLevel,
          unit: p.unit,
        }))
    );
  })
);

// --- Inventory valuation (qty * cost) ---
reportsRouter.get(
  '/inventory-valuation',
  ah(async (_req, res) => {
    const products = await prisma.product.findMany({
      where: { isActive: true },
      include: { category: { select: { name: true } } },
      orderBy: { name: 'asc' },
    });
    let totalCost = 0;
    let totalRetail = 0;
    const rows = products.map((p) => {
      const costValue = round2(num(p.cost) * p.stockQty);
      const retailValue = round2(num(p.retailPrice) * p.stockQty);
      totalCost += costValue;
      totalRetail += retailValue;
      return {
        sku: p.sku,
        name: p.name,
        category: p.category?.name ?? '',
        stockQty: p.stockQty,
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

    const sales = await prisma.sale.findMany({
      where: { createdAt: { gte: start, lte: end } },
      include: { cashier: { select: { name: true } } },
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
        if (s.paymentMethod === 'CASH') {
          row.cash += num(s.total);
          cash += num(s.total);
        } else {
          row.transfer += num(s.total);
          transfer += num(s.total);
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
    const { from, to } = range(req);
    const items = await prisma.saleItem.findMany({
      where: { sale: { status: 'PAID', createdAt: { gte: from, lte: to } } },
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

// --- Sales by hour of day ---
reportsRouter.get(
  '/sales-by-hour',
  ah(async (req, res) => {
    const { from, to } = range(req);
    const sales = await prisma.sale.findMany({
      where: { status: 'PAID', createdAt: { gte: from, lte: to } },
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
    const { from, to } = range(req);
    const setting = await prisma.setting.findUniqueOrThrow({ where: { id: 1 } });
    const sales = await prisma.sale.findMany({
      where: { status: 'PAID', createdAt: { gte: from, lte: to } },
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

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
