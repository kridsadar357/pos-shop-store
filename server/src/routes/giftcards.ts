import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { ah, requireAuth, requireRole } from '../middleware/auth.js';
import { postGift } from '../lib/giftcard.js';

export const giftCardsRouter = Router();
giftCardsRouter.use(requireAuth);

// List gift cards (management).
giftCardsRouter.get(
  '/',
  ah(async (req, res) => {
    const q = String(req.query.q || '').trim();
    const cards = await prisma.giftCard.findMany({
      where: q ? { OR: [{ code: { contains: q, mode: 'insensitive' } }, { note: { contains: q, mode: 'insensitive' } }] } : {},
      orderBy: { id: 'desc' },
      take: 300,
    });
    res.json(cards);
  })
);

// Look up a card by code (used by the POS to validate / show balance).
giftCardsRouter.get(
  '/:code',
  ah(async (req, res) => {
    const card = await prisma.giftCard.findUnique({ where: { code: req.params.code.trim().toUpperCase() } });
    if (!card) return res.status(404).json({ error: 'ไม่พบบัตรของขวัญนี้' });
    res.json(card);
  })
);

// Transaction history for a card.
giftCardsRouter.get(
  '/:id/txns',
  ah(async (req, res) => {
    const txns = await prisma.giftCardTxn.findMany({ where: { giftCardId: Number(req.params.id) }, orderBy: { id: 'desc' }, take: 100 });
    res.json(txns);
  })
);

// Issue a new gift card with an opening balance.
giftCardsRouter.post(
  '/',
  requireRole('ADMIN', 'MANAGER'),
  ah(async (req, res) => {
    const { code, amount, note, expiresAt } = z
      .object({ code: z.string().trim().min(3).optional(), amount: z.number().positive(), note: z.string().default(''), expiresAt: z.string().datetime().nullable().optional() })
      .parse(req.body);
    const finalCode = (code || `GC${Date.now().toString(36).toUpperCase()}`).toUpperCase();
    const card = await prisma.$transaction(async (tx) => {
      const created = await tx.giftCard.create({
        data: { code: finalCode, initialBalance: amount, balance: 0, note, expiresAt: expiresAt ? new Date(expiresAt) : null },
      });
      await postGift(tx, { giftCardId: created.id, type: 'ISSUE', amount, note: 'ออกบัตร', userId: req.user!.id });
      return tx.giftCard.findUniqueOrThrow({ where: { id: created.id } });
    });
    res.status(201).json(card);
  })
);

// Reload (top up) a card.
giftCardsRouter.post(
  '/:id/reload',
  requireRole('ADMIN', 'MANAGER'),
  ah(async (req, res) => {
    const { amount, note } = z.object({ amount: z.number().positive(), note: z.string().default('') }).parse(req.body);
    const id = Number(req.params.id);
    const card = await prisma.$transaction(async (tx) => {
      await postGift(tx, { giftCardId: id, type: 'RELOAD', amount, note: note || 'เติมเงิน', userId: req.user!.id });
      return tx.giftCard.findUniqueOrThrow({ where: { id } });
    });
    res.json(card);
  })
);

// Enable / disable a card.
giftCardsRouter.put(
  '/:id',
  requireRole('ADMIN', 'MANAGER'),
  ah(async (req, res) => {
    const { isActive, note } = z.object({ isActive: z.boolean().optional(), note: z.string().optional() }).parse(req.body);
    const card = await prisma.giftCard.update({ where: { id: Number(req.params.id) }, data: { isActive, note } });
    res.json(card);
  })
);
