import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { ah, requireAuth, requireRole } from '../middleware/auth.js';

export const usersRouter = Router();
usersRouter.use(requireAuth, requireRole('ADMIN'));

usersRouter.get(
  '/',
  ah(async (_req, res) => {
    res.json(
      await prisma.user.findMany({
        select: { id: true, username: true, name: true, role: true, isActive: true, createdAt: true },
        orderBy: { id: 'asc' },
      })
    );
  })
);

const schema = z.object({
  username: z.string().min(1),
  password: z.string().min(4),
  name: z.string().min(1),
  role: z.enum(['ADMIN', 'MANAGER', 'CASHIER']),
});

usersRouter.post(
  '/',
  ah(async (req, res) => {
    const { username, password, name, role } = schema.parse(req.body);
    const user = await prisma.user.create({
      data: { username, name, role, passwordHash: await bcrypt.hash(password, 10) },
      select: { id: true, username: true, name: true, role: true, isActive: true },
    });
    res.status(201).json(user);
  })
);

usersRouter.put(
  '/:id',
  ah(async (req, res) => {
    const body = schema.partial().parse(req.body);
    const data: Record<string, unknown> = {};
    if (body.name) data.name = body.name;
    if (body.role) data.role = body.role;
    if (typeof req.body.isActive === 'boolean') data.isActive = req.body.isActive;
    if (body.password) data.passwordHash = await bcrypt.hash(body.password, 10);
    const user = await prisma.user.update({
      where: { id: Number(req.params.id) },
      data,
      select: { id: true, username: true, name: true, role: true, isActive: true },
    });
    res.json(user);
  })
);
