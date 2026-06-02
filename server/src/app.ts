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
import { licenseRouter } from './routes/license.js';
import { setupRouter } from './routes/setup.js';
import { printRouter } from './routes/print.js';
import { purchaseOrdersRouter } from './routes/purchaseOrders.js';
import { returnsRouter } from './routes/returns.js';
import { branchesRouter } from './routes/branches.js';
import { transfersRouter } from './routes/transfers.js';
import { expensesRouter } from './routes/expenses.js';
import { auditRouter } from './routes/audit.js';
import { payablesRouter } from './routes/payables.js';
import { giftCardsRouter } from './routes/giftcards.js';
import { quotationsRouter } from './routes/quotations.js';
import { taxInvoicesRouter } from './routes/taxInvoices.js';
import { layawaysRouter } from './routes/layaways.js';
import { backupRouter } from './routes/backup.js';
import { auditLogger } from './middleware/audit.js';

export function createApp() {
  const app = express();
  app.use(cors({ origin: env.CORS_ORIGIN }));
  app.use(express.json({ limit: '64mb' })); // large enough for full backup restore

  app.get('/health', (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

  // Serve uploaded product images.
  app.use('/uploads', express.static(uploadsDir));

  // Audit trail — records mutating /api calls after the response finishes.
  app.use(auditLogger);

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
  app.use('/api/license', licenseRouter);
  app.use('/api/setup', setupRouter);
  app.use('/api/print', printRouter);
  app.use('/api/purchase-orders', purchaseOrdersRouter);
  app.use('/api/returns', returnsRouter);
  app.use('/api/branches', branchesRouter);
  app.use('/api/transfers', transfersRouter);
  app.use('/api/expenses', expensesRouter);
  app.use('/api/audit', auditRouter);
  app.use('/api/payables', payablesRouter);
  app.use('/api/gift-cards', giftCardsRouter);
  app.use('/api/quotations', quotationsRouter);
  app.use('/api/tax-invoices', taxInvoicesRouter);
  app.use('/api/layaways', layawaysRouter);
  app.use('/api/backup', backupRouter);

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
