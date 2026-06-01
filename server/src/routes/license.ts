import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { ah, requireAuth, requireRole } from '../middleware/auth.js';
import { verifyLicense, computeLicenseState, DEMO_DAYS } from '../lib/license.js';

export const licenseRouter = Router();

async function getLicense() {
  return prisma.license.findUnique({ where: { id: 1 } });
}

/** Public license state — used by the login/app shell to show the demo banner. */
licenseRouter.get(
  '/status',
  ah(async (_req, res) => {
    const lic = await getLicense();
    const state = computeLicenseState(lic);
    res.json({ ...state, plan: lic?.plan ?? '', key: lic?.key ?? '', demoDays: DEMO_DAYS });
  })
);

// Everything below requires an admin.
licenseRouter.use(requireAuth, requireRole('ADMIN'));

licenseRouter.get(
  '/',
  ah(async (_req, res) => {
    const lic = await getLicense();
    res.json({ ...lic, ...computeLicenseState(lic) });
  })
);

const activateSchema = z.object({ key: z.string().min(1) });

licenseRouter.post(
  '/activate',
  ah(async (req, res) => {
    const { key } = activateSchema.parse(req.body);
    const result = await verifyLicense(key);
    if (!result.ok) return res.status(400).json({ error: result.message, raw: result.raw });

    const lic = await prisma.license.upsert({
      where: { id: 1 },
      create: {
        id: 1, key, status: 'ACTIVE', plan: result.plan ?? '', customer: result.customer ?? '',
        activatedAt: new Date(), expiresAt: result.expiresAt ?? null, lastCheckedAt: new Date(), raw: result.raw,
      },
      update: {
        key, status: 'ACTIVE', plan: result.plan ?? '', customer: result.customer ?? '',
        activatedAt: new Date(), expiresAt: result.expiresAt ?? null, lastCheckedAt: new Date(), raw: result.raw,
      },
    });
    res.json({ ...lic, ...computeLicenseState(lic), message: result.message });
  })
);

licenseRouter.post(
  '/demo',
  ah(async (_req, res) => {
    const existing = await getLicense();
    if (existing?.demoStartedAt) {
      return res.status(400).json({ error: 'เริ่มทดลองใช้ไปแล้ว ไม่สามารถเริ่มใหม่ได้' });
    }
    const now = new Date();
    const expiresAt = new Date(now.getTime() + DEMO_DAYS * 86_400_000);
    const lic = await prisma.license.upsert({
      where: { id: 1 },
      create: { id: 1, status: 'DEMO', plan: `ทดลองใช้ ${DEMO_DAYS} วัน`, demoStartedAt: now, expiresAt },
      update: { status: 'DEMO', plan: `ทดลองใช้ ${DEMO_DAYS} วัน`, demoStartedAt: now, expiresAt },
    });
    res.json({ ...lic, ...computeLicenseState(lic) });
  })
);
