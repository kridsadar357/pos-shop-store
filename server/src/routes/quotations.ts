import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { ah, requireAuth, requireRole } from '../middleware/auth.js';
import { nextSeq, postMovement } from '../lib/stock.js';
import { buildBill } from '../lib/billing.js';

export const quotationsRouter = Router();
quotationsRouter.use(requireAuth);

const num = (d: unknown) => Number(d ?? 0);
const round2 = (n: number) => Math.round(n * 100) / 100;

const itemSchema = z.object({ productId: z.number().int(), qty: z.number().int().positive(), unitPrice: z.number().nonnegative().optional() });
const schema = z.object({
  customerName: z.string().default(''),
  memberId: z.number().int().nullable().optional(),
  type: z.enum(['RETAIL', 'WHOLESALE']).default('RETAIL'),
  validUntil: z.string().datetime().nullable().optional(),
  note: z.string().default(''),
  discount: z.number().nonnegative().default(0),
  branchId: z.number().int().nullable().optional(),
  items: z.array(itemSchema).min(1),
});

/** Compute quotation totals from items using the tax setting. */
async function computeTotals(data: z.infer<typeof schema>) {
  const setting = await prisma.setting.findUniqueOrThrow({ where: { id: 1 } });
  const products = await prisma.product.findMany({ where: { id: { in: data.items.map((i) => i.productId) } } });
  return buildBill({ items: data.items, products, type: data.type, discount: data.discount, defaultRate: num(setting.taxRatePct), taxInclusive: setting.taxInclusive });
}

quotationsRouter.get(
  '/',
  ah(async (req, res) => {
    const status = req.query.status ? String(req.query.status) : undefined;
    const q = String(req.query.q || '').trim();
    const quotations = await prisma.quotation.findMany({
      where: {
        status,
        ...(q ? { OR: [{ refNo: { contains: q, mode: 'insensitive' } }, { customerName: { contains: q, mode: 'insensitive' } }] } : {}),
      },
      orderBy: { id: 'desc' },
      take: 300,
    });
    res.json(quotations);
  })
);

quotationsRouter.get(
  '/:id',
  ah(async (req, res) => {
    const quotation = await prisma.quotation.findUnique({ where: { id: Number(req.params.id) }, include: { items: true } });
    if (!quotation) return res.status(404).json({ error: 'Not found' });
    res.json(quotation);
  })
);

quotationsRouter.post(
  '/',
  requireRole('ADMIN', 'MANAGER'),
  ah(async (req, res) => {
    const data = schema.parse(req.body);
    const { subtotal, discount, taxAmount, total, lines } = await computeTotals(data);
    const branchId = data.branchId ?? (await prisma.branch.findFirst({ where: { isDefault: true } }))?.id ?? null;
    const quotation = await prisma.$transaction(async (tx) => {
      const seq = await nextSeq(tx, 'quotation');
      return tx.quotation.create({
        data: {
          refNo: `QT-${String(seq).padStart(6, '0')}`,
          customerName: data.customerName,
          memberId: data.memberId ?? null,
          type: data.type,
          validUntil: data.validUntil ? new Date(data.validUntil) : null,
          note: data.note,
          subtotal, discount, taxAmount, total,
          userId: req.user!.id,
          branchId,
          items: { create: lines.map((l) => ({ productId: l.productId, nameSnapshot: l.nameSnapshot, qty: l.qty, unitPrice: l.unitPrice, lineTotal: l.lineTotal })) },
        },
        include: { items: true },
      });
    });
    res.status(201).json(quotation);
  })
);

quotationsRouter.put(
  '/:id',
  requireRole('ADMIN', 'MANAGER'),
  ah(async (req, res) => {
    const id = Number(req.params.id);
    const existing = await prisma.quotation.findUniqueOrThrow({ where: { id } });
    if (existing.status === 'CONVERTED') return res.status(400).json({ error: 'ใบเสนอราคาที่แปลงเป็นการขายแล้ว แก้ไขไม่ได้' });
    const data = schema.parse(req.body);
    const { subtotal, discount, taxAmount, total, lines } = await computeTotals(data);
    const quotation = await prisma.$transaction(async (tx) => {
      await tx.quotationItem.deleteMany({ where: { quotationId: id } });
      return tx.quotation.update({
        where: { id },
        data: {
          customerName: data.customerName, memberId: data.memberId ?? null, type: data.type,
          validUntil: data.validUntil ? new Date(data.validUntil) : null, note: data.note,
          subtotal, discount, taxAmount, total,
          items: { create: lines.map((l) => ({ productId: l.productId, nameSnapshot: l.nameSnapshot, qty: l.qty, unitPrice: l.unitPrice, lineTotal: l.lineTotal })) },
        },
        include: { items: true },
      });
    });
    res.json(quotation);
  })
);

quotationsRouter.post(
  '/:id/status',
  requireRole('ADMIN', 'MANAGER'),
  ah(async (req, res) => {
    const { status } = z.object({ status: z.enum(['DRAFT', 'SENT', 'ACCEPTED', 'EXPIRED', 'CANCELLED']) }).parse(req.body);
    const quotation = await prisma.quotation.update({ where: { id: Number(req.params.id) }, data: { status } });
    res.json(quotation);
  })
);

quotationsRouter.delete(
  '/:id',
  requireRole('ADMIN', 'MANAGER'),
  ah(async (req, res) => {
    await prisma.quotation.delete({ where: { id: Number(req.params.id) } });
    res.json({ ok: true });
  })
);

// Convert a quotation into a completed sale using the quoted line prices.
quotationsRouter.post(
  '/:id/convert',
  requireRole('ADMIN', 'MANAGER'),
  ah(async (req, res) => {
    const { paymentMethod } = z.object({ paymentMethod: z.enum(['CASH', 'TRANSFER', 'CARD', 'CREDIT']).default('CREDIT') }).parse(req.body);
    const id = Number(req.params.id);
    const userId = req.user!.id;
    const sale = await prisma.$transaction(async (tx) => {
      const quote = await tx.quotation.findUniqueOrThrow({ where: { id }, include: { items: true } });
      if (quote.status === 'CONVERTED') throw Object.assign(new Error('ใบเสนอราคานี้ถูกแปลงเป็นการขายแล้ว'), { status: 400 });
      const branchId = quote.branchId ?? (await tx.branch.findFirst({ where: { isDefault: true } }))?.id ?? null;
      const costs = new Map((await tx.product.findMany({ where: { id: { in: quote.items.map((i) => i.productId) } } })).map((p) => [p.id, num(p.cost)]));

      const seq = await nextSeq(tx, 'sale');
      const orderNo = `S-${String(seq).padStart(6, '0')}`;
      const created = await tx.sale.create({
        data: {
          orderNo, type: quote.type, status: 'PAID',
          subtotal: quote.subtotal, discount: quote.discount, taxAmount: quote.taxAmount, total: quote.total,
          paymentMethod, cashReceived: 0, changeDue: 0, paymentRef: `จากใบเสนอราคา ${quote.refNo}`,
          cashierId: userId, memberId: quote.memberId, branchId,
          items: { create: quote.items.map((i) => ({ productId: i.productId, nameSnapshot: i.nameSnapshot, qty: i.qty, unitPrice: i.unitPrice, unitCost: costs.get(i.productId) ?? 0, lineTotal: i.lineTotal })) },
        },
        include: { items: true },
      });
      await tx.salePayment.create({ data: { saleId: created.id, method: paymentMethod, amount: quote.total, reference: quote.refNo } });
      for (const i of quote.items) {
        await postMovement(tx, { productId: i.productId, type: 'SALE', qtyDelta: -i.qty, unitCost: costs.get(i.productId) ?? 0, refType: 'SALE', refId: created.id, note: orderNo, userId, branchId });
      }
      await tx.quotation.update({ where: { id }, data: { status: 'CONVERTED', convertedSaleId: created.id } });
      return created;
    });
    res.status(201).json(sale);
  })
);
