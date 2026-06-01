import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { ah, requireAuth, requireRole } from '../middleware/auth.js';
import { nextSeq, postMovement } from '../lib/stock.js';

export const returnsRouter = Router();
returnsRouter.use(requireAuth);

const round2 = (n: number) => Math.round(n * 100) / 100;

// --- List returns ---
returnsRouter.get(
  '/',
  ah(async (req, res) => {
    const from = req.query.from ? new Date(String(req.query.from)) : undefined;
    const to = req.query.to ? new Date(String(req.query.to)) : undefined;
    const returns = await prisma.return.findMany({
      where: { createdAt: { gte: from, lte: to } },
      include: { sale: { select: { orderNo: true } }, items: { select: { qty: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    res.json(returns.map((r) => ({
      id: r.id, refNo: r.refNo, orderNo: r.sale.orderNo, total: r.total, refundMethod: r.refundMethod,
      reason: r.reason, createdAt: r.createdAt, itemCount: r.items.length, qty: r.items.reduce((s, i) => s + i.qty, 0),
    })));
  })
);

// --- Detail ---
returnsRouter.get(
  '/:id',
  ah(async (req, res) => {
    const r = await prisma.return.findUnique({
      where: { id: Number(req.params.id) },
      include: { sale: { select: { orderNo: true } }, items: true },
    });
    if (!r) return res.status(404).json({ error: 'ไม่พบรายการคืน' });
    res.json(r);
  })
);

// --- Returnable lines for a sale (sold minus already returned) ---
returnsRouter.get(
  '/returnable/:saleId',
  ah(async (req, res) => {
    const saleId = Number(req.params.saleId);
    const sale = await prisma.sale.findUnique({ where: { id: saleId }, include: { items: true, cashier: { select: { name: true } } } });
    if (!sale) return res.status(404).json({ error: 'ไม่พบบิล' });
    if (sale.status !== 'PAID') return res.status(400).json({ error: 'คืนได้เฉพาะบิลที่ชำระแล้ว (บิลที่ยกเลิกคืนไม่ได้)' });

    const prior = await prisma.returnItem.groupBy({ by: ['saleItemId'], where: { return: { saleId } }, _sum: { qty: true } });
    const returnedBy = new Map(prior.map((p) => [p.saleItemId, p._sum.qty ?? 0]));

    res.json({
      sale: { id: sale.id, orderNo: sale.orderNo, createdAt: sale.createdAt, total: sale.total, subtotal: sale.subtotal, cashier: sale.cashier },
      items: sale.items.map((it) => {
        const returned = returnedBy.get(it.id) ?? 0;
        return { saleItemId: it.id, productId: it.productId, name: it.nameSnapshot, sold: it.qty, returned, returnable: it.qty - returned, unitPrice: it.unitPrice };
      }),
    });
  })
);

// --- Create a return ---
const schema = z.object({
  saleId: z.number().int(),
  refundMethod: z.enum(['CASH', 'TRANSFER', 'CARD', 'CREDIT']).default('CASH'),
  reason: z.string().default(''),
  items: z.array(z.object({ saleItemId: z.number().int(), qty: z.number().int().positive() })).min(1),
});

returnsRouter.post(
  '/',
  requireRole('ADMIN', 'MANAGER'),
  ah(async (req, res) => {
    const data = schema.parse(req.body);
    const userId = req.user!.id;
    const setting = await prisma.setting.findUniqueOrThrow({ where: { id: 1 } });
    const rate = Number(setting.taxRatePct);

    const result = await prisma.$transaction(async (tx) => {
      const sale = await tx.sale.findUniqueOrThrow({ where: { id: data.saleId }, include: { items: true } });
      if (sale.status !== 'PAID') throw Object.assign(new Error('คืนได้เฉพาะบิลที่ชำระแล้ว'), { status: 400 });
      const byId = new Map(sale.items.map((i) => [i.id, i]));

      const prior = await tx.returnItem.groupBy({ by: ['saleItemId'], where: { return: { saleId: sale.id } }, _sum: { qty: true } });
      const returnedBy = new Map(prior.map((p) => [p.saleItemId, p._sum.qty ?? 0]));

      const lines = data.items.map((r) => {
        const it = byId.get(r.saleItemId);
        if (!it) throw Object.assign(new Error('รายการสินค้าไม่อยู่ในบิลนี้'), { status: 400 });
        const remaining = it.qty - (returnedBy.get(it.id) ?? 0);
        if (r.qty > remaining) throw Object.assign(new Error(`คืน "${it.nameSnapshot}" เกินจำนวนที่ซื้อ (เหลือคืนได้ ${remaining})`), { status: 400 });
        return { it, qty: r.qty, lineTotal: round2(Number(it.unitPrice) * r.qty) };
      });

      const gross = round2(lines.reduce((s, l) => s + l.lineTotal, 0));
      // Prorate any bill-level discount, then derive tax from the refund total.
      const ratio = Number(sale.subtotal) > 0 ? Number(sale.total) / Number(sale.subtotal) : 1;
      const refundTotal = round2(gross * ratio);
      const taxAmount = setting.taxInclusive ? round2(refundTotal - refundTotal / (1 + rate / 100)) : round2(gross * (rate / 100));

      const seq = await nextSeq(tx, 'return');
      const ret = await tx.return.create({
        data: {
          refNo: `RT-${String(seq).padStart(5, '0')}`,
          saleId: sale.id, subtotal: gross, taxAmount, total: refundTotal,
          refundMethod: data.refundMethod, reason: data.reason, userId,
          items: { create: lines.map((l) => ({ saleItemId: l.it.id, productId: l.it.productId, nameSnapshot: l.it.nameSnapshot, qty: l.qty, unitPrice: l.it.unitPrice, lineTotal: l.lineTotal })) },
        },
      });

      for (const l of lines) {
        await postMovement(tx, {
          productId: l.it.productId, type: 'RETURN', qtyDelta: l.qty, unitCost: Number(l.it.unitCost),
          refType: 'RETURN', refId: ret.id, note: `${ret.refNo} (${sale.orderNo})`, userId, branchId: sale.branchId,
        });
      }
      return ret;
    });

    res.status(201).json(result);
  })
);
