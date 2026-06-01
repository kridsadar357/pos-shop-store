import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { ah, requireAuth, requireRole } from '../middleware/auth.js';
import { nextSeq, postMovement } from '../lib/stock.js';

export const transfersRouter = Router();
transfersRouter.use(requireAuth);

// --- List ---
transfersRouter.get(
  '/',
  ah(async (req, res) => {
    const from = req.query.from ? new Date(String(req.query.from)) : undefined;
    const to = req.query.to ? new Date(String(req.query.to)) : undefined;
    const rows = await prisma.stockTransfer.findMany({
      where: { createdAt: { gte: from, lte: to } },
      include: { fromBranch: { select: { name: true } }, toBranch: { select: { name: true } }, items: { select: { qty: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    res.json(rows.map((t) => ({
      id: t.id, refNo: t.refNo, note: t.note, createdAt: t.createdAt,
      fromBranch: t.fromBranch.name, toBranch: t.toBranch.name,
      lineCount: t.items.length, qty: t.items.reduce((s, i) => s + i.qty, 0),
    })));
  })
);

// --- Detail ---
transfersRouter.get(
  '/:id',
  ah(async (req, res) => {
    const t = await prisma.stockTransfer.findUnique({
      where: { id: Number(req.params.id) },
      include: { fromBranch: true, toBranch: true, items: { include: { /* product fetched below */ } } },
    });
    if (!t) return res.status(404).json({ error: 'ไม่พบใบโอน' });
    const products = await prisma.product.findMany({ where: { id: { in: t.items.map((i) => i.productId) } }, select: { id: true, name: true, sku: true } });
    const byId = new Map(products.map((p) => [p.id, p]));
    res.json({ ...t, items: t.items.map((i) => ({ ...i, product: byId.get(i.productId) })) });
  })
);

// --- Create ---
const schema = z.object({
  fromBranchId: z.number().int(),
  toBranchId: z.number().int(),
  note: z.string().default(''),
  items: z.array(z.object({ productId: z.number().int(), qty: z.number().int().positive() })).min(1),
});

transfersRouter.post(
  '/',
  requireRole('ADMIN', 'MANAGER'),
  ah(async (req, res) => {
    const data = schema.parse(req.body);
    if (data.fromBranchId === data.toBranchId) return res.status(400).json({ error: 'สาขาต้นทางและปลายทางต้องไม่ใช่สาขาเดียวกัน' });
    const userId = req.user!.id;

    const result = await prisma.$transaction(async (tx) => {
      const [fromB, toB] = await Promise.all([
        tx.branch.findUniqueOrThrow({ where: { id: data.fromBranchId } }),
        tx.branch.findUniqueOrThrow({ where: { id: data.toBranchId } }),
      ]);

      // Ensure the source branch has enough on hand.
      for (const it of data.items) {
        const bs = await tx.branchStock.findUnique({ where: { productId_branchId: { productId: it.productId, branchId: data.fromBranchId } } });
        const have = bs?.qty ?? 0;
        if (it.qty > have) {
          const p = await tx.product.findUnique({ where: { id: it.productId }, select: { name: true } });
          throw Object.assign(new Error(`สต็อก "${p?.name}" ที่ ${fromB.name} ไม่พอ (มี ${have})`), { status: 400 });
        }
      }

      const seq = await nextSeq(tx, 'stock_transfer');
      const refNo = `TR-${String(seq).padStart(5, '0')}`;
      const transfer = await tx.stockTransfer.create({
        data: { refNo, fromBranchId: data.fromBranchId, toBranchId: data.toBranchId, note: data.note, userId, items: { create: data.items.map((i) => ({ productId: i.productId, qty: i.qty })) } },
      });

      // Two ledger movements per line: out of source, into destination (total unchanged).
      for (const it of data.items) {
        await postMovement(tx, { productId: it.productId, type: 'TRANSFER', qtyDelta: -it.qty, branchId: data.fromBranchId, refType: 'TRANSFER', refId: transfer.id, note: `${refNo} → ${toB.name}`, userId });
        await postMovement(tx, { productId: it.productId, type: 'TRANSFER', qtyDelta: it.qty, branchId: data.toBranchId, refType: 'TRANSFER', refId: transfer.id, note: `${refNo} ← ${fromB.name}`, userId });
      }
      return transfer;
    });

    res.status(201).json(result);
  })
);
