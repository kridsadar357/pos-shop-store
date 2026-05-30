import type { Promotion } from '@prisma/client';

export interface PromoCartLine {
  productId: number;
  categoryId: number | null;
  qty: number;
  unitPrice: number;
  lineTotal: number;
}

export interface AppliedPromo {
  id: number;
  name: string;
  amount: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Pure promotion evaluator — given priced cart lines and the candidate
 * promotions (already filtered to active + within date window), returns the
 * total promo discount and the per-promotion breakdown. Used by both the POS
 * preview endpoint and the authoritative checkout so results never diverge.
 */
export function evaluatePromotions(
  lines: PromoCartLine[],
  promos: Promotion[],
  opts: { couponCode?: string } = {}
): { promoDiscount: number; applied: AppliedPromo[] } {
  const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);
  const coupon = (opts.couponCode || '').trim().toUpperCase();
  const applied: AppliedPromo[] = [];

  for (const p of promos) {
    // Coupon-gated promos require the matching code; auto promos always considered.
    if (!p.autoApply) {
      if (!coupon || !p.code || p.code.toUpperCase() !== coupon) continue;
    }
    if (subtotal < Number(p.minSpend)) continue;

    let amount = 0;
    if (p.type === 'BXGY') {
      const group = p.buyQty + p.getQty;
      if (group <= 0) continue;
      const matched = lines.filter((l) =>
        p.productId ? l.productId === p.productId : p.categoryId ? l.categoryId === p.categoryId : false
      );
      for (const l of matched) {
        const freeUnits = Math.floor(l.qty / group) * p.getQty;
        amount += freeUnits * l.unitPrice;
      }
    } else {
      let base = 0;
      if (p.scope === 'BILL') base = subtotal;
      else if (p.scope === 'PRODUCT') base = lines.filter((l) => l.productId === p.productId).reduce((s, l) => s + l.lineTotal, 0);
      else if (p.scope === 'CATEGORY') base = lines.filter((l) => l.categoryId === p.categoryId).reduce((s, l) => s + l.lineTotal, 0);
      if (base <= 0) continue;
      amount = p.type === 'PERCENT' ? base * (Number(p.value) / 100) : Math.min(Number(p.value), base);
    }

    amount = r2(amount);
    if (amount > 0) applied.push({ id: p.id, name: p.name, amount });
  }

  const promoDiscount = Math.min(subtotal, r2(applied.reduce((s, a) => s + a.amount, 0)));
  return { promoDiscount, applied };
}
