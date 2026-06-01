import type { Prisma } from '@prisma/client';

type Tx = Prisma.TransactionClient;

export type PointType = 'EARN' | 'REDEEM' | 'ADJUST';

/**
 * Single chokepoint for loyalty-point changes: updates the member balance and
 * writes a PointTransaction row with the running balance. `points` is signed
 * (+earn / −redeem). Throws if the change would drive the balance negative.
 */
export async function postPoints(
  tx: Tx,
  opts: { memberId: number; saleId?: number | null; type: PointType; points: number; note?: string; userId?: number | null }
) {
  const member = await tx.member.findUniqueOrThrow({ where: { id: opts.memberId }, select: { points: true } });
  const balance = member.points + opts.points;
  if (balance < 0) throw Object.assign(new Error('Insufficient points'), { status: 400 });
  await tx.member.update({ where: { id: opts.memberId }, data: { points: balance } });
  return tx.pointTransaction.create({
    data: {
      memberId: opts.memberId,
      saleId: opts.saleId ?? null,
      type: opts.type,
      points: opts.points,
      balance,
      note: opts.note ?? '',
      userId: opts.userId ?? null,
    },
  });
}
