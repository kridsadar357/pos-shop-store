import { Router } from 'express';
import os from 'node:os';
import path from 'node:path';
import multer from 'multer';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { ah, requireAuth, requireRole } from '../middleware/auth.js';
import { buildPromptPayPayload, type PromptPayType } from '../lib/promptpay.js';
import { resolvedSettings } from '../lib/branchSettings.js';
import { uploadsDir } from './products.js';

export const settingsRouter = Router();
settingsRouter.use(requireAuth);

const logoUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadsDir),
    filename: (_req, file, cb) => cb(null, `logo-${Date.now()}${(path.extname(file.originalname) || '.png').toLowerCase()}`),
  }),
  limits: { fileSize: 3 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, /^image\//.test(file.mimetype)),
});

settingsRouter.get(
  '/',
  ah(async (_req, res) => {
    const setting = await prisma.setting.findUniqueOrThrow({ where: { id: 1 } });
    res.json(setting);
  })
);

// Global settings merged with a branch's per-branch overrides.
settingsRouter.get(
  '/resolved',
  ah(async (req, res) => {
    const branchId = req.query.branchId ? Number(req.query.branchId) : null;
    res.json(await resolvedSettings(branchId));
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
  // Loyalty points
  loyaltyEnabled: z.boolean().default(false),
  pointsEarnBaht: z.number().nonnegative().default(25),
  pointsRedeemValue: z.number().nonnegative().default(1),
  // Receipt design
  receiptLogoUrl: z.string().nullable().optional(),
  receiptHeader: z.string().default(''),
  receiptShowQR: z.boolean().default(true),
  // Printer
  printerType: z.enum(['BROWSER', 'ESCPOS_NET', 'ESCPOS_USB']).default('BROWSER'),
  printerAddress: z.string().default(''),
  printerPaper: z.enum(['58mm', '80mm']).default('80mm'),
  escposCodepage: z.number().int().min(0).max(255).default(21),
  openDrawerOnCash: z.boolean().default(true),
  // Granular access (JSON array of allowed back-office page paths for MANAGER).
  managerPages: z.string().default(''),
  // Secondary display currency (approx. conversion).
  secondaryCurrency: z.string().default(''),
  secondaryRate: z.number().nonnegative().default(0),
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

// Upload a receipt logo; stores it under /uploads and saves the path.
settingsRouter.post(
  '/logo',
  requireRole('ADMIN', 'MANAGER'),
  logoUpload.single('image'),
  ah(async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file' });
    const url = `/uploads/${req.file.filename}`;
    const setting = await prisma.setting.update({ where: { id: 1 }, data: { receiptLogoUrl: url } });
    res.json(setting);
  })
);

// LAN addresses so the customer-display tab can build a scannable URL.
settingsRouter.get(
  '/network',
  ah(async (_req, res) => {
    const ips: string[] = [];
    for (const ifaces of Object.values(os.networkInterfaces())) {
      for (const i of ifaces || []) {
        if (i.family === 'IPv4' && !i.internal) ips.push(i.address);
      }
    }
    res.json({ lanIps: ips, hostname: os.hostname() });
  })
);

// Generate a PromptPay QR payload on demand (preview / re-display).
settingsRouter.get(
  '/promptpay',
  ah(async (req, res) => {
    const amount = req.query.amount ? Number(req.query.amount) : undefined;
    const branchId = req.query.branchId ? Number(req.query.branchId) : null;
    const setting = await resolvedSettings(branchId);
    if (!setting.promptPayId) return res.status(400).json({ error: 'PromptPay ID not configured' });
    const payload = buildPromptPayPayload({
      id: setting.promptPayId,
      type: setting.promptPayType as PromptPayType,
      amount,
    });
    res.json({ payload, promptPayId: setting.promptPayId });
  })
);
