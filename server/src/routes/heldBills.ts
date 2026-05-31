import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { ah, requireAuth } from '../middleware/auth.js';

export const heldBillsRouter = Router();
heldBillsRouter.use(requireAuth);

async function openShiftId(userId: number): Promise<number | null> {
  const s = await prisma.shift.findFirst({ where: { userId, status: 'OPEN' }, select: { id: true } });
  return s?.id ?? null;
}

// List held bills for the signed-in cashier's current open shift.
heldBillsRouter.get(
  '/',
  ah(async (req, res) => {
    const shiftId = await openShiftId(req.user!.id);
    if (!shiftId) return res.json([]);
    const bills = await prisma.heldBill.findMany({
      where: { shiftId },
      orderBy: { createdAt: 'desc' },
      include: { member: { select: { name: true } } },
    });
    res.json(bills);
  })
);

const schema = z.object({
  type: z.enum(['RETAIL', 'WHOLESALE']).default('RETAIL'),
  memberId: z.number().int().nullable().optional(),
  discount: z.number().nonnegative().default(0),
  couponCode: z.string().default(''),
  note: z.string().default(''),
  items: z.array(z.object({ productId: z.number().int(), qty: z.number().int().positive() })).min(1),
});

// Hold the current cart against the open shift.
heldBillsRouter.post(
  '/',
  ah(async (req, res) => {
    const data = schema.parse(req.body);
    const shiftId = await openShiftId(req.user!.id);
    if (!shiftId) return res.status(400).json({ error: 'ต้องเปิดกะก่อนพักบิล' });
    const bill = await prisma.heldBill.create({
      data: {
        shiftId,
        cashierId: req.user!.id,
        type: data.type,
        memberId: data.memberId ?? null,
        discount: data.discount,
        couponCode: data.couponCode,
        note: data.note,
        items: data.items,
      },
    });
    res.status(201).json(bill);
  })
);

// Remove a held bill (on resume or discard).
heldBillsRouter.delete(
  '/:id',
  ah(async (req, res) => {
    await prisma.heldBill.delete({ where: { id: Number(req.params.id) } });
    res.json({ ok: true });
  })
);
