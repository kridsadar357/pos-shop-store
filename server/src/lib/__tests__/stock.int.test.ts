import { describe, it, expect } from 'vitest';
import { prisma } from '../../prisma.js';
import { postMovement } from '../stock.js';

/**
 * Integration tests for the stock chokepoint against a real database. Each test
 * runs inside a transaction that is deliberately rolled back (ROLLBACK sentinel),
 * so it creates a throwaway branch + product, exercises postMovement, captures
 * the results, and leaves NO residue. Requires a running DB (npm run test:integration).
 */
const ROLLBACK = Symbol('rollback');

async function inRolledBackTx<T>(fn: (tx: any) => Promise<T>): Promise<T> {
  let captured: T;
  try {
    await prisma.$transaction(async (tx) => {
      captured = await fn(tx);
      throw ROLLBACK;
    });
  } catch (e) {
    if (e !== ROLLBACK) throw e;
  }
  return captured!;
}

async function seedProduct(tx: any, opts: { trackBatches?: boolean } = {}) {
  const branch = await tx.branch.create({ data: { code: `T${Date.now()}${Math.floor(performance.now())}`, name: 'TestBranch' } });
  const product = await tx.product.create({ data: { sku: `INT-${branch.id}`, name: 'IntTest', cost: 10, retailPrice: 20, trackBatches: !!opts.trackBatches } });
  return { branch, product };
}

describe('postMovement (integration)', () => {
  it('updates Product.stockQty, BranchStock, and writes a ledger row', async () => {
    const r = await inRolledBackTx(async (tx) => {
      const { branch, product } = await seedProduct(tx);
      await postMovement(tx, { productId: product.id, type: 'RECEIVE', qtyDelta: 10, branchId: branch.id });
      const balance = await postMovement(tx, { productId: product.id, type: 'SALE', qtyDelta: -3, branchId: branch.id });
      const prod = await tx.product.findUnique({ where: { id: product.id } });
      const bs = await tx.branchStock.findFirst({ where: { productId: product.id, branchId: branch.id } });
      const moves = await tx.stockMovement.count({ where: { productId: product.id } });
      return { balance, stockQty: prod.stockQty, branchQty: bs.qty, moves };
    });
    expect(r.stockQty).toBe(7);
    expect(r.branchQty).toBe(7);
    expect(r.balance).toBe(7);
    expect(r.moves).toBe(2);
  });

  it('FEFO-consumes batches by earliest expiry for a batch-tracked product', async () => {
    const r = await inRolledBackTx(async (tx) => {
      const { branch, product } = await seedProduct(tx, { trackBatches: true });
      const far = new Date(Date.now() + 200 * 86400000);
      const near = new Date(Date.now() + 10 * 86400000);
      await postMovement(tx, { productId: product.id, type: 'RECEIVE', qtyDelta: 10, branchId: branch.id, batch: { lotNo: 'FAR', expiryDate: far } });
      await postMovement(tx, { productId: product.id, type: 'RECEIVE', qtyDelta: 10, branchId: branch.id, batch: { lotNo: 'NEAR', expiryDate: near } });
      await postMovement(tx, { productId: product.id, type: 'SALE', qtyDelta: -5, branchId: branch.id });
      const batches = await tx.productBatch.findMany({ where: { productId: product.id }, orderBy: { id: 'asc' } });
      const prod = await tx.product.findUnique({ where: { id: product.id } });
      return { batches: batches.map((b: any) => ({ lot: b.lotNo, rem: b.qtyRemaining })), stockQty: prod.stockQty };
    });
    const near = r.batches.find((b: any) => b.lot === 'NEAR');
    const far = r.batches.find((b: any) => b.lot === 'FAR');
    expect(near!.rem).toBe(5); // earliest expiry consumed first
    expect(far!.rem).toBe(10);
    expect(r.stockQty).toBe(15);
    // Σ batch remaining (received batches) equals total stock change since tracking.
    expect(r.batches.reduce((s: number, b: any) => s + b.rem, 0)).toBe(15);
  });

  it('a negative delta beyond available batches absorbs the shortfall in a catch-all batch', async () => {
    const r = await inRolledBackTx(async (tx) => {
      const { branch, product } = await seedProduct(tx, { trackBatches: true });
      await postMovement(tx, { productId: product.id, type: 'RECEIVE', qtyDelta: 3, branchId: branch.id, batch: { lotNo: 'A', expiryDate: new Date(Date.now() + 86400000) } });
      await postMovement(tx, { productId: product.id, type: 'SALE', qtyDelta: -5, branchId: branch.id }); // oversell by 2
      const batches = await tx.productBatch.findMany({ where: { productId: product.id } });
      return { total: batches.reduce((s: number, b: any) => s + b.qtyRemaining, 0) };
    });
    expect(r.total).toBe(-2); // Σ batches tracks the net delta (3 − 5)
  });
});
