import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { ah, requireAuth, requireRole } from '../middleware/auth.js';
import { postPoints } from '../lib/loyalty.js';

export const membersRouter = Router();
membersRouter.use(requireAuth);

// Search by name or phone (?q=) — used by the POS member widget.
membersRouter.get(
  '/',
  ah(async (req, res) => {
    const q = String(req.query.q || '').trim();
    const members = await prisma.member.findMany({
      where: {
        isActive: true,
        ...(q
          ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { phone: { contains: q } }, { code: { contains: q, mode: 'insensitive' } }] }
          : {}),
      },
      orderBy: { name: 'asc' },
      take: 30,
    });
    res.json(members);
  })
);

membersRouter.get(
  '/:id',
  ah(async (req, res) => {
    const member = await prisma.member.findUnique({
      where: { id: Number(req.params.id) },
      include: { _count: { select: { sales: true } } },
    });
    if (!member) return res.status(404).json({ error: 'Not found' });
    res.json(member);
  })
);

// Purchase history + lifetime value for a member.
membersRouter.get(
  '/:id/sales',
  ah(async (req, res) => {
    const memberId = Number(req.params.id);
    const sales = await prisma.sale.findMany({
      where: { memberId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: { id: true, orderNo: true, createdAt: true, total: true, status: true, paymentMethod: true, _count: { select: { items: true } } },
    });
    const paid = sales.filter((s) => s.status === 'PAID');
    const totalSpent = paid.reduce((a, s) => a + Number(s.total), 0);
    res.json({
      sales,
      stats: {
        orders: paid.length,
        totalSpent: Math.round(totalSpent * 100) / 100,
        avgOrder: paid.length ? Math.round((totalSpent / paid.length) * 100) / 100 : 0,
        lastVisit: paid[0]?.createdAt ?? null,
      },
    });
  })
);

// Loyalty-point ledger for a member (most recent first).
membersRouter.get(
  '/:id/points',
  ah(async (req, res) => {
    const txns = await prisma.pointTransaction.findMany({
      where: { memberId: Number(req.params.id) },
      orderBy: { id: 'desc' },
      take: 100,
      include: { sale: { select: { orderNo: true } } },
    });
    res.json(txns);
  })
);

// Manual points adjustment (e.g. correction, goodwill, redemption at counter).
membersRouter.post(
  '/:id/points',
  requireRole('ADMIN', 'MANAGER'),
  ah(async (req, res) => {
    const { points, note } = z.object({ points: z.number().int(), note: z.string().default('') }).parse(req.body);
    if (points === 0) return res.status(400).json({ error: 'points must be non-zero' });
    const memberId = Number(req.params.id);
    const txn = await prisma.$transaction((tx) => postPoints(tx, { memberId, type: 'ADJUST', points, note, userId: req.user!.id }));
    res.status(201).json(txn);
  })
);

const schema = z.object({
  code: z.string().trim().optional().nullable(),
  name: z.string().min(1),
  phone: z.string().min(1),
  email: z.string().default(''),
  note: z.string().default(''),
  isActive: z.boolean().default(true),
});

membersRouter.post(
  '/',
  ah(async (req, res) => {
    const data = schema.parse(req.body);
    const member = await prisma.member.create({ data: { ...data, code: data.code || null } });
    res.status(201).json(member);
  })
);

membersRouter.put(
  '/:id',
  requireRole('ADMIN', 'MANAGER'),
  ah(async (req, res) => {
    const data = schema.partial().parse(req.body);
    const member = await prisma.member.update({
      where: { id: Number(req.params.id) },
      data: { ...data, code: data.code === undefined ? undefined : data.code || null },
    });
    res.json(member);
  })
);
