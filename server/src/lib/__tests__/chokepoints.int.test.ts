import { describe, it, expect } from 'vitest';
import { prisma } from '../../prisma.js';
import { postPoints } from '../loyalty.js';
import { postGift } from '../giftcard.js';
import { nextSeq } from '../stock.js';
import { registerSerials, consumeSerials, releaseSerials } from '../serial.js';

/**
 * Integration tests for the remaining DB-mutation chokepoints (loyalty points,
 * gift-card balance, sequence counter) against a real database, each inside a
 * rolled-back transaction so nothing persists. Requires a DB (test:integration).
 */
const ROLLBACK = Symbol('rollback');
async function inRolledBackTx<T>(fn: (tx: any) => Promise<T>): Promise<T> {
  let captured: T;
  try {
    await prisma.$transaction(async (tx) => { captured = await fn(tx); throw ROLLBACK; });
  } catch (e) { if (e !== ROLLBACK) throw e; }
  return captured!;
}
const uniq = () => `${Date.now()}${Math.floor(performance.now() * 1000) % 1000}`;

describe('postPoints (integration)', () => {
  it('updates the member balance and writes a ledger row with the running balance', async () => {
    const r = await inRolledBackTx(async (tx) => {
      const m = await tx.member.create({ data: { name: 'PtTest', phone: `p${uniq()}`, points: 10 } });
      await postPoints(tx, { memberId: m.id, type: 'EARN', points: 6 });
      const redeem = await postPoints(tx, { memberId: m.id, type: 'REDEEM', points: -4 });
      const after = await tx.member.findUnique({ where: { id: m.id } });
      const txns = await tx.pointTransaction.findMany({ where: { memberId: m.id }, orderBy: { id: 'asc' } });
      return { balance: after.points, redeemBalance: redeem.balance, txns: txns.map((t: any) => t.balance) };
    });
    expect(r.balance).toBe(12); // 10 + 6 − 4
    expect(r.redeemBalance).toBe(12);
    expect(r.txns).toEqual([16, 12]);
  });

  it('refuses to drive the balance negative', async () => {
    await expect(
      inRolledBackTx(async (tx) => {
        const m = await tx.member.create({ data: { name: 'NegTest', phone: `n${uniq()}`, points: 3 } });
        await postPoints(tx, { memberId: m.id, type: 'REDEEM', points: -5 });
      })
    ).rejects.toThrow();
  });
});

describe('postGift (integration)', () => {
  it('credits and debits a gift card, recording running balance, and blocks overdraw', async () => {
    const r = await inRolledBackTx(async (tx) => {
      const card = await tx.giftCard.create({ data: { code: `GC${uniq()}`, initialBalance: 0, balance: 0 } });
      await postGift(tx, { giftCardId: card.id, type: 'ISSUE', amount: 500 });
      await postGift(tx, { giftCardId: card.id, type: 'REDEEM', amount: -120 });
      const after = await tx.giftCard.findUnique({ where: { id: card.id } });
      let blocked = false;
      try { await postGift(tx, { giftCardId: card.id, type: 'REDEEM', amount: -9999 }); } catch { blocked = true; }
      return { balance: Number(after.balance), blocked };
    });
    expect(r.balance).toBe(380);
    expect(r.blocked).toBe(true);
  });
});

describe('serials consume/release (integration)', () => {
  it('marks scanned units SOLD against a sale and releases them back IN_STOCK on void', async () => {
    const r = await inRolledBackTx(async (tx) => {
      const prod = await tx.product.create({ data: { sku: `SER-${uniq()}`, name: 'SerTest', cost: 10, retailPrice: 20, trackSerials: true } });
      await registerSerials(tx, { productId: prod.id, branchId: null, serials: ['A1', 'A2', 'A3'], ref: 'seed' });
      const consumed = await consumeSerials(tx, { productId: prod.id, saleId: 999, serials: ['A1', 'A2'], soldAt: new Date() });
      const sold = await tx.productSerial.count({ where: { productId: prod.id, status: 'SOLD' } });
      const released = await releaseSerials(tx, 999);
      const inStock = await tx.productSerial.count({ where: { productId: prod.id, status: 'IN_STOCK' } });
      return { consumed, sold, released, inStock };
    });
    expect(r.consumed).toBe(2);
    expect(r.sold).toBe(2);
    expect(r.released).toBe(2);
    expect(r.inStock).toBe(3); // all back in stock after void
  });

  it('rejects an unknown serial (rolls the sale back)', async () => {
    await expect(
      inRolledBackTx(async (tx) => {
        const prod = await tx.product.create({ data: { sku: `SER-${uniq()}`, name: 'SerTest2', cost: 10, retailPrice: 20, trackSerials: true } });
        await registerSerials(tx, { productId: prod.id, branchId: null, serials: ['B1'], ref: 'seed' });
        await consumeSerials(tx, { productId: prod.id, saleId: 1, serials: ['NOPE'], soldAt: new Date() });
      })
    ).rejects.toThrow();
  });
});

describe('nextSeq (integration)', () => {
  it('allocates strictly increasing values per key', async () => {
    const r = await inRolledBackTx(async (tx) => {
      const key = `test_seq_${uniq()}`;
      const a = await nextSeq(tx, key);
      const b = await nextSeq(tx, key);
      const c = await nextSeq(tx, key);
      return [a, b, c];
    });
    expect(r).toEqual([1, 2, 3]);
  });
});
