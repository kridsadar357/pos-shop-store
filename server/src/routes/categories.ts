import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { ah, requireAuth, requireRole } from '../middleware/auth.js';

export const categoriesRouter = Router();
categoriesRouter.use(requireAuth);

categoriesRouter.get(
  '/',
  ah(async (_req, res) => {
    res.json(
      await prisma.category.findMany({
        orderBy: { name: 'asc' },
        include: { _count: { select: { products: true } } },
      })
    );
  })
);

categoriesRouter.post(
  '/',
  requireRole('ADMIN', 'MANAGER'),
  ah(async (req, res) => {
    const { name } = z.object({ name: z.string().min(1) }).parse(req.body);
    res.status(201).json(await prisma.category.create({ data: { name } }));
  })
);
