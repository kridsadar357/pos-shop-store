import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { ah, requireAuth, requireRole } from '../middleware/auth.js';
import { buildPromptPayPayload, type PromptPayType } from '../lib/promptpay.js';

export const settingsRouter = Router();
settingsRouter.use(requireAuth);

settingsRouter.get(
  '/',
  ah(async (_req, res) => {
    const setting = await prisma.setting.findUniqueOrThrow({ where: { id: 1 } });
    res.json(setting);
  })
);

const schema = z.object({
  storeName: z.string().min(1),
  address: z.string().default(''),
  phone: z.string().default(''),
  taxId: z.string().default(''),
  promptPayId: z.string().default(''),
  promptPayType: z.enum(['MSISDN', 'NATID', 'EWALLET']).default('MSISDN'),
  currency: z.string().default('THB'),
  taxRatePct: z.number().nonnegative().default(7),
  taxInclusive: z.boolean().default(true),
  receiptFooter: z.string().default(''),
  memberGetsWholesale: z.boolean().default(true),
});

settingsRouter.put(
  '/',
  requireRole('ADMIN', 'MANAGER'),
  ah(async (req, res) => {
    const data = schema.partial().parse(req.body);
    const setting = await prisma.setting.update({ where: { id: 1 }, data });
    res.json(setting);
  })
);

// Generate a PromptPay QR payload on demand (preview / re-display).
settingsRouter.get(
  '/promptpay',
  ah(async (req, res) => {
    const amount = req.query.amount ? Number(req.query.amount) : undefined;
    const setting = await prisma.setting.findUniqueOrThrow({ where: { id: 1 } });
    if (!setting.promptPayId) return res.status(400).json({ error: 'PromptPay ID not configured' });
    const payload = buildPromptPayPayload({
      id: setting.promptPayId,
      type: setting.promptPayType as PromptPayType,
      amount,
    });
    res.json({ payload, promptPayId: setting.promptPayId });
  })
);
