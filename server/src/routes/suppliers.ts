import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { ah, requireAuth, requireRole } from '../middleware/auth.js';

export const suppliersRouter = Router();
suppliersRouter.use(requireAuth);

suppliersRouter.get(
  '/',
  ah(async (_req, res) => {
    res.json(await prisma.supplier.findMany({ orderBy: { name: 'asc' } }));
  })
);

// Purchase history + stats for a supplier (committed POs + payments).
suppliersRouter.get(
  '/:id/history',
  ah(async (req, res) => {
    const supplierId = Number(req.params.id);
    const num = (d: unknown) => Number(d ?? 0);
    const round2 = (n: number) => Math.round(n * 100) / 100;
    const pos = await prisma.purchaseOrder.findMany({
      where: { supplierId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { payments: { select: { amount: true } }, _count: { select: { items: true } } },
    });
    const committed = pos.filter((po) => ['ORDERED', 'PARTIAL', 'RECEIVED'].includes(po.status));
    const totalOrdered = round2(committed.reduce((a, po) => a + num(po.total), 0));
    const totalPaid = round2(committed.reduce((a, po) => a + po.payments.reduce((s, p) => s + num(p.amount), 0), 0));
    res.json({
      purchaseOrders: pos.map((po) => ({
        id: po.id, refNo: po.refNo, status: po.status, createdAt: po.createdAt,
        total: round2(num(po.total)), items: po._count.items,
        paid: round2(po.payments.reduce((s, p) => s + num(p.amount), 0)),
      })),
      stats: {
        poCount: committed.length,
        totalOrdered,
        totalPaid,
        outstanding: round2(totalOrdered - totalPaid),
        lastOrder: pos[0]?.createdAt ?? null,
      },
    });
  })
);

const schema = z.object({
  name: z.string().min(1),
  phone: z.string().default(''),
  email: z.string().default(''),
  note: z.string().default(''),
});

suppliersRouter.post(
  '/',
  requireRole('ADMIN', 'MANAGER'),
  ah(async (req, res) => {
    res.status(201).json(await prisma.supplier.create({ data: schema.parse(req.body) }));
  })
);

suppliersRouter.put(
  '/:id',
  requireRole('ADMIN', 'MANAGER'),
  ah(async (req, res) => {
    const data = schema.partial().parse(req.body);
    res.json(await prisma.supplier.update({ where: { id: Number(req.params.id) }, data }));
  })
);
