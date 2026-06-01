import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { ah, requireAuth, requireRole } from '../middleware/auth.js';

export const shiftsRouter = Router();
shiftsRouter.use(requireAuth);

const num = (d: unknown) => Number(d ?? 0);

/** Aggregate the sales totals for a shift (used for live X-report and closing). */
async function shiftTotals(shiftId: number) {
  // Per-method money comes from SalePayment (handles split / multi-tender bills).
  const payments = await prisma.salePayment.findMany({ where: { sale: { shiftId, status: 'PAID' } }, select: { method: true, amount: true } });
  const byMethod = { CASH: 0, TRANSFER: 0, CARD: 0, CREDIT: 0 };
  for (const p of payments) {
    byMethod[p.method as keyof typeof byMethod] += num(p.amount);
  }
  const cash = byMethod.CASH;
  const transfer = byMethod.TRANSFER + byMethod.CARD + byMethod.CREDIT; // non-cash, for compat
  for (const k of Object.keys(byMethod) as (keyof typeof byMethod)[]) byMethod[k] = round2(byMethod[k]);
  const orders = await prisma.sale.count({ where: { shiftId, status: 'PAID' } });
  const voids = await prisma.sale.count({ where: { shiftId, status: 'VOID' } });
  // Petty cash in/out recorded against the shift.
  const cashMoves = await prisma.cashMovement.findMany({ where: { shiftId }, select: { type: true, amount: true } });
  let payIn = 0;
  let payOut = 0;
  for (const m of cashMoves) {
    if (m.type === 'PAY_IN') payIn += num(m.amount);
    else payOut += num(m.amount);
  }
  return {
    orders,
    cashSales: round2(cash),
    transferSales: round2(transfer),
    totalSales: round2(cash + transfer),
    byMethod,
    voids,
    payIn: round2(payIn),
    payOut: round2(payOut),
  };
}

/** Cash the drawer should hold = opening float + cash sales + pay-ins − pay-outs. */
function expectedCashFrom(openingFloat: unknown, t: { cashSales: number; payIn: number; payOut: number }) {
  return round2(num(openingFloat) + t.cashSales + t.payIn - t.payOut);
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
    res.json({ ...shift, totals, expectedCash: expectedCashFrom(shift.openingFloat, totals) });
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
    const expectedCash = expectedCashFrom(shift.openingFloat, totals);
    const cashDiff = round2(countedCash - expectedCash);

    const closed = await prisma.shift.update({
      where: { id },
      data: { status: 'CLOSED', closedAt: new Date(), countedCash, expectedCash, cashDiff, note },
    });
    res.json({ ...closed, totals });
  })
);

// Record a petty-cash pay-in or pay-out against an open shift.
shiftsRouter.post(
  '/:id/cash',
  ah(async (req, res) => {
    const { type, amount, reason } = z
      .object({ type: z.enum(['PAY_IN', 'PAY_OUT']), amount: z.number().positive(), reason: z.string().default('') })
      .parse(req.body);
    const id = Number(req.params.id);
    const shift = await prisma.shift.findUniqueOrThrow({ where: { id } });
    if (shift.status === 'CLOSED') return res.status(400).json({ error: 'Shift already closed' });
    if (shift.userId !== req.user!.id && req.user!.role === 'CASHIER') {
      return res.status(403).json({ error: "Cannot modify another cashier's shift" });
    }
    const move = await prisma.cashMovement.create({
      data: { shiftId: id, type, amount, reason, userId: req.user!.id },
    });
    const totals = await shiftTotals(id);
    res.status(201).json({ move, totals, expectedCash: expectedCashFrom(shift.openingFloat, totals) });
  })
);

// Petty-cash movements for a shift.
shiftsRouter.get(
  '/:id/cash',
  ah(async (req, res) => {
    const moves = await prisma.cashMovement.findMany({
      where: { shiftId: Number(req.params.id) },
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { name: true } } },
    });
    res.json(moves);
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
      include: { user: { select: { name: true } }, branch: { select: { name: true } } },
    });
    if (!shift) return res.status(404).json({ error: 'Not found' });
    const totals = await shiftTotals(shift.id);
    res.json({ ...shift, totals, expectedCash: expectedCashFrom(shift.openingFloat, totals) });
  })
);
