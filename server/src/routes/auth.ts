import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { ah, requireAuth, signToken } from '../middleware/auth.js';

export const authRouter = Router();

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

authRouter.post(
  '/login',
  ah(async (req, res) => {
    const { username, password } = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { username } });
    if (!user || !user.isActive || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }
    const profile = { id: user.id, username: user.username, name: user.name, role: user.role };
    res.json({ token: signToken(profile), user: profile });
  })
);

authRouter.get(
  '/me',
  requireAuth,
  ah(async (req, res) => {
    res.json({ user: req.user });
  })
);
