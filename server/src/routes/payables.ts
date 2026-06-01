import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { ah, requireAuth, requireRole } from '../middleware/auth.js';

export const payablesRouter = Router();
payablesRouter.use(requireAuth);

const num = (d: unknown) => Number(d ?? 0);
const round2 = (n: number) => Math.round(n * 100) / 100;

// Statuses that represent a committed order the shop owes money for.
const PAYABLE_STATUSES = ['ORDERED', 'PARTIAL', 'RECEIVED'];

// Accounts-payable summary: committed POs with total / paid / outstanding.
payablesRouter.get(
  '/',
  ah(async (req, res) => {
    const supplierId = req.query.supplierId ? Number(req.query.supplierId) : undefined;
    const view = String(req.query.view || ''); // '' | outstanding | paid
    const pos = await prisma.purchaseOrder.findMany({
      where: { status: { in: PAYABLE_STATUSES }, supplierId },
      include: { supplier: { select: { name: true } }, payments: { select: { amount: true } } },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    let rows = pos.map((po) => {
      const total = num(po.total);
      const paid = round2(po.payments.reduce((s, p) => s + num(p.amount), 0));
      const outstanding = round2(total - paid);
      return {
        id: po.id,
        refNo: po.refNo,
        status: po.status,
        supplierId: po.supplierId,
        supplier: po.supplier,
        createdAt: po.createdAt,
        expectedDate: po.expectedDate,
        total,
        paid,
        outstanding,
        paymentStatus: outstanding <= 0 ? 'PAID' : paid > 0 ? 'PARTIAL' : 'UNPAID',
      };
    });
    if (view === 'outstanding') rows = rows.filter((r) => r.outstanding > 0);
    if (view === 'paid') rows = rows.filter((r) => r.outstanding <= 0);
    const totals = rows.reduce(
      (a, r) => ({ total: a.total + r.total, paid: a.paid + r.paid, outstanding: a.outstanding + r.outstanding }),
      { total: 0, paid: 0, outstanding: 0 }
    );
    res.json({ rows, totals: { total: round2(totals.total), paid: round2(totals.paid), outstanding: round2(totals.outstanding) } });
  })
);

// Payment history for a PO.
payablesRouter.get(
  '/:poId/payments',
  ah(async (req, res) => {
    const payments = await prisma.supplierPayment.findMany({
      where: { poId: Number(req.params.poId) },
      orderBy: { id: 'desc' },
    });
    res.json(payments);
  })
);

// Record a payment against a PO (capped at the outstanding balance).
payablesRouter.post(
  '/:poId/payments',
  requireRole('ADMIN', 'MANAGER'),
  ah(async (req, res) => {
    const { amount, method, reference, note } = z
      .object({ amount: z.number().positive(), method: z.enum(['CASH', 'TRANSFER']).default('TRANSFER'), reference: z.string().default(''), note: z.string().default('') })
      .parse(req.body);
    const poId = Number(req.params.poId);
    const payment = await prisma.$transaction(async (tx) => {
      const po = await tx.purchaseOrder.findUniqueOrThrow({ where: { id: poId }, include: { payments: { select: { amount: true } } } });
      const paid = po.payments.reduce((s, p) => s + num(p.amount), 0);
      const outstanding = round2(num(po.total) - paid);
      if (outstanding <= 0) throw Object.assign(new Error('ใบสั่งซื้อนี้ชำระครบแล้ว'), { status: 400 });
      if (amount > outstanding + 0.001) throw Object.assign(new Error(`เกินยอดค้างชำระ (คงเหลือ ${outstanding.toFixed(2)})`), { status: 400 });
      return tx.supplierPayment.create({
        data: { poId, supplierId: po.supplierId, amount, method, reference, note, userId: req.user!.id },
      });
    });
    res.status(201).json(payment);
  })
);
