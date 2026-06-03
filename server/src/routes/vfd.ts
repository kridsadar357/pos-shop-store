import { Router } from 'express';
import { z } from 'zod';
import { ah, requireAuth, requireRole } from '../middleware/auth.js';
import { resolvedSettings } from '../lib/branchSettings.js';
import { buildVfdFromState, buildVfdTest, parseVfdAddress, sendToVfd, type VfdState } from '../lib/vfd.js';

export const vfdRouter = Router();
vfdRouter.use(requireAuth);

const stateSchema = z.object({
  status: z.enum(['IDLE', 'CART', 'PAYMENT', 'PAID']),
  storeName: z.string().optional(),
  items: z.array(z.object({ name: z.string(), qty: z.number(), unitPrice: z.number(), lineTotal: z.number() })).optional(),
  total: z.number().optional(),
  change: z.number().optional(),
});

async function resolveVfd(branchId?: number | null) {
  const setting = await resolvedSettings(branchId);
  if (!setting.vfdEnabled) return { error: 'ยังไม่ได้เปิดใช้งานจอแสดงผลลูกค้า (VFD)' as const };
  const addr = parseVfdAddress(setting.vfdAddress);
  if (!addr) return { error: 'ยังไม่ได้ตั้งค่าที่อยู่จอแสดงผล (IP:Port)' as const };
  return { setting, addr };
}

/** Push the current POS state to the configured VFD pole display (fire from the POS). */
vfdRouter.post(
  '/display',
  ah(async (req, res) => {
    const body = z.object({ branchId: z.number().int().nullable().optional(), state: stateSchema }).parse(req.body);
    const r = await resolveVfd(body.branchId ?? null);
    if ('error' in r) return res.status(400).json({ error: r.error });
    try {
      await sendToVfd(r.addr.host, r.addr.port, buildVfdFromState(body.state as VfdState));
      res.json({ ok: true });
    } catch (e) {
      res.status(502).json({ error: `ส่งไปยังจอแสดงผลไม่สำเร็จ: ${(e as Error).message}` });
    }
  })
);

/** Send a short connectivity-test message to the VFD. */
vfdRouter.post(
  '/test',
  requireRole('ADMIN', 'MANAGER'),
  ah(async (req, res) => {
    const branchId = req.query.branchId ? Number(req.query.branchId) : null;
    const r = await resolveVfd(branchId);
    if ('error' in r) return res.status(400).json({ error: r.error });
    try {
      await sendToVfd(r.addr.host, r.addr.port, buildVfdTest(r.setting.storeName));
      res.json({ ok: true, display: `${r.addr.host}:${r.addr.port}` });
    } catch (e) {
      res.status(502).json({ error: `เชื่อมต่อจอแสดงผลไม่ได้: ${(e as Error).message}` });
    }
  })
);
