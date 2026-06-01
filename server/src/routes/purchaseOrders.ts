import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { ah, requireAuth, requireRole } from '../middleware/auth.js';
import { nextSeq, postMovement } from '../lib/stock.js';

export const purchaseOrdersRouter = Router();
purchaseOrdersRouter.use(requireAuth);

const itemSchema = z.object({ productId: z.number().int(), qty: z.number().int().positive(), unitCost: z.number().nonnegative() });
const poSchema = z.object({
  supplierId: z.number().int().nullable().optional(),
  note: z.string().default(''),
  expectedDate: z.string().optional(),
  items: z.array(itemSchema).min(1),
});

const totalOf = (items: { qty: number; unitCost: number }[]) => items.reduce((s, i) => s + i.qty * i.unitCost, 0);

// --- List ---
purchaseOrdersRouter.get(
  '/',
  ah(async (req, res) => {
    const from = req.query.from ? new Date(String(req.query.from)) : undefined;
    const to = req.query.to ? new Date(String(req.query.to)) : undefined;
    const pos = await prisma.purchaseOrder.findMany({
      where: { createdAt: { gte: from, lte: to } },
      include: { supplier: { select: { name: true } }, items: { select: { qty: true, receivedQty: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    res.json(
      pos.map((po) => ({
        id: po.id, refNo: po.refNo, status: po.status, note: po.note, total: po.total,
        expectedDate: po.expectedDate, createdAt: po.createdAt, supplier: po.supplier,
        lineCount: po.items.length,
        orderedQty: po.items.reduce((s, i) => s + i.qty, 0),
        receivedQty: po.items.reduce((s, i) => s + i.receivedQty, 0),
      }))
    );
  })
);

// --- Reorder suggestions: products at/below reorder, with a suggested qty,
//     last purchase cost and preferred supplier (from the most recent receipt). ---
purchaseOrdersRouter.get(
  '/suggestions',
  ah(async (req, res) => {
    const branchId = req.query.branchId ? Number(req.query.branchId) : undefined;
    const products = await prisma.product.findMany({
      where: { isActive: true },
      include: { category: { select: { name: true } }, ...(branchId ? { branchStock: { where: { branchId }, select: { qty: true } } } : {}) } as any,
    });
    const onHand = (p: any) => (branchId ? (p.branchStock?.[0]?.qty ?? 0) : p.stockQty);
    const need = products.filter((p) => onHand(p) <= p.reorderLevel);
    if (!need.length) return res.json([]);

    // Latest goods-receipt cost + supplier per product.
    const grItems = await prisma.goodsReceiptItem.findMany({
      where: { productId: { in: need.map((p) => p.id) } },
      include: { receipt: { select: { supplierId: true, createdAt: true, supplier: { select: { name: true } } } } },
      orderBy: { id: 'desc' },
    });
    const lastBuy = new Map<number, { unitCost: number; supplierId: number | null; supplierName: string | null }>();
    for (const it of grItems) {
      if (lastBuy.has(it.productId)) continue;
      lastBuy.set(it.productId, { unitCost: Number(it.unitCost), supplierId: it.receipt.supplierId, supplierName: it.receipt.supplier?.name ?? null });
    }

    // The supplier price list takes precedence (preferred, else cheapest).
    const sp = await prisma.supplierProduct.findMany({
      where: { productId: { in: need.map((p) => p.id) } },
      include: { supplier: { select: { name: true } } },
      orderBy: [{ isPreferred: 'desc' }, { unitCost: 'asc' }],
    });
    const priceList = new Map<number, { unitCost: number; supplierId: number; supplierName: string }>();
    for (const r of sp) {
      if (priceList.has(r.productId)) continue;
      priceList.set(r.productId, { unitCost: Number(r.unitCost), supplierId: r.supplierId, supplierName: r.supplier.name });
    }

    res.json(
      need
        .map((p) => {
          const oh = onHand(p);
          const target = p.reorderLevel > 0 ? p.reorderLevel * 3 : 50; // restock to ~3× the reorder point
          const pl = priceList.get(p.id);
          const lb = lastBuy.get(p.id);
          const src = pl ?? lb; // price list wins, else last purchase
          return {
            productId: p.id, sku: p.sku, name: p.name, category: (p as any).category?.name ?? '',
            onHand: oh, reorderLevel: p.reorderLevel, unit: p.unit,
            suggestedQty: Math.max(target - oh, 1),
            unitCost: src?.unitCost ?? Number(p.cost),
            supplierId: src?.supplierId ?? null, supplierName: src?.supplierName ?? null,
          };
        })
        .sort((a, b) => a.onHand - b.onHand)
    );
  })
);

// --- Detail ---
purchaseOrdersRouter.get(
  '/:id',
  ah(async (req, res) => {
    const po = await prisma.purchaseOrder.findUnique({
      where: { id: Number(req.params.id) },
      include: {
        supplier: { select: { id: true, name: true } },
        items: { include: { product: { select: { name: true, sku: true, unit: true, stockQty: true } } } },
      },
    });
    if (!po) return res.status(404).json({ error: 'ไม่พบใบสั่งซื้อ' });
    res.json(po);
  })
);

// --- Create (DRAFT) ---
purchaseOrdersRouter.post(
  '/',
  requireRole('ADMIN', 'MANAGER'),
  ah(async (req, res) => {
    const data = poSchema.parse(req.body);
    const po = await prisma.$transaction(async (tx) => {
      const seq = await nextSeq(tx, 'purchase_order');
      return tx.purchaseOrder.create({
        data: {
          refNo: `PO-${String(seq).padStart(5, '0')}`,
          supplierId: data.supplierId ?? null,
          note: data.note,
          expectedDate: data.expectedDate ? new Date(data.expectedDate) : null,
          total: totalOf(data.items),
          userId: req.user!.id,
          items: { create: data.items.map((i) => ({ productId: i.productId, qty: i.qty, unitCost: i.unitCost })) },
        },
      });
    });
    res.status(201).json(po);
  })
);

// --- Edit (DRAFT only) ---
purchaseOrdersRouter.put(
  '/:id',
  requireRole('ADMIN', 'MANAGER'),
  ah(async (req, res) => {
    const id = Number(req.params.id);
    const data = poSchema.parse(req.body);
    const existing = await prisma.purchaseOrder.findUniqueOrThrow({ where: { id } });
    if (existing.status !== 'DRAFT') return res.status(400).json({ error: 'แก้ไขได้เฉพาะใบสั่งซื้อที่เป็นแบบร่าง' });
    const po = await prisma.$transaction(async (tx) => {
      await tx.purchaseOrderItem.deleteMany({ where: { poId: id } });
      return tx.purchaseOrder.update({
        where: { id },
        data: {
          supplierId: data.supplierId ?? null, note: data.note,
          expectedDate: data.expectedDate ? new Date(data.expectedDate) : null,
          total: totalOf(data.items),
          items: { create: data.items.map((i) => ({ productId: i.productId, qty: i.qty, unitCost: i.unitCost })) },
        },
      });
    });
    res.json(po);
  })
);

// --- Status transition (ORDERED / CANCELLED) ---
purchaseOrdersRouter.post(
  '/:id/status',
  requireRole('ADMIN', 'MANAGER'),
  ah(async (req, res) => {
    const id = Number(req.params.id);
    const next = z.enum(['ORDERED', 'CANCELLED']).parse(req.body?.status);
    const po = await prisma.purchaseOrder.findUniqueOrThrow({ where: { id } });
    if (next === 'ORDERED' && po.status !== 'DRAFT') return res.status(400).json({ error: 'ส่งสั่งซื้อได้เฉพาะแบบร่าง' });
    if (next === 'CANCELLED' && (po.status === 'RECEIVED' || po.status === 'CANCELLED')) return res.status(400).json({ error: 'ยกเลิกใบสั่งซื้อนี้ไม่ได้' });
    const updated = await prisma.purchaseOrder.update({ where: { id }, data: { status: next } });
    res.json(updated);
  })
);

// --- Receive against the PO (full or partial) ---
const receiveSchema = z.object({ branchId: z.number().int().nullable().optional(), items: z.array(z.object({ productId: z.number().int(), qty: z.number().int().positive() })).min(1) });

purchaseOrdersRouter.post(
  '/:id/receive',
  requireRole('ADMIN', 'MANAGER'),
  ah(async (req, res) => {
    const id = Number(req.params.id);
    const userId = req.user!.id;
    const body = receiveSchema.parse(req.body);

    const result = await prisma.$transaction(async (tx) => {
      const po = await tx.purchaseOrder.findUniqueOrThrow({ where: { id }, include: { items: true } });
      if (po.status === 'CANCELLED' || po.status === 'RECEIVED') throw Object.assign(new Error('ใบสั่งซื้อนี้รับสินค้าไม่ได้'), { status: 400 });

      // Clamp each receive line to the outstanding quantity.
      const byProduct = new Map(po.items.map((i) => [i.productId, i]));
      const lines = body.items
        .map((r) => {
          const it = byProduct.get(r.productId);
          if (!it) return null;
          const outstanding = it.qty - it.receivedQty;
          const qty = Math.min(r.qty, outstanding);
          return qty > 0 ? { item: it, qty } : null;
        })
        .filter(Boolean) as { item: typeof po.items[number]; qty: number }[];
      if (!lines.length) throw Object.assign(new Error('ไม่มีรายการที่ต้องรับ'), { status: 400 });

      // Goods receipt linked to the PO.
      const grSeq = await nextSeq(tx, 'goods_receipt');
      const grNo = `GR-${String(grSeq).padStart(5, '0')}`;
      const receipt = await tx.goodsReceipt.create({
        data: {
          refNo: grNo, supplierId: po.supplierId, note: `รับตามใบสั่งซื้อ ${po.refNo}`,
          total: lines.reduce((s, l) => s + l.qty * Number(l.item.unitCost), 0), userId,
          items: { create: lines.map((l) => ({ productId: l.item.productId, qty: l.qty, unitCost: l.item.unitCost })) },
        },
      });

      for (const l of lines) {
        await tx.product.update({ where: { id: l.item.productId }, data: { cost: l.item.unitCost } });
        await postMovement(tx, {
          productId: l.item.productId, type: 'RECEIVE', qtyDelta: l.qty, unitCost: Number(l.item.unitCost),
          refType: 'GOODS_RECEIPT', refId: receipt.id, note: `${grNo} (${po.refNo})`, userId, branchId: body.branchId ?? undefined,
        });
        await tx.purchaseOrderItem.update({ where: { id: l.item.id }, data: { receivedQty: { increment: l.qty } } });
      }

      // Recompute PO status.
      const after = await tx.purchaseOrder.findUniqueOrThrow({ where: { id }, include: { items: true } });
      const fullyReceived = after.items.every((i) => i.receivedQty >= i.qty);
      const status = fullyReceived ? 'RECEIVED' : 'PARTIAL';
      await tx.purchaseOrder.update({ where: { id }, data: { status } });
      return { refNo: grNo, status };
    });

    res.json(result);
  })
);

// --- Delete (DRAFT only) ---
purchaseOrdersRouter.delete(
  '/:id',
  requireRole('ADMIN', 'MANAGER'),
  ah(async (req, res) => {
    const po = await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: Number(req.params.id) } });
    if (po.status !== 'DRAFT') return res.status(400).json({ error: 'ลบได้เฉพาะใบสั่งซื้อแบบร่าง' });
    await prisma.purchaseOrder.delete({ where: { id: po.id } });
    res.json({ ok: true });
  })
);
