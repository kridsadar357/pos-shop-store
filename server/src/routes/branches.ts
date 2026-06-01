import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { ah, requireAuth, requireRole } from '../middleware/auth.js';

export const branchesRouter = Router();
branchesRouter.use(requireAuth);

/** Resolve the branch a transaction belongs to (explicit id → default → null). */
export async function resolveBranchId(tx: { branch: { findFirst: Function } }, branchId?: number | null): Promise<number | null> {
  if (branchId) return branchId;
  const def = await tx.branch.findFirst({ where: { isDefault: true } });
  return def?.id ?? null;
}

branchesRouter.get(
  '/',
  ah(async (req, res) => {
    const where = req.query.active === '1' ? { isActive: true } : {};
    res.json(await prisma.branch.findMany({ where, orderBy: [{ isDefault: 'desc' }, { id: 'asc' }] }));
  })
);

const schema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  address: z.string().default(''),
  phone: z.string().default(''),
  isActive: z.boolean().default(true),
  isDefault: z.boolean().default(false),
  // Per-branch overrides (empty = inherit global Setting).
  promptPayId: z.string().default(''),
  promptPayType: z.string().default(''),
  printerType: z.string().default(''),
  printerAddress: z.string().default(''),
  printerPaper: z.string().default(''),
  receiptHeader: z.string().default(''),
  receiptFooter: z.string().default(''),
});

branchesRouter.post(
  '/',
  requireRole('ADMIN'),
  ah(async (req, res) => {
    const data = schema.parse(req.body);
    const branch = await prisma.$transaction(async (tx) => {
      if (data.isDefault) await tx.branch.updateMany({ data: { isDefault: false } });
      return tx.branch.create({ data });
    });
    res.status(201).json(branch);
  })
);

branchesRouter.put(
  '/:id',
  requireRole('ADMIN'),
  ah(async (req, res) => {
    const id = Number(req.params.id);
    const data = schema.partial().parse(req.body);
    const branch = await prisma.$transaction(async (tx) => {
      if (data.isDefault) await tx.branch.updateMany({ data: { isDefault: false } });
      return tx.branch.update({ where: { id }, data });
    });
    res.json(branch);
  })
);
