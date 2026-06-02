import { describe, it, expect } from 'vitest';
import { computeRedeem, computeEarn } from '../loyaltyCalc.js';

describe('computeRedeem', () => {
  const base = { subtotal: 1000, promoDiscount: 0, manualDiscount: 0, redeemRate: 1 };

  it('redeems the requested points when within balance and room', () => {
    expect(computeRedeem({ ...base, requested: 100, memberPoints: 500 })).toEqual({ pointsRedeemed: 100, redeemValue: 100 });
  });

  it('caps at the member balance', () => {
    expect(computeRedeem({ ...base, requested: 100, memberPoints: 40 })).toEqual({ pointsRedeemed: 40, redeemValue: 40 });
  });

  it('caps at the remaining bill room after other discounts', () => {
    // room = 1000 − 200 promo − 100 manual = 700; rate 1 → max 700 points
    const r = computeRedeem({ subtotal: 1000, promoDiscount: 200, manualDiscount: 100, redeemRate: 1, requested: 5000, memberPoints: 5000 });
    expect(r).toEqual({ pointsRedeemed: 700, redeemValue: 700 });
  });

  it('honors a redeem rate > 1 baht/point (floors points by room)', () => {
    // rate 5 baht/point, room 1000 → max 200 points worth 1000
    const r = computeRedeem({ subtotal: 1000, promoDiscount: 0, manualDiscount: 0, redeemRate: 5, requested: 1000, memberPoints: 1000 });
    expect(r).toEqual({ pointsRedeemed: 200, redeemValue: 1000 });
  });

  it('redeems nothing when the rate is 0 or room is 0', () => {
    expect(computeRedeem({ ...base, requested: 100, memberPoints: 500, redeemRate: 0 })).toEqual({ pointsRedeemed: 0, redeemValue: 0 });
    expect(computeRedeem({ subtotal: 100, promoDiscount: 100, manualDiscount: 0, redeemRate: 1, requested: 50, memberPoints: 500 })).toEqual({ pointsRedeemed: 0, redeemValue: 0 });
  });
});

describe('computeEarn', () => {
  it('earns floor(total / earnBaht)', () => {
    expect(computeEarn(155, 25)).toBe(6);   // 155/25 = 6.2 → 6
    expect(computeEarn(57, 25)).toBe(2);     // 57/25 = 2.28 → 2
    expect(computeEarn(24, 25)).toBe(0);
  });
  it('earns nothing when earnBaht is 0', () => {
    expect(computeEarn(1000, 0)).toBe(0);
  });
});
