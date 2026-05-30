import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { ah, requireAuth, requireRole } from '../middleware/auth.js';
import { nextSeq, postMovement } from '../lib/stock.js';

export const stockCountsRouter = Router();
stockCountsRouter.use(requireAuth);

stockCountsRouter.get(
  '/',
  ah(async (_req, res) => {
    res.json(
      await prisma.stockCount.findMany({
        orderBy: { createdAt: 'desc' },
        include: { _count: { select: { items: true } } },
      })
    );
  })
);

stockCountsRouter.get(
  '/:id',
  ah(async (req, res) => {
    const count = await prisma.stockCount.findUnique({
      where: { id: Number(req.params.id) },
      include: { items: { include: { product: { select: { name: true, sku: true, unit: true } } } } },
    });
    if (!count) return res.status(404).json({ error: 'Not found' });
    res.json(count);
  })
);

// Open a new count. Snapshots current system qty for the chosen products
// (or all active products when none specified).
const openSchema = z.object({
  note: z.string().default(''),
  productIds: z.array(z.number().int()).optional(),
});

stockCountsRouter.post(
  '/',
  requireRole('ADMIN', 'MANAGER'),
  ah(async (req, res) => {
    const { note, productIds } = openSchema.parse(req.body);
    const products = await prisma.product.findMany({
      where: { isActive: true, ...(productIds?.length ? { id: { in: productIds } } : {}) },
      select: { id: true, stockQty: true },
    });

    const count = await prisma.$transaction(async (tx) => {
      const seq = await nextSeq(tx, 'stock_count');
      return tx.stockCount.create({
        data: {
          refNo: `SC-${String(seq).padStart(5, '0')}`,
          note,
          userId: req.user!.id,
          items: {
            create: products.map((p) => ({
              productId: p.id,
              systemQty: p.stockQty,
              countedQty: p.stockQty,
            })),
          },
        },
      });
    });
    res.status(201).json(count);
  })
);

// Save counted quantities (before posting).
const saveSchema = z.object({
  items: z.array(z.object({ productId: z.number().int(), countedQty: z.number().int().nonnegative() })),
});

stockCountsRouter.put(
  '/:id',
  requireRole('ADMIN', 'MANAGER'),
  ah(async (req, res) => {
    const { items } = saveSchema.parse(req.body);
    const countId = Number(req.params.id);
    await prisma.$transaction(
      items.map((i) =>
        prisma.stockCountItem.updateMany({
          where: { countId, productId: i.productId },
          data: { countedQty: i.countedQty },
        })
      )
    );
    res.json({ ok: true });
  })
);

// Post the count: write COUNT movements for every line whose counted qty
// differs from the system qty, reconciling stock to the physical count.
stockCountsRouter.post(
  '/:id/post',
  requireRole('ADMIN', 'MANAGER'),
  ah(async (req, res) => {
    const countId = Number(req.params.id);
    const userId = req.user!.id;

    const result = await prisma.$transaction(async (tx) => {
      const count = await tx.stockCount.findUniqueOrThrow({
        where: { id: countId },
        include: { items: true },
      });
      if (count.status === 'POSTED') throw Object.assign(new Error('Count already posted'), { status: 400 });

      let adjustments = 0;
      for (const item of count.items) {
        // Re-read live system qty so we apply the true delta even if stock moved
        // between opening and posting the count.
        const product = await tx.product.findUniqueOrThrow({ where: { id: item.productId }, select: { stockQty: true } });
        const delta = item.countedQty - product.stockQty;
        if (delta !== 0) {
          adjustments++;
          await postMovement(tx, {
            productId: item.productId,
            type: 'COUNT',
            qtyDelta: delta,
            refType: 'STOCK_COUNT',
            refId: countId,
            note: `${count.refNo} reconcile`,
            userId,
          });
        }
      }

      return tx.stockCount.update({
        where: { id: countId },
        data: { status: 'POSTED', postedAt: new Date() },
        select: { id: true, refNo: true, status: true },
      });
    });

    res.json(result);
  })
);
