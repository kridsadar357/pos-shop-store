import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { ah, requireAuth, requireRole } from '../middleware/auth.js';

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
