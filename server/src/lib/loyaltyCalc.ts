const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * How many points actually get redeemed and their baht value, capped by:
 *  - the member's balance,
 *  - what the customer asked to redeem,
 *  - the remaining bill "room" after promo + manual discounts (can't redeem below 0).
 * redeemRate = baht per 1 point.
 */
export function computeRedeem(opts: {
  requested: number;
  memberPoints: number;
  redeemRate: number;
  subtotal: number;
  promoDiscount: number;
  manualDiscount: number;
}): { pointsRedeemed: number; redeemValue: number } {
  const room = Math.max(0, opts.subtotal - opts.promoDiscount - opts.manualDiscount);
  const maxByRoom = opts.redeemRate > 0 ? Math.floor(room / opts.redeemRate) : 0;
  const pointsRedeemed = Math.max(0, Math.min(opts.requested, opts.memberPoints, maxByRoom));
  return { pointsRedeemed, redeemValue: round2(pointsRedeemed * opts.redeemRate) };
}

/** Points earned on a net total. earnBaht = baht spent to earn 1 point (0 = no earning). */
export function computeEarn(total: number, earnBaht: number): number {
  return earnBaht > 0 ? Math.floor(total / earnBaht) : 0;
}
