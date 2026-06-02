import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { ah, requireAuth, requireRole } from '../middleware/auth.js';
import { nextSeq } from '../lib/stock.js';

export const taxInvoicesRouter = Router();
taxInvoicesRouter.use(requireAuth);

const num = (d: unknown) => Number(d ?? 0);
const round2 = (n: number) => Math.round(n * 100) / 100;

// Tax-invoice register (for VAT filing): all issued invoices with VAT base/amount.
taxInvoicesRouter.get(
  '/',
  requireRole('ADMIN', 'MANAGER'),
  ah(async (req, res) => {
    const from = req.query.from ? new Date(String(req.query.from)) : undefined;
    const to = req.query.to ? new Date(String(req.query.to)) : undefined;
    const setting = await prisma.setting.findUniqueOrThrow({ where: { id: 1 } });
    const rate = num(setting.taxRatePct);
    const rows = await prisma.taxInvoice.findMany({
      where: { issuedAt: { gte: from, lte: to } },
      orderBy: { id: 'desc' },
      take: 1000,
      include: { sale: { select: { orderNo: true, total: true } } },
    });
    res.json(rows.map((t) => {
      const total = num(t.sale?.total);
      const base = round2(total / (1 + rate / 100));
      const vat = round2(total - base);
      return {
        id: t.id, number: t.number, issuedAt: t.issuedAt, orderNo: t.sale?.orderNo ?? '',
        buyerName: t.buyerName, buyerTaxId: t.buyerTaxId, buyerBranch: t.buyerBranch,
        base, vat, total: round2(total),
      };
    }));
  })
);

// Fetch the tax invoice for a sale (404 if none issued yet).
taxInvoicesRouter.get(
  '/sale/:saleId',
  ah(async (req, res) => {
    const ti = await prisma.taxInvoice.findUnique({ where: { saleId: Number(req.params.saleId) } });
    if (!ti) return res.status(404).json({ error: 'ยังไม่ได้ออกใบกำกับภาษี' });
    res.json(ti);
  })
);

// Issue a full tax invoice for a sale (idempotent — returns the existing one if any).
taxInvoicesRouter.post(
  '/sale/:saleId',
  requireRole('ADMIN', 'MANAGER'),
  ah(async (req, res) => {
    const { buyerName, buyerTaxId, buyerAddress, buyerBranch } = z
      .object({ buyerName: z.string().min(1), buyerTaxId: z.string().default(''), buyerAddress: z.string().default(''), buyerBranch: z.string().default('') })
      .parse(req.body);
    const saleId = Number(req.params.saleId);

    const existing = await prisma.taxInvoice.findUnique({ where: { saleId } });
    if (existing) return res.json(existing);

    const sale = await prisma.sale.findUnique({ where: { id: saleId } });
    if (!sale) return res.status(404).json({ error: 'Sale not found' });
    if (sale.status !== 'PAID') return res.status(400).json({ error: 'ออกใบกำกับภาษีได้เฉพาะบิลที่ชำระแล้ว' });

    const ti = await prisma.$transaction(async (tx) => {
      const seq = await nextSeq(tx, 'tax_invoice');
      return tx.taxInvoice.create({
        data: { number: `TIV-${String(seq).padStart(6, '0')}`, saleId, buyerName, buyerTaxId, buyerAddress, buyerBranch, userId: req.user!.id },
      });
    });
    res.status(201).json(ti);
  })
);
