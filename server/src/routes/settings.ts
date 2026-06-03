import { Router } from 'express';
import os from 'node:os';
import path from 'node:path';
import multer from 'multer';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { ah, requireAuth, requireRole } from '../middleware/auth.js';
import { buildPromptPayPayload, type PromptPayType } from '../lib/promptpay.js';
import { resolvedSettings } from '../lib/branchSettings.js';
import { sendMail } from '../lib/mailer.js';
import { sendSms } from '../lib/sms.js';
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
    // Never expose secrets (SMTP password / SMS API key); signal whether each is set instead.
    const { smtpPass, smsApiKey, ...safe } = setting;
    res.json({ ...safe, smtpPassSet: !!smtpPass, smsApiKeySet: !!smsApiKey });
  })
);

// Global settings merged with a branch's per-branch overrides. This is what the POS
// front-end fetches, so strip the secrets (SMTP password / SMS API key) like GET '/'.
settingsRouter.get(
  '/resolved',
  ah(async (req, res) => {
    const branchId = req.query.branchId ? Number(req.query.branchId) : null;
    const { smtpPass, smsApiKey, ...safe } = await resolvedSettings(branchId);
    res.json({ ...safe, smtpPassSet: !!smtpPass, smsApiKeySet: !!smsApiKey });
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
  // VFD customer pole display
  vfdEnabled: z.boolean().default(false),
  vfdAddress: z.string().default(''),
  // Granular access (JSON array of allowed back-office page paths for MANAGER).
  managerPages: z.string().default(''),
  // Secondary display currency (approx. conversion).
  secondaryCurrency: z.string().default(''),
  secondaryRate: z.number().nonnegative().default(0),
  // Outgoing email (SMTP).
  smtpHost: z.string().default(''),
  smtpPort: z.number().int().min(1).max(65535).default(587),
  smtpSecure: z.boolean().default(false),
  smtpUser: z.string().default(''),
  smtpPass: z.string().default(''),
  smtpFrom: z.string().default(''),
  // Scheduled daily report email (reportEmailLastSent is internal — not settable here).
  reportEmailEnabled: z.boolean().default(false),
  reportEmailTo: z.string().default(''),
  reportEmailHour: z.number().int().min(0).max(23).default(8),
  // SMS gateway
  smsApiUrl: z.string().default(''),
  smsApiKey: z.string().default(''),
  smsSender: z.string().default(''),
  autoReceiptEmail: z.boolean().default(false),
  autoReceiptSms: z.boolean().default(false),
  cashierMaxDiscountPct: z.number().int().min(0).max(100).default(100),
});

settingsRouter.put(
  '/',
  requireRole('ADMIN', 'MANAGER'),
  ah(async (req, res) => {
    const data = schema.partial().parse(req.body);
    // An empty secret means "leave the stored value unchanged".
    if (data.smtpPass === '') delete data.smtpPass;
    if (data.smsApiKey === '') delete data.smsApiKey;
    const setting = await prisma.setting.update({ where: { id: 1 }, data });
    const { smtpPass, smsApiKey, ...safe } = setting;
    res.json({ ...safe, smtpPassSet: !!smtpPass, smsApiKeySet: !!smsApiKey });
  })
);

// Send a test email to verify the SMTP configuration.
settingsRouter.post(
  '/email-test',
  requireRole('ADMIN', 'MANAGER'),
  ah(async (req, res) => {
    const { to } = z.object({ to: z.string().email('อีเมลไม่ถูกต้อง') }).parse(req.body);
    const s = await prisma.setting.findUniqueOrThrow({ where: { id: 1 } });
    const { messageId } = await sendMail(
      { smtpHost: s.smtpHost, smtpPort: s.smtpPort, smtpSecure: s.smtpSecure, smtpUser: s.smtpUser, smtpPass: s.smtpPass, smtpFrom: s.smtpFrom, storeName: s.storeName },
      {
        to,
        subject: `ทดสอบอีเมลจาก ${s.storeName}`,
        html: `<p>นี่คืออีเมลทดสอบจากระบบ POS ของ <b>${s.storeName}</b> — การตั้งค่า SMTP ใช้งานได้แล้ว ✓</p>`,
        text: `อีเมลทดสอบจาก ${s.storeName} — การตั้งค่า SMTP ใช้งานได้แล้ว`,
      }
    );
    res.json({ ok: true, to, messageId });
  })
);

// Send a test SMS to confirm the gateway config.
settingsRouter.post(
  '/sms-test',
  requireRole('ADMIN', 'MANAGER'),
  ah(async (req, res) => {
    const { to } = z.object({ to: z.string().trim().min(1, 'ระบุเบอร์โทร') }).parse(req.body);
    const s = await prisma.setting.findUniqueOrThrow({ where: { id: 1 } });
    await sendSms(
      { smsApiUrl: s.smsApiUrl, smsApiKey: s.smsApiKey, smsSender: s.smsSender },
      { to, message: `ทดสอบ SMS จาก ${s.storeName} — การตั้งค่าเกตเวย์ใช้งานได้แล้ว` }
    );
    res.json({ ok: true, to });
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
    const updated = await prisma.setting.update({ where: { id: 1 }, data: { receiptLogoUrl: url } });
    const { smtpPass, smsApiKey, ...safe } = updated; // never return the secrets (matches GET '/')
    res.json({ ...safe, smtpPassSet: !!smtpPass, smsApiKeySet: !!smsApiKey });
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
