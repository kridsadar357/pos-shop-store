import type { Prisma } from '@prisma/client';

type Tx = Prisma.TransactionClient;
const round2 = (n: number) => Math.round(n * 100) / 100;

export type GiftTxnType = 'ISSUE' | 'RELOAD' | 'REDEEM' | 'REFUND';

/**
 * Single chokepoint for gift-card balance changes: updates the balance and writes
 * a GiftCardTxn with the running balance. `amount` is signed (+issue/reload/refund,
 * −redeem). Throws if the change would drive the balance negative.
 */
export async function postGift(
  tx: Tx,
  opts: { giftCardId: number; type: GiftTxnType; amount: number; saleId?: number | null; note?: string; userId?: number | null }
) {
  const card = await tx.giftCard.findUniqueOrThrow({ where: { id: opts.giftCardId }, select: { balance: true } });
  const balance = round2(Number(card.balance) + opts.amount);
  if (balance < -0.001) throw Object.assign(new Error('ยอดเงินในบัตรไม่เพียงพอ'), { status: 400 });
  await tx.giftCard.update({ where: { id: opts.giftCardId }, data: { balance } });
  return tx.giftCardTxn.create({
    data: { giftCardId: opts.giftCardId, type: opts.type, amount: round2(opts.amount), balance, saleId: opts.saleId ?? null, note: opts.note ?? '', userId: opts.userId ?? null },
  });
}
