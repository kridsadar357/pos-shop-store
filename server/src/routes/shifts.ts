import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { ah, requireAuth, requireRole } from '../middleware/auth.js';

export const shiftsRouter = Router();
shiftsRouter.use(requireAuth);

const num = (d: unknown) => Number(d ?? 0);

/** Aggregate the sales totals for a shift (used for live X-report and closing). */
async function shiftTotals(shiftId: number) {
  const sales = await prisma.sale.findMany({ where: { shiftId, status: 'PAID' }, select: { total: true, paymentMethod: true } });
  let cash = 0;
  let transfer = 0;
  for (const s of sales) {
    if (s.paymentMethod === 'CASH') cash += num(s.total);
    else transfer += num(s.total);
  }
  const voids = await prisma.sale.count({ where: { shiftId, status: 'VOID' } });
  return { orders: sales.length, cashSales: round2(cash), transferSales: round2(transfer), totalSales: round2(cash + transfer), voids };
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

// Current open shift for the signed-in user (with running totals).
shiftsRouter.get(
  '/current',
  ah(async (req, res) => {
    const shift = await prisma.shift.findFirst({
      where: { userId: req.user!.id, status: 'OPEN' },
      orderBy: { openedAt: 'desc' },
    });
    if (!shift) return res.json(null);
    const totals = await shiftTotals(shift.id);
    res.json({ ...shift, totals, expectedCash: round2(num(shift.openingFloat) + totals.cashSales) });
  })
);

// Open a shift with an opening cash float.
shiftsRouter.post(
  '/open',
  ah(async (req, res) => {
    const { openingFloat, branchId } = z.object({ openingFloat: z.number().nonnegative().default(0), branchId: z.number().int().nullable().optional() }).parse(req.body);
    const existing = await prisma.shift.findFirst({ where: { userId: req.user!.id, status: 'OPEN' } });
    if (existing) return res.status(400).json({ error: 'A shift is already open' });
    const resolvedBranch = branchId ?? (await prisma.branch.findFirst({ where: { isDefault: true } }))?.id ?? null;
    const shift = await prisma.shift.create({ data: { userId: req.user!.id, openingFloat, branchId: resolvedBranch } });
    res.status(201).json(shift);
  })
);

// Close a shift: count cash, compute expected & difference, store reconciliation.
shiftsRouter.post(
  '/:id/close',
  ah(async (req, res) => {
    const { countedCash, note } = z
      .object({ countedCash: z.number().nonnegative(), note: z.string().default('') })
      .parse(req.body);
    const id = Number(req.params.id);
    const shift = await prisma.shift.findUniqueOrThrow({ where: { id } });
    if (shift.status === 'CLOSED') return res.status(400).json({ error: 'Shift already closed' });
    // Only the owner, or a manager/admin, may close.
    if (shift.userId !== req.user!.id && req.user!.role === 'CASHIER') {
      return res.status(403).json({ error: 'Cannot close another cashier\'s shift' });
    }

    const totals = await shiftTotals(id);
    const expectedCash = round2(num(shift.openingFloat) + totals.cashSales);
    const cashDiff = round2(countedCash - expectedCash);

    const closed = await prisma.shift.update({
      where: { id },
      data: { status: 'CLOSED', closedAt: new Date(), countedCash, expectedCash, cashDiff, note },
    });
    res.json({ ...closed, totals });
  })
);

// History (managers/admins).
shiftsRouter.get(
  '/',
  requireRole('ADMIN', 'MANAGER'),
  ah(async (_req, res) => {
    const shifts = await prisma.shift.findMany({
      orderBy: { openedAt: 'desc' },
      take: 100,
      include: { user: { select: { name: true } }, branch: { select: { name: true } } },
    });
    res.json(shifts);
  })
);

shiftsRouter.get(
  '/:id',
  ah(async (req, res) => {
    const shift = await prisma.shift.findUnique({
      where: { id: Number(req.params.id) },
      include: { user: { select: { name: true } } },
    });
    if (!shift) return res.status(404).json({ error: 'Not found' });
    const totals = await shiftTotals(shift.id);
    res.json({ ...shift, totals });
  })
);
