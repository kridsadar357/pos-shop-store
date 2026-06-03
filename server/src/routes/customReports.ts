import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { ah, requireAuth, requireRole } from '../middleware/auth.js';
import {
  DIMENSIONS,
  METRICS,
  normalizeConfig,
  runCustomReport,
  type ReportFact,
} from '../lib/customReport.js';

export const customReportsRouter = Router();
customReportsRouter.use(requireAuth, requireRole('ADMIN', 'MANAGER'));

const PAYMENT_LABELS: Record<string, string> = {
  CASH: 'เงินสด',
  TRANSFER: 'โอน/พร้อมเพย์',
  CARD: 'บัตร',
  CREDIT: 'เงินเชื่อ',
  POINTS: 'แต้มสะสม',
  GIFT: 'บัตรของขวัญ',
};

// Available dimensions + metrics, so the builder UI can render its pickers from the server.
customReportsRouter.get(
  '/meta',
  ah(async (_req, res) => {
    res.json({ dimensions: DIMENSIONS, metrics: METRICS });
  })
);

// Run an ad-hoc report: load PAID sale items in range/branch, flatten to facts, aggregate.
customReportsRouter.post(
  '/run',
  ah(async (req, res) => {
    const body = z
      .object({
        from: z.string().optional(),
        to: z.string().optional(),
        branchId: z.number().int().nullable().optional(),
        config: z.unknown(),
      })
      .parse(req.body);

    const from = body.from ? new Date(body.from) : new Date(Date.now() - 30 * 864e5);
    const to = body.to ? new Date(body.to) : new Date();
    const branchId = body.branchId ?? undefined;
    const config = normalizeConfig(body.config);

    const items = await prisma.saleItem.findMany({
      where: { sale: { status: 'PAID', branchId, createdAt: { gte: from, lte: to } } },
      select: {
        qty: true,
        lineTotal: true,
        unitCost: true,
        product: { select: { category: { select: { name: true } } } },
        nameSnapshot: true,
        sale: {
          select: {
            id: true,
            createdAt: true,
            type: true,
            paymentMethod: true,
            cashier: { select: { name: true } },
            branch: { select: { name: true } },
            member: { select: { name: true } },
          },
        },
      },
    });

    const facts: ReportFact[] = items.map((i) => ({
      saleId: i.sale.id,
      day: i.sale.createdAt.toISOString().slice(0, 10),
      branch: i.sale.branch?.name ?? 'ไม่ระบุสาขา',
      cashier: i.sale.cashier?.name ?? '—',
      paymentMethod: PAYMENT_LABELS[i.sale.paymentMethod] ?? i.sale.paymentMethod,
      type: i.sale.type === 'WHOLESALE' ? 'ขายส่ง' : 'ขายปลีก',
      category: i.product?.category?.name ?? 'ไม่ระบุหมวด',
      product: i.nameSnapshot,
      member: i.sale.member?.name ?? 'ลูกค้าทั่วไป',
      qty: i.qty,
      sales: Number(i.lineTotal ?? 0),
      cost: Number(i.unitCost ?? 0) * i.qty,
    }));

    const result = runCustomReport(facts, config);
    res.json({ from, to, branchId: branchId ?? null, config, ...result });
  })
);

// --- Saved report definitions (CRUD) ---

const defSchema = z.object({
  name: z.string().trim().min(1).max(80),
  config: z.unknown(),
});

customReportsRouter.get(
  '/',
  ah(async (_req, res) => {
    const rows = await prisma.savedReport.findMany({
      orderBy: { updatedAt: 'desc' },
      include: { createdBy: { select: { name: true } } },
    });
    res.json(
      rows.map((r) => ({
        id: r.id,
        name: r.name,
        config: JSON.parse(r.config),
        createdBy: r.createdBy?.name ?? null,
        updatedAt: r.updatedAt,
      }))
    );
  })
);

customReportsRouter.post(
  '/',
  ah(async (req, res) => {
    const { name, config } = defSchema.parse(req.body);
    const normalized = normalizeConfig(config); // validate before persisting
    const exists = await prisma.savedReport.findUnique({ where: { name } });
    if (exists) return res.status(409).json({ error: 'มีรายงานชื่อนี้อยู่แล้ว' });
    const row = await prisma.savedReport.create({
      data: { name, config: JSON.stringify(normalized), createdById: req.user!.id },
    });
    res.status(201).json({ id: row.id, name: row.name, config: normalized });
  })
);

customReportsRouter.put(
  '/:id',
  ah(async (req, res) => {
    const id = Number(req.params.id);
    const { name, config } = defSchema.parse(req.body);
    const normalized = normalizeConfig(config);
    const clash = await prisma.savedReport.findFirst({ where: { name, id: { not: id } } });
    if (clash) return res.status(409).json({ error: 'มีรายงานชื่อนี้อยู่แล้ว' });
    const row = await prisma.savedReport.update({
      where: { id },
      data: { name, config: JSON.stringify(normalized) },
    });
    res.json({ id: row.id, name: row.name, config: normalized });
  })
);

customReportsRouter.delete(
  '/:id',
  ah(async (req, res) => {
    await prisma.savedReport.delete({ where: { id: Number(req.params.id) } });
    res.json({ ok: true });
  })
);
