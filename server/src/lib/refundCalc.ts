const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Refund for the returned lines. `gross` is the sum of returned line totals at the
 * original prices. Any bill-level discount is prorated by (sale total / subtotal),
 * then VAT is derived from the refund total (inclusive) or the gross (exclusive).
 */
export function computeRefund(opts: {
  gross: number;
  saleTotal: number;
  saleSubtotal: number;
  taxRate: number;
  taxInclusive: boolean;
}): { refundTotal: number; taxAmount: number } {
  const gross = round2(opts.gross);
  const ratio = opts.saleSubtotal > 0 ? opts.saleTotal / opts.saleSubtotal : 1;
  const refundTotal = round2(gross * ratio);
  const taxAmount = opts.taxInclusive
    ? round2(refundTotal - refundTotal / (1 + opts.taxRate / 100))
    : round2(gross * (opts.taxRate / 100));
  return { refundTotal, taxAmount };
}
