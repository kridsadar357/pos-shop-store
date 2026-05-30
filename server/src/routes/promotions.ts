import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { ah, requireAuth, requireRole } from '../middleware/auth.js';
import { evaluatePromotions, type PromoCartLine } from '../lib/promotions.js';

export const promotionsRouter = Router();
promotionsRouter.use(requireAuth);

/** Active promotions whose date window includes now. */
export async function activePromotions() {
  const now = new Date();
  return prisma.promotion.findMany({
    where: {
      isActive: true,
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
        { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
      ],
    },
    orderBy: { id: 'asc' },
  });
}

// List all promotions (management).
promotionsRouter.get(
  '/',
  ah(async (_req, res) => {
    res.json(
      await prisma.promotion.findMany({
        orderBy: { id: 'desc' },
        include: { product: { select: { name: true } }, category: { select: { name: true } } },
      })
    );
  })
);

// Preview applicable promotions for a cart (used live by the POS).
const applySchema = z.object({
  couponCode: z.string().optional(),
  items: z.array(z.object({ productId: z.number().int(), qty: z.number().int().positive(), unitPrice: z.number().nonnegative() })).default([]),
});
promotionsRouter.post(
  '/apply',
  ah(async (req, res) => {
    const { couponCode, items } = applySchema.parse(req.body);
    if (!items.length) return res.json({ promoDiscount: 0, applied: [] });
    const products = await prisma.product.findMany({
      where: { id: { in: items.map((i) => i.productId) } },
      select: { id: true, categoryId: true },
    });
    const catById = new Map(products.map((p) => [p.id, p.categoryId]));
    const lines: PromoCartLine[] = items.map((i) => ({
      productId: i.productId,
      categoryId: catById.get(i.productId) ?? null,
      qty: i.qty,
      unitPrice: i.unitPrice,
      lineTotal: Math.round(i.unitPrice * i.qty * 100) / 100,
    }));
    res.json(evaluatePromotions(lines, await activePromotions(), { couponCode }));
  })
);

const schema = z.object({
  code: z.string().trim().optional().nullable(),
  name: z.string().min(1),
  type: z.enum(['PERCENT', 'FIXED', 'BXGY']),
  scope: z.enum(['BILL', 'PRODUCT', 'CATEGORY']).default('BILL'),
  value: z.number().nonnegative().default(0),
  buyQty: z.number().int().nonnegative().default(0),
  getQty: z.number().int().nonnegative().default(0),
  productId: z.number().int().nullable().optional(),
  categoryId: z.number().int().nullable().optional(),
  minSpend: z.number().nonnegative().default(0),
  autoApply: z.boolean().default(true),
  startsAt: z.string().datetime().nullable().optional(),
  endsAt: z.string().datetime().nullable().optional(),
  isActive: z.boolean().default(true),
});

function normalize(data: z.infer<typeof schema> | Partial<z.infer<typeof schema>>) {
  return {
    ...data,
    code: data.code ? data.code.trim() || null : data.code === undefined ? undefined : null,
    startsAt: data.startsAt ? new Date(data.startsAt) : data.startsAt === undefined ? undefined : null,
    endsAt: data.endsAt ? new Date(data.endsAt) : data.endsAt === undefined ? undefined : null,
  };
}

promotionsRouter.post(
  '/',
  requireRole('ADMIN', 'MANAGER'),
  ah(async (req, res) => {
    const data = schema.parse(req.body);
    res.status(201).json(await prisma.promotion.create({ data: normalize(data) as any }));
  })
);

promotionsRouter.put(
  '/:id',
  requireRole('ADMIN', 'MANAGER'),
  ah(async (req, res) => {
    const data = schema.partial().parse(req.body);
    res.json(await prisma.promotion.update({ where: { id: Number(req.params.id) }, data: normalize(data) as any }));
  })
);

promotionsRouter.delete(
  '/:id',
  requireRole('ADMIN', 'MANAGER'),
  ah(async (req, res) => {
    await prisma.promotion.delete({ where: { id: Number(req.params.id) } });
    res.json({ ok: true });
  })
);
