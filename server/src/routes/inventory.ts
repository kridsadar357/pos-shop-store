import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { ah, requireAuth, requireRole } from '../middleware/auth.js';
import { nextSeq, postMovement } from '../lib/stock.js';

export const inventoryRouter = Router();
inventoryRouter.use(requireAuth);

// --- Stock movement ledger (backtrack) ---
inventoryRouter.get(
  '/movements',
  ah(async (req, res) => {
    const productId = req.query.productId ? Number(req.query.productId) : undefined;
    const type = req.query.type ? String(req.query.type) : undefined;
    const branchId = req.query.branchId ? Number(req.query.branchId) : undefined;
    const from = req.query.from ? new Date(String(req.query.from)) : undefined;
    const to = req.query.to ? new Date(String(req.query.to)) : undefined;

    const movements = await prisma.stockMovement.findMany({
      where: {
        productId,
        type: type as any,
        branchId,
        createdAt: { gte: from, lte: to },
      },
      include: { product: { select: { name: true, sku: true } }, user: { select: { name: true } }, branch: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    res.json(movements);
  })
);

// --- Per-branch stock (Phase 2) ---
inventoryRouter.get(
  '/branch-stock',
  ah(async (req, res) => {
    const branchId = req.query.branchId ? Number(req.query.branchId) : undefined;
    const products = await prisma.product.findMany({
      where: { isActive: true },
      include: { branchStock: branchId ? { where: { branchId } } : true },
      orderBy: { name: 'asc' },
    });
    res.json(products.map((p) => ({
      id: p.id, sku: p.sku, name: p.name, unit: p.unit, totalQty: p.stockQty,
      qty: branchId ? (p.branchStock[0]?.qty ?? 0) : p.stockQty,
      byBranch: p.branchStock.map((b) => ({ branchId: b.branchId, qty: b.qty })),
    })));
  })
);

// --- Goods receipt history ---
inventoryRouter.get(
  '/receipts',
  ah(async (req, res) => {
    const from = req.query.from ? new Date(String(req.query.from)) : undefined;
    const to = req.query.to ? new Date(String(req.query.to)) : undefined;
    const receipts = await prisma.goodsReceipt.findMany({
      where: { createdAt: { gte: from, lte: to } },
      include: {
        supplier: { select: { name: true } },
        _count: { select: { items: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    res.json(receipts);
  })
);

// --- Receive goods from a supplier (RECEIVE movements) ---
const receiveSchema = z.object({
  supplierId: z.number().int().nullable().optional(),
  branchId: z.number().int().nullable().optional(),
  note: z.string().default(''),
  items: z
    .array(
      z.object({
        productId: z.number().int(),
        qty: z.number().int().positive(),
        unitCost: z.number().nonnegative(),
      })
    )
    .min(1),
});

inventoryRouter.post(
  '/receive',
  requireRole('ADMIN', 'MANAGER'),
  ah(async (req, res) => {
    const data = receiveSchema.parse(req.body);
    const userId = req.user!.id;

    const result = await prisma.$transaction(async (tx) => {
      const seq = await nextSeq(tx, 'goods_receipt');
      const refNo = `GR-${String(seq).padStart(5, '0')}`;
      const total = data.items.reduce((s, i) => s + i.qty * i.unitCost, 0);

      const receipt = await tx.goodsReceipt.create({
        data: {
          refNo,
          supplierId: data.supplierId ?? null,
          note: data.note,
          total,
          userId,
          items: { create: data.items.map((i) => ({ productId: i.productId, qty: i.qty, unitCost: i.unitCost })) },
        },
      });

      for (const i of data.items) {
        // Receiving also refreshes the product's moving cost to the latest unit cost.
        await tx.product.update({ where: { id: i.productId }, data: { cost: i.unitCost } });
        await postMovement(tx, {
          productId: i.productId,
          type: 'RECEIVE',
          qtyDelta: i.qty,
          unitCost: i.unitCost,
          refType: 'GOODS_RECEIPT',
          refId: receipt.id,
          note: refNo,
          userId,
          branchId: data.branchId ?? undefined,
        });
      }
      return receipt;
    });

    res.status(201).json(result);
  })
);

// --- Manual stock adjustment (ADJUST movement, signed delta) ---
const adjustSchema = z.object({
  productId: z.number().int(),
  qtyDelta: z.number().int().refine((v) => v !== 0, 'qtyDelta cannot be 0'),
  note: z.string().default(''),
  branchId: z.number().int().nullable().optional(),
});

inventoryRouter.post(
  '/adjust',
  requireRole('ADMIN', 'MANAGER'),
  ah(async (req, res) => {
    const data = adjustSchema.parse(req.body);
    const userId = req.user!.id;
    const balanceAfter = await prisma.$transaction((tx) =>
      postMovement(tx, {
        productId: data.productId,
        type: 'ADJUST',
        qtyDelta: data.qtyDelta,
        refType: 'MANUAL',
        note: data.note,
        userId,
        branchId: data.branchId ?? undefined,
      })
    );
    res.json({ balanceAfter });
  })
);
