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

  const balanceAfter = product.stockQty + m.qtyDelta;

  await tx.product.update({
    where: { id: m.productId },
    data: { stockQty: balanceAfter },
  });

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
