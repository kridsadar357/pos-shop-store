import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import type { Role } from '@prisma/client';
import { env } from '../env.js';

export interface AuthUser {
  id: number;
  username: string;
  name: string;
  role: Role;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function signToken(user: AuthUser): string {
  return jwt.sign(user, env.JWT_SECRET, { expiresIn: '12h' });
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing token' });
  }
  try {
    const payload = jwt.verify(header.slice(7), env.JWT_SECRET) as AuthUser;
    req.user = { id: payload.id, username: payload.username, name: payload.name, role: payload.role };
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthenticated' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

/** Wrap an async route handler so thrown errors hit the error middleware. */
export function ah<T extends Request>(
  fn: (req: T, res: Response, next: NextFunction) => Promise<unknown>
) {
  return (req: T, res: Response, next: NextFunction) => fn(req, res, next).catch(next);
}
