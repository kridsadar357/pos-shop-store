export type TenderMethod = 'CASH' | 'TRANSFER' | 'CARD' | 'CREDIT' | 'GIFT';
export interface TenderInput { method: TenderMethod; amount: number; reference?: string }
export interface PaymentRow { method: TenderMethod; amount: number; reference: string }
export interface TenderPlan {
  paymentRows: PaymentRow[]; // applied amounts; sum exactly to `total`
  cashTendered: number;
  changeDue: number;
  dominant: TenderMethod; // largest applied portion → legacy Sale.paymentMethod
  isSplit: boolean;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Resolve how a bill of `total` is paid into per-method APPLIED amounts that sum
 * exactly to the total. Cash may overpay (the excess becomes change); non-cash
 * tenders must not exceed the bill. Throws (status 400) on overpay/underpay.
 *
 * Pass `payments` for split/multi-tender; otherwise the single `paymentMethod`
 * (+ `cashReceived` for cash) is used.
 */
export function computeTenderPlan(opts: {
  total: number;
  payments?: TenderInput[];
  paymentMethod: TenderMethod;
  cashReceived?: number;
  paymentRef?: string;
}): TenderPlan {
  const total = round2(opts.total);
  const ref = opts.paymentRef ?? '';
  const tenders: Required<TenderInput>[] = opts.payments?.length
    ? opts.payments.map((p) => ({ method: p.method, amount: round2(p.amount), reference: p.reference ?? '' }))
    : [{ method: opts.paymentMethod, amount: opts.paymentMethod === 'CASH' ? round2(opts.cashReceived || total) : total, reference: ref }];

  const cashTendered = round2(tenders.filter((t) => t.method === 'CASH').reduce((s, t) => s + t.amount, 0));
  const nonCash = round2(tenders.filter((t) => t.method !== 'CASH').reduce((s, t) => s + t.amount, 0));
  if (nonCash > total + 0.001) throw Object.assign(new Error('ยอดชำระแบบไม่ใช่เงินสดเกินยอดบิล'), { status: 400 });
  const tendered = round2(cashTendered + nonCash);
  if (tendered < total - 0.001) throw Object.assign(new Error('ยอดชำระไม่เพียงพอกับยอดบิล'), { status: 400 });
  const changeDue = round2(Math.max(0, tendered - total)); // change always comes out of cash
  const cashApplied = round2(cashTendered - changeDue);

  // Applied-per-method rows (sum exactly to total) — the source of truth for reports.
  const paymentRows: PaymentRow[] = [];
  for (const t of tenders) if (t.method !== 'CASH') paymentRows.push({ method: t.method, amount: t.amount, reference: t.reference });
  if (cashApplied > 0.001) paymentRows.push({ method: 'CASH', amount: cashApplied, reference: tenders.find((t) => t.method === 'CASH')?.reference ?? '' });
  if (!paymentRows.length) paymentRows.push({ method: opts.paymentMethod, amount: total, reference: ref });

  const isSplit = paymentRows.length > 1;
  const dominant = paymentRows.slice().sort((a, b) => b.amount - a.amount)[0].method;
  return { paymentRows, cashTendered, changeDue, dominant, isSplit };
}
