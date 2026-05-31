import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import { ZodError } from 'zod';
import { env } from './env.js';
import { authRouter } from './routes/auth.js';
import { productsRouter, uploadsDir } from './routes/products.js';
import { categoriesRouter } from './routes/categories.js';
import { suppliersRouter } from './routes/suppliers.js';
import { inventoryRouter } from './routes/inventory.js';
import { stockCountsRouter } from './routes/stockcounts.js';
import { salesRouter } from './routes/sales.js';
import { reportsRouter } from './routes/reports.js';
import { settingsRouter } from './routes/settings.js';
import { usersRouter } from './routes/users.js';
import { membersRouter } from './routes/members.js';
import { shiftsRouter } from './routes/shifts.js';
import { promotionsRouter } from './routes/promotions.js';
import { heldBillsRouter } from './routes/heldBills.js';

export function createApp() {
  const app = express();
  app.use(cors({ origin: env.CORS_ORIGIN }));
  app.use(express.json());

  app.get('/health', (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

  // Serve uploaded product images.
  app.use('/uploads', express.static(uploadsDir));

  app.use('/api/auth', authRouter);
  app.use('/api/products', productsRouter);
  app.use('/api/categories', categoriesRouter);
  app.use('/api/suppliers', suppliersRouter);
  app.use('/api/inventory', inventoryRouter);
  app.use('/api/stock-counts', stockCountsRouter);
  app.use('/api/sales', salesRouter);
  app.use('/api/reports', reportsRouter);
  app.use('/api/settings', settingsRouter);
  app.use('/api/users', usersRouter);
  app.use('/api/members', membersRouter);
  app.use('/api/shifts', shiftsRouter);
  app.use('/api/promotions', promotionsRouter);
  app.use('/api/held-bills', heldBillsRouter);

  // Central error handler.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: err.flatten() });
    }
    const status = (err as { status?: number })?.status ?? 500;
    const message = (err as { message?: string })?.message ?? 'Internal server error';
    if (status >= 500) console.error(err);
    res.status(status).json({ error: message });
  });

  return app;
}
