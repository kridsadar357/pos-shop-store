import { Router } from 'express';
import { ah, requireAuth, requireRole } from '../middleware/auth.js';
import { exportAll, restoreAll } from '../lib/backup.js';

export const backupRouter = Router();
backupRouter.use(requireAuth, requireRole('ADMIN'));

// Download a full JSON snapshot of the database.
backupRouter.get(
  '/export',
  ah(async (_req, res) => {
    const snapshot = await exportAll();
    res.setHeader('Content-Type', 'application/json');
    res.json(snapshot);
  })
);

// Replace ALL data with an uploaded snapshot (atomic — rolls back on any error).
backupRouter.post(
  '/restore',
  ah(async (req, res) => {
    const payload = req.body;
    if (!payload || typeof payload !== 'object' || !payload.data) {
      return res.status(400).json({ error: 'ไฟล์สำรองไม่ถูกต้อง' });
    }
    const result = await restoreAll(payload);
    res.json(result);
  })
);
