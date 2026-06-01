import { Router } from 'express';
import { prisma } from '../prisma.js';
import { ah, requireAuth, requireRole } from '../middleware/auth.js';

export const auditRouter = Router();
auditRouter.use(requireAuth, requireRole('ADMIN'));

// Audit trail with optional search / date-range / method filters (ADMIN only).
auditRouter.get(
  '/',
  ah(async (req, res) => {
    const from = req.query.from ? new Date(String(req.query.from)) : undefined;
    const to = req.query.to ? new Date(String(req.query.to)) : undefined;
    const method = req.query.method ? String(req.query.method) : undefined;
    const q = String(req.query.q || '').trim();
    const logs = await prisma.auditLog.findMany({
      where: {
        createdAt: { gte: from, lte: to },
        method,
        ...(q
          ? { OR: [{ userName: { contains: q, mode: 'insensitive' } }, { action: { contains: q, mode: 'insensitive' } }, { path: { contains: q, mode: 'insensitive' } }] }
          : {}),
      },
      orderBy: { id: 'desc' },
      take: 500,
    });
    res.json(logs);
  })
);
