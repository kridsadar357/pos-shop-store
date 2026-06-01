import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { ah, requireAuth, requireRole } from '../middleware/auth.js';

export const expensesRouter = Router();
expensesRouter.use(requireAuth);

// List expenses with optional date-range / branch / category filters.
expensesRouter.get(
  '/',
  ah(async (req, res) => {
    const from = req.query.from ? new Date(String(req.query.from)) : undefined;
    const to = req.query.to ? new Date(String(req.query.to)) : undefined;
    const branchId = req.query.branchId ? Number(req.query.branchId) : undefined;
    const category = req.query.category ? String(req.query.category) : undefined;
    const expenses = await prisma.expense.findMany({
      where: { date: { gte: from, lte: to }, branchId, category },
      include: { branch: { select: { name: true } }, user: { select: { name: true } } },
      orderBy: { date: 'desc' },
      take: 500,
    });
    res.json(expenses);
  })
);

const schema = z.object({
  date: z.string().datetime().optional(),
  category: z.string().min(1).default('อื่นๆ'),
  amount: z.number().positive(),
  vendor: z.string().default(''),
  note: z.string().default(''),
  paymentMethod: z.enum(['CASH', 'TRANSFER']).default('CASH'),
  branchId: z.number().int().nullable().optional(),
});

expensesRouter.post(
  '/',
  requireRole('ADMIN', 'MANAGER'),
  ah(async (req, res) => {
    const data = schema.parse(req.body);
    const branchId = data.branchId ?? (await prisma.branch.findFirst({ where: { isDefault: true } }))?.id ?? null;
    const expense = await prisma.expense.create({
      data: {
        category: data.category,
        amount: data.amount,
        vendor: data.vendor,
        note: data.note,
        paymentMethod: data.paymentMethod,
        branchId,
        userId: req.user!.id,
        ...(data.date ? { date: new Date(data.date) } : {}),
      },
    });
    res.status(201).json(expense);
  })
);

expensesRouter.put(
  '/:id',
  requireRole('ADMIN', 'MANAGER'),
  ah(async (req, res) => {
    const data = schema.partial().parse(req.body);
    const expense = await prisma.expense.update({
      where: { id: Number(req.params.id) },
      data: { ...data, ...(data.date ? { date: new Date(data.date) } : { date: undefined }) },
    });
    res.json(expense);
  })
);

expensesRouter.delete(
  '/:id',
  requireRole('ADMIN', 'MANAGER'),
  ah(async (req, res) => {
    await prisma.expense.delete({ where: { id: Number(req.params.id) } });
    res.json({ ok: true });
  })
);
