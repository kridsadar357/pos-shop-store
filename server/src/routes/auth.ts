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

// Quick cashier switch on a shared POS terminal: log in by PIN alone.
authRouter.post(
  '/pin',
  ah(async (req, res) => {
    const { pin } = z.object({ pin: z.string().min(4).max(8) }).parse(req.body);
    const users = await prisma.user.findMany({ where: { isActive: true, pinHash: { not: null } } });
    for (const u of users) {
      if (u.pinHash && (await bcrypt.compare(pin, u.pinHash))) {
        const profile = { id: u.id, username: u.username, name: u.name, role: u.role };
        return res.json({ token: signToken(profile), user: profile });
      }
    }
    return res.status(401).json({ error: 'PIN ไม่ถูกต้อง' });
  })
);

authRouter.get(
  '/me',
  requireAuth,
  ah(async (req, res) => {
    res.json({ user: req.user });
  })
);

// Self-service: the signed-in user changes their own password.
authRouter.post(
  '/change-password',
  requireAuth,
  ah(async (req, res) => {
    const { currentPassword, newPassword } = z
      .object({ currentPassword: z.string().min(1), newPassword: z.string().min(4) })
      .parse(req.body);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
    if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
      return res.status(400).json({ error: 'รหัสผ่านปัจจุบันไม่ถูกต้อง' });
    }
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(newPassword, 10) } });
    res.json({ ok: true });
  })
);
