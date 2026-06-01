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
