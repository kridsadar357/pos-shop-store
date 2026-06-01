import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { ah } from '../middleware/auth.js';
import { verifyLicense, DEMO_DAYS } from '../lib/license.js';

export const setupRouter = Router();

/** Is first-run setup done? Public — drives the wizard redirect in the SPA. */
setupRouter.get(
  '/status',
  ah(async (_req, res) => {
    const setting = await prisma.setting.findUnique({ where: { id: 1 } });
    const users = await prisma.user.count();
    res.json({ setupCompleted: !!setting?.setupCompleted, hasUsers: users > 0 });
  })
);

/** Test the database connection (the live server connection). */
setupRouter.post(
  '/test-db',
  ah(async (req, res) => {
    const t0 = Date.now();
    try {
      const rows = await prisma.$queryRawUnsafe<any[]>('SELECT version() as version');
      res.json({ ok: true, ms: Date.now() - t0, version: String(rows?.[0]?.version || '').split(' ').slice(0, 2).join(' '), echo: req.body ?? {} });
    } catch (e) {
      res.status(400).json({ ok: false, error: (e as Error).message });
    }
  })
);

const completeSchema = z.object({
  shop: z.object({
    storeName: z.string().min(1),
    address: z.string().default(''),
    phone: z.string().default(''),
    taxId: z.string().default(''),
    promptPayId: z.string().default(''),
    promptPayType: z.enum(['MSISDN', 'NATID', 'EWALLET']).default('MSISDN'),
    currency: z.string().default('THB'),
    taxRatePct: z.number().nonnegative().default(7),
    taxInclusive: z.boolean().default(true),
  }),
  admin: z.object({
    username: z.string().min(1),
    name: z.string().min(1),
    password: z.string().min(4),
  }),
  license: z.object({
    mode: z.enum(['activate', 'demo', 'skip']).default('skip'),
    key: z.string().optional(),
  }).default({ mode: 'skip' }),
});

setupRouter.post(
  '/complete',
  ah(async (req, res) => {
    const existing = await prisma.setting.findUnique({ where: { id: 1 } });
    if (existing?.setupCompleted) return res.status(409).json({ error: 'ติดตั้งระบบเรียบร้อยแล้ว' });

    const data = completeSchema.parse(req.body);

    // 1) License first (so we can fail fast on a bad key before mutating).
    let licenseStatus = 'INACTIVE';
    let licenseMsg = 'ยังไม่ได้เปิดใช้งานไลเซนส์';
    if (data.license.mode === 'activate') {
      const r = await verifyLicense(data.license.key || '');
      if (!r.ok) return res.status(400).json({ error: r.message });
      await prisma.license.upsert({
        where: { id: 1 },
        create: { id: 1, key: data.license.key || '', status: 'ACTIVE', plan: r.plan ?? '', customer: r.customer ?? '', activatedAt: new Date(), expiresAt: r.expiresAt ?? null, lastCheckedAt: new Date(), raw: r.raw },
        update: { key: data.license.key || '', status: 'ACTIVE', plan: r.plan ?? '', customer: r.customer ?? '', activatedAt: new Date(), expiresAt: r.expiresAt ?? null, lastCheckedAt: new Date(), raw: r.raw },
      });
      licenseStatus = 'ACTIVE';
      licenseMsg = r.message;
    } else if (data.license.mode === 'demo') {
      const now = new Date();
      await prisma.license.upsert({
        where: { id: 1 },
        create: { id: 1, status: 'DEMO', plan: `ทดลองใช้ ${DEMO_DAYS} วัน`, demoStartedAt: now, expiresAt: new Date(now.getTime() + DEMO_DAYS * 86_400_000) },
        update: { status: 'DEMO', plan: `ทดลองใช้ ${DEMO_DAYS} วัน`, demoStartedAt: now, expiresAt: new Date(now.getTime() + DEMO_DAYS * 86_400_000) },
      });
      licenseStatus = 'DEMO';
      licenseMsg = `เริ่มทดลองใช้ ${DEMO_DAYS} วัน`;
    }

    // 2) Shop settings (upsert the singleton, mark setup complete).
    await prisma.setting.upsert({
      where: { id: 1 },
      create: { id: 1, ...data.shop, setupCompleted: true },
      update: { ...data.shop, setupCompleted: true },
    });

    // 3) Admin account (create or promote/reset).
    const passwordHash = await bcrypt.hash(data.admin.password, 10);
    await prisma.user.upsert({
      where: { username: data.admin.username },
      create: { username: data.admin.username, name: data.admin.name, role: 'ADMIN', passwordHash },
      update: { name: data.admin.name, role: 'ADMIN', passwordHash, isActive: true },
    });

    res.json({ ok: true, licenseStatus, licenseMsg });
  })
);
