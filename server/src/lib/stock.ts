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
    select: { stockQty: true, cost: true },
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
