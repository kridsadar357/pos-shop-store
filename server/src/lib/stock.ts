import type { MovementType, Prisma } from '@prisma/client';

export interface MovementInput {
  productId: number;
  type: MovementType;
  qtyDelta: number; // signed
  unitCost?: number;
  refType?: string;
  refId?: number;
  note?: string;
  userId?: number;
  branchId?: number | null; // which branch's stock moved; defaults to the default branch
  batch?: { lotNo?: string; expiryDate?: Date | null }; // lot/expiry for a batch-tracked receive
}

/**
 * Maintain lot/expiry batches for a batch-tracked product so that
 * Σ(qtyRemaining) per product×branch always equals BranchStock.qty.
 *  - positive delta with lot/expiry → a new received batch
 *  - positive delta otherwise (void/return/count-up) → a no-expiry "catch-all" batch
 *  - negative delta → FEFO consumption (earliest expiry first, then oldest);
 *    any shortfall (overselling) is absorbed by the catch-all batch.
 */
async function applyBatch(
  tx: Prisma.TransactionClient,
  o: { productId: number; branchId: number; qtyDelta: number; unitCost: number; batch?: { lotNo?: string; expiryDate?: Date | null } }
): Promise<void> {
  const { productId, branchId } = o;
  async function catchAll() {
    return (
      (await tx.productBatch.findFirst({ where: { productId, branchId, lotNo: '', expiryDate: null } })) ??
      (await tx.productBatch.create({ data: { productId, branchId, lotNo: '', expiryDate: null, qtyReceived: 0, qtyRemaining: 0, unitCost: o.unitCost } }))
    );
  }
  if (o.qtyDelta > 0) {
    if (o.batch && (o.batch.lotNo || o.batch.expiryDate)) {
      await tx.productBatch.create({
        data: { productId, branchId, lotNo: o.batch.lotNo ?? '', expiryDate: o.batch.expiryDate ?? null, qtyReceived: o.qtyDelta, qtyRemaining: o.qtyDelta, unitCost: o.unitCost },
      });
    } else {
      const ca = await catchAll();
      await tx.productBatch.update({ where: { id: ca.id }, data: { qtyReceived: { increment: o.qtyDelta }, qtyRemaining: { increment: o.qtyDelta } } });
    }
    return;
  }
  // qtyDelta < 0 → FEFO consume
  let need = -o.qtyDelta;
  const open = await tx.productBatch.findMany({ where: { productId, branchId, qtyRemaining: { gt: 0 } } });
  open.sort((a, b) => {
    const ax = a.expiryDate ? a.expiryDate.getTime() : Infinity;
    const bx = b.expiryDate ? b.expiryDate.getTime() : Infinity;
    return ax - bx || a.id - b.id;
  });
  for (const b of open) {
    if (need <= 0) break;
    const take = Math.min(b.qtyRemaining, need);
    await tx.productBatch.update({ where: { id: b.id }, data: { qtyRemaining: { decrement: take } } });
    need -= take;
  }
  if (need > 0) {
    const ca = await catchAll();
    await tx.productBatch.update({ where: { id: ca.id }, data: { qtyRemaining: { decrement: need } } });
  }
}

/** The default branch id (cached per process; branches rarely change). */
let defaultBranchCache: number | null | undefined;
export async function defaultBranchId(tx: Prisma.TransactionClient): Promise<number | null> {
  if (defaultBranchCache !== undefined) return defaultBranchCache;
  const b = await tx.branch.findFirst({ where: { isDefault: true }, select: { id: true } });
  defaultBranchCache = b?.id ?? null;
  return defaultBranchCache;
}

/**
 * Single source of truth for stock changes. Records a ledger row AND updates
 * the cached Product.stockQty atomically within the given transaction client,
 * so the ledger and the cached balance can never diverge. Returns the new
 * balance. This powers the "backtrack stock" audit trail.
 */
export async function postMovement(tx: Prisma.TransactionClient, m: MovementInput): Promise<number> {
  const product = await tx.product.findUniqueOrThrow({
    where: { id: m.productId },
    select: { stockQty: true, cost: true, trackBatches: true },
  });

  // Product.stockQty stays the all-branch total (cached aggregate).
  const newTotal = product.stockQty + m.qtyDelta;
  await tx.product.update({ where: { id: m.productId }, data: { stockQty: newTotal } });

  // Per-branch balance is the source of truth for branch availability.
  const branchId = m.branchId === undefined ? await defaultBranchId(tx) : m.branchId;
  let balanceAfter = newTotal;
  if (branchId != null) {
    const bs = await tx.branchStock.upsert({
      where: { productId_branchId: { productId: m.productId, branchId } },
      create: { productId: m.productId, branchId, qty: m.qtyDelta },
      update: { qty: { increment: m.qtyDelta } },
    });
    balanceAfter = bs.qty;

    // Opt-in lot/expiry batches layered under the branch balance (FEFO).
    if (product.trackBatches) {
      await applyBatch(tx, { productId: m.productId, branchId, qtyDelta: m.qtyDelta, unitCost: m.unitCost ?? Number(product.cost), batch: m.batch });
    }
  }

  await tx.stockMovement.create({
    data: {
      productId: m.productId,
      type: m.type,
      qtyDelta: m.qtyDelta,
      balanceAfter,
      unitCost: m.unitCost ?? Number(product.cost),
      refType: m.refType ?? 'MANUAL',
      refId: m.refId ?? null,
      note: m.note ?? '',
      userId: m.userId ?? null,
      branchId,
    },
  });

  return balanceAfter;
}

/** Allocate the next sequential value for a named counter (e.g. order numbers). */
export async function nextSeq(tx: Prisma.TransactionClient, key: string): Promise<number> {
  const row = await tx.counter.upsert({
    where: { key },
    create: { key, value: 1 },
    update: { value: { increment: 1 } },
  });
  return row.value;
}
