import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { ah, requireAuth, requireRole } from '../middleware/auth.js';
import { nextSeq, postMovement } from '../lib/stock.js';
import { buildBill } from '../lib/billing.js';

export const layawaysRouter = Router();
layawaysRouter.use(requireAuth);

const num = (d: unknown) => Number(d ?? 0);
const round2 = (n: number) => Math.round(n * 100) / 100;

const createSchema = z.object({
  customerName: z.string().default(''),
  memberId: z.number().int().nullable().optional(),
  type: z.enum(['RETAIL', 'WHOLESALE']).default('RETAIL'),
  discount: z.number().nonnegative().default(0),
  note: z.string().default(''),
  dueDate: z.string().datetime().nullable().optional(),
  branchId: z.number().int().nullable().optional(),
  deposit: z.number().nonnegative().default(0),
  depositMethod: z.enum(['CASH', 'TRANSFER', 'CARD', 'CREDIT']).default('CASH'),
  items: z.array(z.object({ productId: z.number().int(), qty: z.number().int().positive(), unitPrice: z.number().nonnegative().optional() })).min(1),
});

/** Compute totals from items + the tax setting (VAT-inclusive aware). */
async function computeTotals(data: z.infer<typeof createSchema>) {
  const setting = await prisma.setting.findUniqueOrThrow({ where: { id: 1 } });
  const products = await prisma.product.findMany({ where: { id: { in: data.items.map((i) => i.productId) } } });
  return buildBill({ items: data.items, products, type: data.type, discount: data.discount, defaultRate: num(setting.taxRatePct), taxInclusive: setting.taxInclusive });
}

async function withSummary(id: number) {
  const lay = await prisma.layaway.findUnique({ where: { id }, include: { items: true, payments: { orderBy: { id: 'desc' } } } });
  if (!lay) return null;
  const paid = round2(lay.payments.reduce((s, p) => s + num(p.amount), 0));
  return { ...lay, paid, balance: round2(num(lay.total) - paid) };
}

layawaysRouter.get(
  '/',
  ah(async (req, res) => {
    const status = req.query.status ? String(req.query.status) : undefined;
    const q = String(req.query.q || '').trim();
    const rows = await prisma.layaway.findMany({
      where: { status, ...(q ? { OR: [{ refNo: { contains: q, mode: 'insensitive' } }, { customerName: { contains: q, mode: 'insensitive' } }] } : {}) },
      include: { payments: { select: { amount: true } } },
      orderBy: { id: 'desc' },
      take: 300,
    });
    res.json(rows.map((l) => {
      const paid = round2(l.payments.reduce((s, p) => s + num(p.amount), 0));
      return { ...l, payments: undefined, paid, balance: round2(num(l.total) - paid) };
    }));
  })
);

layawaysRouter.get('/:id', ah(async (req, res) => {
  const lay = await withSummary(Number(req.params.id));
  if (!lay) return res.status(404).json({ error: 'Not found' });
  res.json(lay);
}));

layawaysRouter.post(
  '/',
  requireRole('ADMIN', 'MANAGER'),
  ah(async (req, res) => {
    const data = createSchema.parse(req.body);
    const { subtotal, discount, taxAmount, total, lines } = await computeTotals(data);
    if (data.deposit > total + 0.001) throw Object.assign(new Error('เงินมัดจำเกินยอดรวม'), { status: 400 });
    const branchId = data.branchId ?? (await prisma.branch.findFirst({ where: { isDefault: true } }))?.id ?? null;
    const lay = await prisma.$transaction(async (tx) => {
      const seq = await nextSeq(tx, 'layaway');
      const created = await tx.layaway.create({
        data: {
          refNo: `LAY-${String(seq).padStart(6, '0')}`,
          customerName: data.customerName, memberId: data.memberId ?? null, type: data.type,
          subtotal, discount, taxAmount, total, note: data.note,
          dueDate: data.dueDate ? new Date(data.dueDate) : null, userId: req.user!.id, branchId,
          items: { create: lines.map((l) => ({ productId: l.productId, nameSnapshot: l.nameSnapshot, qty: l.qty, unitPrice: l.unitPrice, lineTotal: l.lineTotal })) },
        },
      });
      if (data.deposit > 0) {
        await tx.layawayPayment.create({ data: { layawayId: created.id, amount: data.deposit, method: data.depositMethod, reference: 'เงินมัดจำ', userId: req.user!.id } });
      }
      return created;
    });
    res.status(201).json(await withSummary(lay.id));
  })
);

// Record a deposit / installment (capped at the remaining balance).
layawaysRouter.post(
  '/:id/payments',
  requireRole('ADMIN', 'MANAGER'),
  ah(async (req, res) => {
    const { amount, method, reference } = z.object({ amount: z.number().positive(), method: z.enum(['CASH', 'TRANSFER', 'CARD', 'CREDIT']).default('CASH'), reference: z.string().default('') }).parse(req.body);
    const id = Number(req.params.id);
    await prisma.$transaction(async (tx) => {
      const lay = await tx.layaway.findUniqueOrThrow({ where: { id }, include: { payments: { select: { amount: true } } } });
      if (lay.status !== 'OPEN') throw Object.assign(new Error('แผนนี้ปิดแล้ว'), { status: 400 });
      const paid = lay.payments.reduce((s, p) => s + num(p.amount), 0);
      const balance = round2(num(lay.total) - paid);
      if (amount > balance + 0.001) throw Object.assign(new Error(`เกินยอดคงค้าง (คงเหลือ ${balance.toFixed(2)})`), { status: 400 });
      await tx.layawayPayment.create({ data: { layawayId: id, amount, method, reference, userId: req.user!.id } });
    });
    res.json(await withSummary(id));
  })
);

// Complete a fully-paid layaway → create the sale (decrement stock) and close it.
layawaysRouter.post(
  '/:id/complete',
  requireRole('ADMIN', 'MANAGER'),
  ah(async (req, res) => {
    const id = Number(req.params.id);
    const userId = req.user!.id;
    const sale = await prisma.$transaction(async (tx) => {
      const lay = await tx.layaway.findUniqueOrThrow({ where: { id }, include: { items: true, payments: true } });
      if (lay.status !== 'OPEN') throw Object.assign(new Error('แผนนี้ปิดแล้ว'), { status: 400 });
      const paid = round2(lay.payments.reduce((s, p) => s + num(p.amount), 0));
      if (paid < num(lay.total) - 0.001) throw Object.assign(new Error(`ยังชำระไม่ครบ (คงเหลือ ${round2(num(lay.total) - paid).toFixed(2)})`), { status: 400 });

      const branchId = lay.branchId ?? (await tx.branch.findFirst({ where: { isDefault: true } }))?.id ?? null;
      const costs = new Map((await tx.product.findMany({ where: { id: { in: lay.items.map((i) => i.productId) } } })).map((p) => [p.id, num(p.cost)]));
      const seq = await nextSeq(tx, 'sale');
      const orderNo = `S-${String(seq).padStart(6, '0')}`;
      const created = await tx.sale.create({
        data: {
          orderNo, type: lay.type, status: 'PAID',
          subtotal: lay.subtotal, discount: lay.discount, taxAmount: lay.taxAmount, total: lay.total,
          paymentMethod: 'CASH', cashReceived: 0, changeDue: 0, paymentRef: `ออมก่อนรับ ${lay.refNo}`,
          cashierId: userId, memberId: lay.memberId, branchId,
          items: { create: lay.items.map((i) => ({ productId: i.productId, nameSnapshot: i.nameSnapshot, qty: i.qty, unitPrice: i.unitPrice, unitCost: costs.get(i.productId) ?? 0, lineTotal: i.lineTotal })) },
        },
      });
      // Tenders = the collected layaway payments (aggregated by method).
      const byMethod = new Map<string, number>();
      for (const p of lay.payments) byMethod.set(p.method, round2((byMethod.get(p.method) ?? 0) + num(p.amount)));
      for (const [method, amount] of byMethod) await tx.salePayment.create({ data: { saleId: created.id, method: method as 'CASH', amount, reference: lay.refNo } });
      for (const i of lay.items) await postMovement(tx, { productId: i.productId, type: 'SALE', qtyDelta: -i.qty, unitCost: costs.get(i.productId) ?? 0, refType: 'SALE', refId: created.id, note: orderNo, userId, branchId });
      await tx.layaway.update({ where: { id }, data: { status: 'COMPLETED', convertedSaleId: created.id } });
      return created;
    });
    res.status(201).json(sale);
  })
);

layawaysRouter.post(
  '/:id/cancel',
  requireRole('ADMIN', 'MANAGER'),
  ah(async (req, res) => {
    const lay = await prisma.layaway.update({ where: { id: Number(req.params.id) }, data: { status: 'CANCELLED' } });
    res.json(lay);
  })
);
