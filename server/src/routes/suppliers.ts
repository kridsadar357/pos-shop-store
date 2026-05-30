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
