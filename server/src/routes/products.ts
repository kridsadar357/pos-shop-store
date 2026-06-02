import { Router } from 'express';
import { z } from 'zod';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import multer from 'multer';
import { prisma } from '../prisma.js';
import { ah, requireAuth, requireRole } from '../middleware/auth.js';

export const productsRouter = Router();
productsRouter.use(requireAuth);

// --- Image upload (multer disk storage under <server>/uploads) ---
const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const uploadsDir = path.resolve(__dirname, '../../uploads');
fs.mkdirSync(uploadsDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => {
      const ext = (path.extname(file.originalname) || '.png').toLowerCase();
      cb(null, `p${req.params.id}-${Date.now()}${ext}`);
    },
  }),
  limits: { fileSize: 4 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, /^image\//.test(file.mimetype)),
});

// List / search products. ?q= matches name/sku/barcode; ?lowStock=1 filters reorder.
productsRouter.get(
  '/',
  ah(async (req, res) => {
    const q = String(req.query.q || '').trim();
    const lowStock = req.query.lowStock === '1';
    // When a branch is given, report that branch's on-hand as stockQty so the POS
    // (and any branch-scoped view) sees branch availability, not the all-branch total.
    const branchId = req.query.branchId ? Number(req.query.branchId) : undefined;
    const products = await prisma.product.findMany({
      where: {
        AND: [
          q
            ? {
                OR: [
                  { name: { contains: q, mode: 'insensitive' } },
                  { sku: { contains: q, mode: 'insensitive' } },
                  { barcode: { contains: q, mode: 'insensitive' } },
                ],
              }
            : {},
        ],
      },
      include: { category: true, ...(branchId ? { branchStock: { where: { branchId } } } : {}) },
      orderBy: { name: 'asc' },
    });
    const scoped = branchId
      ? products.map(({ branchStock, ...p }: any) => ({ ...p, stockQty: branchStock?.[0]?.qty ?? 0, totalStockQty: p.stockQty }))
      : products;
    const filtered = lowStock ? scoped.filter((p: any) => p.stockQty <= p.reorderLevel) : scoped;
    res.json(filtered);
  })
);

// Lookup a single product by barcode or sku — used by the scanner.
productsRouter.get(
  '/lookup',
  ah(async (req, res) => {
    const code = String(req.query.code || '').trim();
    if (!code) return res.status(400).json({ error: 'code required' });
    const product = await prisma.product.findFirst({
      where: { isActive: true, OR: [{ barcode: code }, { sku: code }] },
      include: { category: true },
    });
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json(product);
  })
);

// Favorite / quick-pick products for the POS screen: top sellers by quantity,
// padded with other active products so there are always up to `limit` cards.
productsRouter.get(
  '/favorites',
  ah(async (req, res) => {
    const limit = Math.min(Number(req.query.limit || 10), 30);
    const grouped = await prisma.saleItem.groupBy({
      by: ['productId'],
      where: { sale: { status: 'PAID' } },
      _sum: { qty: true },
      orderBy: { _sum: { qty: 'desc' } },
      take: limit,
    });
    const topIds = grouped.map((g) => g.productId);

    const top = await prisma.product.findMany({
      where: { id: { in: topIds }, isActive: true },
      include: { category: true },
    });
    const ordered = topIds.map((id) => top.find((p) => p.id === id)).filter(Boolean) as typeof top;

    if (ordered.length < limit) {
      const fillers = await prisma.product.findMany({
        where: { isActive: true, id: { notIn: topIds } },
        include: { category: true },
        orderBy: { name: 'asc' },
        take: limit - ordered.length,
      });
      ordered.push(...fillers);
    }
    res.json(ordered);
  })
);

productsRouter.get(
  '/:id',
  ah(async (req, res) => {
    const product = await prisma.product.findUnique({
      where: { id: Number(req.params.id) },
      include: { category: true },
    });
    if (!product) return res.status(404).json({ error: 'Not found' });
    res.json(product);
  })
);

// Per-supplier purchase cost history (from goods receipts) for a product.
productsRouter.get(
  '/:id/cost-history',
  ah(async (req, res) => {
    const rows = await prisma.goodsReceiptItem.findMany({
      where: { productId: Number(req.params.id) },
      include: { receipt: { select: { refNo: true, createdAt: true, supplier: { select: { name: true } } } } },
      orderBy: { id: 'desc' },
      take: 20,
    });
    res.json(rows.map((r) => ({
      refNo: r.receipt.refNo, date: r.receipt.createdAt, supplier: r.receipt.supplier?.name ?? '—',
      qty: r.qty, unitCost: r.unitCost,
    })));
  })
);

// --- Supplier price list for a product ---
productsRouter.get(
  '/:id/suppliers',
  ah(async (req, res) => {
    const rows = await prisma.supplierProduct.findMany({
      where: { productId: Number(req.params.id) },
      include: { supplier: { select: { name: true } } },
      orderBy: [{ isPreferred: 'desc' }, { unitCost: 'asc' }],
    });
    res.json(rows.map((r) => ({ id: r.id, supplierId: r.supplierId, supplier: r.supplier.name, unitCost: r.unitCost, isPreferred: r.isPreferred, note: r.note })));
  })
);

const supplierProductSchema = z.object({
  supplierId: z.number().int(),
  unitCost: z.number().nonnegative(),
  isPreferred: z.boolean().default(false),
  note: z.string().default(''),
});

productsRouter.post(
  '/:id/suppliers',
  requireRole('ADMIN', 'MANAGER'),
  ah(async (req, res) => {
    const productId = Number(req.params.id);
    const data = supplierProductSchema.parse(req.body);
    const row = await prisma.$transaction(async (tx) => {
      if (data.isPreferred) await tx.supplierProduct.updateMany({ where: { productId }, data: { isPreferred: false } });
      return tx.supplierProduct.upsert({
        where: { supplierId_productId: { supplierId: data.supplierId, productId } },
        create: { productId, ...data },
        update: { unitCost: data.unitCost, isPreferred: data.isPreferred, note: data.note },
      });
    });
    res.status(201).json(row);
  })
);

productsRouter.delete(
  '/:id/suppliers/:supplierId',
  requireRole('ADMIN', 'MANAGER'),
  ah(async (req, res) => {
    await prisma.supplierProduct.deleteMany({ where: { productId: Number(req.params.id), supplierId: Number(req.params.supplierId) } });
    res.json({ ok: true });
  })
);

const productSchema = z.object({
  sku: z.string().min(1),
  barcode: z.string().trim().optional().nullable(),
  name: z.string().min(1),
  imageUrl: z.string().trim().optional().nullable(),
  categoryId: z.number().int().nullable().optional(),
  unit: z.string().default('pc'),
  purchaseUnit: z.string().default(''),
  unitsPerPurchase: z.number().int().positive().default(1),
  cost: z.number().nonnegative().default(0),
  retailPrice: z.number().nonnegative().default(0),
  wholesalePrice: z.number().nonnegative().default(0),
  wholesaleMinQty: z.number().int().positive().default(1),
  taxRatePct: z.number().nonnegative().nullable().optional(),
  reorderLevel: z.number().int().nonnegative().default(0),
  trackBatches: z.boolean().optional(),
  trackSerials: z.boolean().optional(),
  isActive: z.boolean().default(true),
});

productsRouter.post(
  '/',
  requireRole('ADMIN', 'MANAGER'),
  ah(async (req, res) => {
    const data = productSchema.parse(req.body);
    const product = await prisma.product.create({
      data: { ...data, barcode: data.barcode || null },
    });
    res.status(201).json(product);
  })
);

// Bulk catalog import (upsert by SKU). Category is matched by name (created if new).
// Stock is NOT touched — receive/adjust still go through the ledger.
const importRow = z.object({
  sku: z.string().trim().min(1),
  name: z.string().trim().min(1),
  barcode: z.string().trim().optional().nullable(),
  category: z.string().trim().optional(),
  unit: z.string().trim().optional(),
  cost: z.coerce.number().nonnegative().optional(),
  retailPrice: z.coerce.number().nonnegative().optional(),
  wholesalePrice: z.coerce.number().nonnegative().optional(),
  wholesaleMinQty: z.coerce.number().int().positive().optional(),
  reorderLevel: z.coerce.number().int().nonnegative().optional(),
});

productsRouter.post(
  '/import',
  requireRole('ADMIN', 'MANAGER'),
  ah(async (req, res) => {
    const rows = z.array(z.record(z.any())).max(5000).parse(req.body?.rows);
    let created = 0, updated = 0;
    const errors: { row: number; sku?: string; error: string }[] = [];
    const catCache = new Map<string, number>();
    (await prisma.category.findMany()).forEach((c) => catCache.set(c.name.toLowerCase(), c.id));

    for (let i = 0; i < rows.length; i++) {
      const parsed = importRow.safeParse(rows[i]);
      if (!parsed.success) { errors.push({ row: i + 1, sku: String(rows[i]?.sku ?? ''), error: parsed.error.issues[0]?.message ?? 'invalid' }); continue; }
      const r = parsed.data;
      try {
        let categoryId: number | null = null;
        if (r.category) {
          const key = r.category.toLowerCase();
          categoryId = catCache.get(key) ?? (await prisma.category.create({ data: { name: r.category } })).id;
          catCache.set(key, categoryId);
        }
        const fields = {
          name: r.name,
          barcode: r.barcode || null,
          ...(categoryId != null ? { categoryId } : {}),
          ...(r.unit ? { unit: r.unit } : {}),
          ...(r.cost != null ? { cost: r.cost } : {}),
          ...(r.retailPrice != null ? { retailPrice: r.retailPrice } : {}),
          ...(r.wholesalePrice != null ? { wholesalePrice: r.wholesalePrice } : {}),
          ...(r.wholesaleMinQty != null ? { wholesaleMinQty: r.wholesaleMinQty } : {}),
          ...(r.reorderLevel != null ? { reorderLevel: r.reorderLevel } : {}),
        };
        const existing = await prisma.product.findUnique({ where: { sku: r.sku }, select: { id: true } });
        await prisma.product.upsert({ where: { sku: r.sku }, create: { sku: r.sku, ...fields }, update: fields });
        if (existing) updated++; else created++;
      } catch (e) {
        errors.push({ row: i + 1, sku: r.sku, error: (e as Error).message.split('\n')[0] });
      }
    }
    res.json({ created, updated, errors, total: rows.length });
  })
);

productsRouter.put(
  '/:id',
  requireRole('ADMIN', 'MANAGER'),
  ah(async (req, res) => {
    const data = productSchema.partial().parse(req.body);
    const product = await prisma.product.update({
      where: { id: Number(req.params.id) },
      data: { ...data, barcode: data.barcode === undefined ? undefined : data.barcode || null },
    });
    res.json(product);
  })
);

// --- Lot/expiry batches for a product (open batches first) ---
productsRouter.get(
  '/:id/batches',
  ah(async (req, res) => {
    const batches = await prisma.productBatch.findMany({
      where: { productId: Number(req.params.id) },
      orderBy: [{ qtyRemaining: 'desc' }, { expiryDate: 'asc' }, { id: 'asc' }],
      take: 200,
    });
    res.json(batches);
  })
);

// Record an opening / manual batch WITHOUT a stock movement (the on-hand already
// exists — this just attributes it to a lot/expiry). Use after enabling tracking.
productsRouter.post(
  '/:id/batches',
  requireRole('ADMIN', 'MANAGER'),
  ah(async (req, res) => {
    const { branchId, lotNo, expiryDate, qty } = z
      .object({ branchId: z.number().int().nullable().optional(), lotNo: z.string().default(''), expiryDate: z.string().datetime().nullable().optional(), qty: z.number().int().positive() })
      .parse(req.body);
    const productId = Number(req.params.id);
    const product = await prisma.product.findUniqueOrThrow({ where: { id: productId }, select: { trackBatches: true } });
    if (!product.trackBatches) return res.status(400).json({ error: 'สินค้านี้ยังไม่ได้เปิดติดตามล็อต/วันหมดอายุ' });
    const bId = branchId ?? (await prisma.branch.findFirst({ where: { isDefault: true } }))?.id ?? null;
    const batch = await prisma.productBatch.create({
      data: { productId, branchId: bId, lotNo, expiryDate: expiryDate ? new Date(expiryDate) : null, qtyReceived: qty, qtyRemaining: qty },
    });
    res.status(201).json(batch);
  })
);

// --- Serial numbers for a serial-tracked product ---
productsRouter.get(
  '/:id/serials',
  ah(async (req, res) => {
    const status = req.query.status ? String(req.query.status) : undefined;
    const q = String(req.query.q || '').trim();
    const serials = await prisma.productSerial.findMany({
      where: { productId: Number(req.params.id), status, ...(q ? { serialNo: { contains: q, mode: 'insensitive' } } : {}) },
      orderBy: [{ status: 'asc' }, { id: 'desc' }],
      take: 500,
    });
    res.json(serials);
  })
);

// Cross-product serial lookup (warranty desk / serial report). Search by serial
// number or product name/sku, optionally filter by status. Resolves the sale
// order number for sold units.
productsRouter.get(
  '/serials/search',
  ah(async (req, res) => {
    const q = String(req.query.q || '').trim();
    const status = req.query.status ? String(req.query.status) : undefined;
    const serials = await prisma.productSerial.findMany({
      where: {
        ...(status ? { status } : {}),
        ...(q
          ? { OR: [
              { serialNo: { contains: q, mode: 'insensitive' } },
              { product: { is: { name: { contains: q, mode: 'insensitive' } } } },
              { product: { is: { sku: { contains: q, mode: 'insensitive' } } } },
            ] }
          : {}),
      },
      include: { product: { select: { name: true, sku: true } } },
      orderBy: [{ id: 'desc' }],
      take: 300,
    });
    const saleIds = [...new Set(serials.map((s) => s.saleId).filter((x): x is number => x != null))];
    const sales = saleIds.length
      ? await prisma.sale.findMany({ where: { id: { in: saleIds } }, select: { id: true, orderNo: true } })
      : [];
    const orderNoById = new Map(sales.map((s) => [s.id, s.orderNo]));
    res.json(serials.map((s) => ({ ...s, orderNo: s.saleId != null ? orderNoById.get(s.saleId) ?? null : null })));
  })
);

// Manually register serial numbers (e.g. opening stock or correction).
productsRouter.post(
  '/:id/serials',
  requireRole('ADMIN', 'MANAGER'),
  ah(async (req, res) => {
    const { serials } = z.object({ serials: z.array(z.string()).min(1) }).parse(req.body);
    const productId = Number(req.params.id);
    const product = await prisma.product.findUniqueOrThrow({ where: { id: productId }, select: { trackSerials: true } });
    if (!product.trackSerials) return res.status(400).json({ error: 'สินค้านี้ยังไม่ได้เปิดติดตามหมายเลขซีเรียล' });
    const branchId = (await prisma.branch.findFirst({ where: { isDefault: true } }))?.id ?? null;
    const clean = [...new Set(serials.map((s) => s.trim()).filter(Boolean))];
    const r = await prisma.productSerial.createMany({
      data: clean.map((serialNo) => ({ productId, branchId, serialNo, status: 'IN_STOCK', receivedRef: 'manual' })),
      skipDuplicates: true,
    });
    res.status(201).json({ added: r.count });
  })
);

// Update a serial's status (IN_STOCK | SOLD | RETURNED).
productsRouter.put(
  '/serials/:serialId',
  requireRole('ADMIN', 'MANAGER'),
  ah(async (req, res) => {
    const { status } = z.object({ status: z.enum(['IN_STOCK', 'SOLD', 'RETURNED']) }).parse(req.body);
    const serial = await prisma.productSerial.update({
      where: { id: Number(req.params.serialId) },
      data: { status, soldAt: status === 'SOLD' ? new Date() : null },
    });
    res.json(serial);
  })
);

// Upload a product image (multipart field "image"). Returns the saved URL.
productsRouter.post(
  '/:id/image',
  requireRole('ADMIN', 'MANAGER'),
  upload.single('image'),
  ah(async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No image uploaded' });
    const imageUrl = `/uploads/${req.file.filename}`;
    const product = await prisma.product.update({
      where: { id: Number(req.params.id) },
      data: { imageUrl },
    });
    res.json(product);
  })
);
