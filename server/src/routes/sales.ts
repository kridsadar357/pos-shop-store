import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { ah, requireAuth, requireRole } from '../middleware/auth.js';
import { nextSeq, postMovement } from '../lib/stock.js';
import { buildPromptPayPayload, type PromptPayType } from '../lib/promptpay.js';
import { evaluatePromotions, type PromoCartLine } from '../lib/promotions.js';

export const salesRouter = Router();
salesRouter.use(requireAuth);

const checkoutSchema = z.object({
  type: z.enum(['RETAIL', 'WHOLESALE']).default('RETAIL'),
  paymentMethod: z.enum(['CASH', 'TRANSFER', 'CARD', 'CREDIT']),
  discount: z.number().nonnegative().default(0), // manual bill discount
  couponCode: z.string().optional(),
  cashReceived: z.number().nonnegative().default(0),
  paymentRef: z.string().default(''),
  memberId: z.number().int().nullable().optional(),
  branchId: z.number().int().nullable().optional(),
  items: z
    .array(z.object({ productId: z.number().int(), qty: z.number().int().positive() }))
    .min(1),
});

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

salesRouter.post(
  '/',
  ah(async (req, res) => {
    const data = checkoutSchema.parse(req.body);
    const cashierId = req.user!.id;

    const setting = await prisma.setting.findUniqueOrThrow({ where: { id: 1 } });
    const defaultTax = Number(setting.taxRatePct);
    const taxInclusive = setting.taxInclusive;

    // A member gets wholesale pricing on every line (ignoring min qty) when the
    // admin setting allows it.
    let memberId: number | null = data.memberId ?? null;
    if (memberId) {
      const member = await prisma.member.findUnique({ where: { id: memberId } });
      if (!member || !member.isActive) memberId = null;
    }
    const memberWholesale = !!memberId && setting.memberGetsWholesale;

    const sale = await prisma.$transaction(async (tx) => {
      // Attach to the cashier's open shift, if any.
      const openShift = await tx.shift.findFirst({ where: { userId: cashierId, status: 'OPEN' } });

      // Attribute the sale to a branch (explicit → the shift's branch → default).
      let branchId = data.branchId ?? openShift?.branchId ?? null;
      if (!branchId) branchId = (await tx.branch.findFirst({ where: { isDefault: true } }))?.id ?? null;

      const ids = data.items.map((i) => i.productId);
      const products = await tx.product.findMany({ where: { id: { in: ids } } });
      const byId = new Map(products.map((p) => [p.id, p]));

      let subtotal = 0;
      let taxAmount = 0;
      const lineData = data.items.map((i) => {
        const p = byId.get(i.productId);
        if (!p) throw Object.assign(new Error(`Product ${i.productId} not found`), { status: 400 });

        // Member always gets wholesale; otherwise wholesale needs mode + min qty.
        const useWholesale = memberWholesale || (data.type === 'WHOLESALE' && i.qty >= p.wholesaleMinQty);
        const unitPrice = Number(useWholesale ? p.wholesalePrice : p.retailPrice);
        const lineTotal = round2(unitPrice * i.qty);
        subtotal += lineTotal;

        const rate = p.taxRatePct != null ? Number(p.taxRatePct) : defaultTax;
        const lineTax = taxInclusive
          ? lineTotal - lineTotal / (1 + rate / 100)
          : lineTotal * (rate / 100);
        taxAmount += lineTax;

        return {
          productId: p.id,
          nameSnapshot: p.name,
          qty: i.qty,
          unitPrice,
          unitCost: Number(p.cost),
          lineTotal,
        };
      });

      subtotal = round2(subtotal);
      taxAmount = round2(taxAmount);

      // Evaluate promotions server-side (authoritative) and combine with the
      // cashier's manual discount.
      const promoLines: PromoCartLine[] = lineData.map((l) => ({
        productId: l.productId,
        categoryId: byId.get(l.productId)?.categoryId ?? null,
        qty: l.qty,
        unitPrice: l.unitPrice,
        lineTotal: l.lineTotal,
      }));
      const promoResult = evaluatePromotions(promoLines, await tx.promotion.findMany({
        where: {
          isActive: true,
          AND: [
            { OR: [{ startsAt: null }, { startsAt: { lte: new Date() } }] },
            { OR: [{ endsAt: null }, { endsAt: { gte: new Date() } }] },
          ],
        },
      }), { couponCode: data.couponCode });
      const promoDiscount = promoResult.promoDiscount;
      const manualDiscount = round2(data.discount);
      const discount = round2(Math.min(subtotal, manualDiscount + promoDiscount));

      const total = round2(taxInclusive ? subtotal - discount : subtotal + taxAmount - discount);

      if (data.paymentMethod === 'CASH' && data.cashReceived < total) {
        throw Object.assign(new Error('Cash received is less than total'), { status: 400 });
      }
      const changeDue = data.paymentMethod === 'CASH' ? round2(data.cashReceived - total) : 0;

      // PromptPay QR payload for transfer payments.
      let qrPayload = '';
      if (data.paymentMethod === 'TRANSFER') {
        if (!setting.promptPayId) {
          throw Object.assign(new Error('PromptPay ID not configured in Settings'), { status: 400 });
        }
        qrPayload = buildPromptPayPayload({
          id: setting.promptPayId,
          type: setting.promptPayType as PromptPayType,
          amount: total,
        });
      }

      const seq = await nextSeq(tx, 'sale');
      const orderNo = `S-${String(seq).padStart(6, '0')}`;

      const created = await tx.sale.create({
        data: {
          orderNo,
          type: memberWholesale ? 'WHOLESALE' : data.type,
          status: 'PAID',
          subtotal,
          discount,
          promoDiscount,
          promoNames: promoResult.applied.map((a) => a.name).join(', '),
          taxAmount,
          total,
          paymentMethod: data.paymentMethod,
          cashReceived: data.paymentMethod === 'CASH' ? data.cashReceived : 0,
          changeDue,
          paymentRef: data.paymentRef,
          qrPayload,
          cashierId,
          memberId,
          shiftId: openShift?.id ?? null,
          branchId,
          items: { create: lineData },
        },
        include: { items: true, member: { select: { name: true, phone: true } } },
      });

      for (const line of lineData) {
        await postMovement(tx, {
          productId: line.productId,
          type: 'SALE',
          qtyDelta: -line.qty,
          unitCost: line.unitCost,
          refType: 'SALE',
          refId: created.id,
          note: orderNo,
          userId: cashierId,
        });
      }

      return created;
    });

    res.status(201).json(sale);
  })
);

salesRouter.get(
  '/',
  ah(async (req, res) => {
    const from = req.query.from ? new Date(String(req.query.from)) : undefined;
    const to = req.query.to ? new Date(String(req.query.to)) : undefined;
    const branchId = req.query.branchId ? Number(req.query.branchId) : undefined;
    const sales = await prisma.sale.findMany({
      where: { createdAt: { gte: from, lte: to }, branchId },
      include: { cashier: { select: { name: true } }, branch: { select: { name: true } }, items: true },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    res.json(sales);
  })
);

// Lightweight POS KPI stats (today + month) — available to any signed-in user.
salesRouter.get(
  '/stats',
  ah(async (_req, res) => {
    const now = new Date();
    const startToday = new Date(now);
    startToday.setHours(0, 0, 0, 0);
    const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const todaySales = await prisma.sale.findMany({
      where: { status: 'PAID', createdAt: { gte: startToday } },
      include: { items: { select: { unitCost: true, qty: true } } },
    });
    let revenue = 0;
    let tax = 0;
    let cost = 0;
    const members = new Set<number>();
    for (const s of todaySales) {
      revenue += Number(s.total);
      tax += Number(s.taxAmount);
      cost += s.items.reduce((a, i) => a + Number(i.unitCost) * i.qty, 0);
      if (s.memberId) members.add(s.memberId);
    }
    const grossProfit = revenue - tax - cost;

    const [monthAgg, prevAgg] = await Promise.all([
      prisma.sale.aggregate({ where: { status: 'PAID', createdAt: { gte: startMonth } }, _sum: { total: true } }),
      prisma.sale.aggregate({ where: { status: 'PAID', createdAt: { gte: startPrevMonth, lt: startMonth } }, _sum: { total: true } }),
    ]);
    const monthRevenue = Number(monthAgg._sum.total ?? 0);
    const prevRevenue = Number(prevAgg._sum.total ?? 0);

    res.json({
      today: {
        revenue: round2(revenue),
        orders: todaySales.length,
        grossProfit: round2(grossProfit),
        marginPct: revenue ? round2((grossProfit / (revenue - tax || 1)) * 100) : 0,
        avgOrder: todaySales.length ? round2(revenue / todaySales.length) : 0,
        customers: members.size,
      },
      month: {
        revenue: round2(monthRevenue),
        deltaPct: prevRevenue ? round2(((monthRevenue - prevRevenue) / prevRevenue) * 100) : null,
      },
    });
  })
);

salesRouter.get(
  '/:id',
  ah(async (req, res) => {
    const sale = await prisma.sale.findUnique({
      where: { id: Number(req.params.id) },
      include: { items: true, cashier: { select: { name: true } } },
    });
    if (!sale) return res.status(404).json({ error: 'Not found' });
    res.json(sale);
  })
);

// Void a sale — returns the stock via VOID movements.
salesRouter.post(
  '/:id/void',
  requireRole('ADMIN', 'MANAGER'),
  ah(async (req, res) => {
    const id = Number(req.params.id);
    const userId = req.user!.id;
    const result = await prisma.$transaction(async (tx) => {
      const sale = await tx.sale.findUniqueOrThrow({ where: { id }, include: { items: true } });
      if (sale.status === 'VOID') throw Object.assign(new Error('Already voided'), { status: 400 });

      for (const item of sale.items) {
        await postMovement(tx, {
          productId: item.productId,
          type: 'VOID',
          qtyDelta: item.qty, // return stock
          unitCost: Number(item.unitCost),
          refType: 'SALE',
          refId: sale.id,
          note: `Void ${sale.orderNo}`,
          userId,
        });
      }

      return tx.sale.update({
        where: { id },
        data: { status: 'VOID', voidedById: userId, voidedAt: new Date() },
      });
    });
    res.json(result);
  })
);
