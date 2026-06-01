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

const productSchema = z.object({
  sku: z.string().min(1),
  barcode: z.string().trim().optional().nullable(),
  name: z.string().min(1),
  imageUrl: z.string().trim().optional().nullable(),
  categoryId: z.number().int().nullable().optional(),
  unit: z.string().default('pc'),
  cost: z.number().nonnegative().default(0),
  retailPrice: z.number().nonnegative().default(0),
  wholesalePrice: z.number().nonnegative().default(0),
  wholesaleMinQty: z.number().int().positive().default(1),
  taxRatePct: z.number().nonnegative().nullable().optional(),
  reorderLevel: z.number().int().nonnegative().default(0),
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
