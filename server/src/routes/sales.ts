import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { ah, requireAuth, requireRole } from '../middleware/auth.js';
import { nextSeq, postMovement } from '../lib/stock.js';
import { postPoints } from '../lib/loyalty.js';
import { postGift } from '../lib/giftcard.js';
import { consumeSerials, releaseSerials } from '../lib/serial.js';
import { computeTenderPlan } from '../lib/tender.js';
import { computeRedeem, computeEarn } from '../lib/loyaltyCalc.js';
import { computeSaleLines } from '../lib/salePricing.js';
import { buildPromptPayPayload, type PromptPayType } from '../lib/promptpay.js';
import { evaluatePromotions, type PromoCartLine } from '../lib/promotions.js';

export const salesRouter = Router();
salesRouter.use(requireAuth);

const checkoutSchema = z.object({
  type: z.enum(['RETAIL', 'WHOLESALE']).default('RETAIL'),
  paymentMethod: z.enum(['CASH', 'TRANSFER', 'CARD', 'CREDIT', 'GIFT']),
  discount: z.number().nonnegative().default(0), // manual bill discount
  couponCode: z.string().optional(),
  cashReceived: z.number().nonnegative().default(0),
  paymentRef: z.string().default(''),
  memberId: z.number().int().nullable().optional(),
  pointsRedeem: z.number().int().nonnegative().default(0), // loyalty points to spend on this bill
  branchId: z.number().int().nullable().optional(),
  // Optional split / multi-tender payments. When omitted, the single paymentMethod
  // (+ cashReceived) is used as today.
  payments: z
    .array(z.object({ method: z.enum(['CASH', 'TRANSFER', 'CARD', 'CREDIT', 'GIFT']), amount: z.number().positive(), reference: z.string().default('') }))
    .optional(),
  items: z
    .array(z.object({ productId: z.number().int(), qty: z.number().int().positive(), serials: z.array(z.string()).optional() }))
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

      const { subtotal, taxAmount, lineData } = computeSaleLines({
        items: data.items, products, memberWholesale, type: data.type, defaultRate: defaultTax, taxInclusive,
      });

      // Evaluate promotions server-side (authoritative) and combine with the
      // cashier's manual discount.
      const catById = new Map(products.map((p) => [p.id, p.categoryId]));
      const promoLines: PromoCartLine[] = lineData.map((l) => ({
        productId: l.productId,
        categoryId: catById.get(l.productId) ?? null,
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

      // Loyalty redemption: spend points as a discount (capped by balance and the
      // remaining bill room after promo + manual discounts).
      let pointsRedeemed = 0;
      let redeemValue = 0;
      if (memberId && setting.loyaltyEnabled && data.pointsRedeem > 0) {
        const m = await tx.member.findUniqueOrThrow({ where: { id: memberId }, select: { points: true } });
        ({ pointsRedeemed, redeemValue } = computeRedeem({
          requested: data.pointsRedeem, memberPoints: m.points,
          redeemRate: Number(setting.pointsRedeemValue) || 0, subtotal, promoDiscount, manualDiscount,
        }));
      }

      const discount = round2(Math.min(subtotal, manualDiscount + promoDiscount + redeemValue));

      const total = round2(taxInclusive ? subtotal - discount : subtotal + taxAmount - discount);

      // Points earned on the net total (only when loyalty is on and a member is attached).
      const pointsEarned = memberId && setting.loyaltyEnabled ? computeEarn(total, Number(setting.pointsEarnBaht) || 0) : 0;

      // ---- Tender plan: single payment, or split / multi-tender ----
      const { paymentRows, cashTendered, changeDue, dominant, isSplit } = computeTenderPlan({
        total,
        payments: data.payments,
        paymentMethod: data.paymentMethod,
        cashReceived: data.cashReceived,
        paymentRef: data.paymentRef,
      });

      // PromptPay QR payload for a single transfer payment (uses the branch's PromptPay if set).
      let qrPayload = '';
      if (!isSplit && dominant === 'TRANSFER') {
        let ppId = setting.promptPayId;
        let ppType = setting.promptPayType as PromptPayType;
        if (branchId) {
          const bb = await tx.branch.findUnique({ where: { id: branchId }, select: { promptPayId: true, promptPayType: true } });
          if (bb?.promptPayId) { ppId = bb.promptPayId; ppType = (bb.promptPayType || ppType) as PromptPayType; }
        }
        if (!ppId) {
          throw Object.assign(new Error('PromptPay ID not configured in Settings'), { status: 400 });
        }
        qrPayload = buildPromptPayPayload({ id: ppId, type: ppType, amount: total });
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
          pointsEarned,
          pointsRedeemed,
          taxAmount,
          total,
          paymentMethod: dominant,
          cashReceived: cashTendered,
          changeDue,
          paymentRef: isSplit ? 'แยกชำระ' : data.paymentRef,
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
          branchId,
        });
      }

      // Serial-tracked lines: mark the scanned units SOLD against this sale.
      // Validated against IN_STOCK serials — a bad/duplicate serial rolls the sale back.
      const soldAt = created.createdAt;
      for (const item of data.items) {
        if (item.serials?.length) {
          await consumeSerials(tx, { productId: item.productId, saleId: created.id, serials: item.serials, soldAt });
        }
      }

      // Gift-card tenders: validate the card and deduct its balance (the GIFT row's
      // reference carries the card code). Throws → whole checkout rolls back.
      for (const row of paymentRows) {
        if (row.method !== 'GIFT') continue;
        const code = (row.reference || '').trim().toUpperCase();
        const card = code ? await tx.giftCard.findUnique({ where: { code } }) : null;
        if (!card || !card.isActive) throw Object.assign(new Error('บัตรของขวัญไม่ถูกต้องหรือถูกระงับ'), { status: 400 });
        if (card.expiresAt && card.expiresAt < new Date()) throw Object.assign(new Error('บัตรของขวัญหมดอายุแล้ว'), { status: 400 });
        await postGift(tx, { giftCardId: card.id, type: 'REDEEM', amount: -row.amount, saleId: created.id, note: orderNo, userId: cashierId });
      }

      // Record the tender(s) — the per-method source of truth.
      const payments = await Promise.all(
        paymentRows.map((p) => tx.salePayment.create({ data: { saleId: created.id, method: p.method, amount: p.amount, reference: p.reference } }))
      );

      // Loyalty: spend redeemed points first, then credit earned points.
      if (memberId) {
        if (pointsRedeemed > 0) {
          await postPoints(tx, { memberId, saleId: created.id, type: 'REDEEM', points: -pointsRedeemed, note: orderNo, userId: cashierId });
        }
        if (pointsEarned > 0) {
          await postPoints(tx, { memberId, saleId: created.id, type: 'EARN', points: pointsEarned, note: orderNo, userId: cashierId });
        }
      }

      return { ...created, payments };
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
      include: { items: true, cashier: { select: { name: true } }, payments: true },
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
      const sale = await tx.sale.findUniqueOrThrow({ where: { id }, include: { items: true, payments: true } });
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
          branchId: sale.branchId,
        });
      }

      // Return any serial-tracked units sold on this bill back to IN_STOCK.
      await releaseSerials(tx, sale.id);

      // Reverse loyalty points: refund redeemed points, claw back earned points
      // (clamped so the balance can't go negative if the member already spent them).
      if (sale.memberId) {
        if (sale.pointsRedeemed > 0) {
          await postPoints(tx, { memberId: sale.memberId, saleId: sale.id, type: 'ADJUST', points: sale.pointsRedeemed, note: `คืนแต้มจากการยกเลิก ${sale.orderNo}`, userId });
        }
        if (sale.pointsEarned > 0) {
          const m = await tx.member.findUniqueOrThrow({ where: { id: sale.memberId }, select: { points: true } });
          const clawback = Math.min(sale.pointsEarned, m.points);
          if (clawback > 0) {
            await postPoints(tx, { memberId: sale.memberId, saleId: sale.id, type: 'ADJUST', points: -clawback, note: `ยกเลิกแต้มจากบิล ${sale.orderNo}`, userId });
          }
        }
      }

      // Refund any gift-card tenders back onto their cards.
      for (const p of sale.payments) {
        if (p.method !== 'GIFT') continue;
        const code = (p.reference || '').trim().toUpperCase();
        const card = code ? await tx.giftCard.findUnique({ where: { code } }) : null;
        if (card) await postGift(tx, { giftCardId: card.id, type: 'REFUND', amount: Number(p.amount), saleId: sale.id, note: `คืนเงินจากการยกเลิก ${sale.orderNo}`, userId });
      }

      return tx.sale.update({
        where: { id },
        data: { status: 'VOID', voidedById: userId, voidedAt: new Date() },
      });
    });
    res.json(result);
  })
);
