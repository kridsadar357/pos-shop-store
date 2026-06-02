import type { Prisma } from '@prisma/client';

/**
 * Register received serial numbers for a serial-tracked product as IN_STOCK units.
 * Duplicates (same product + serial) are skipped. No-op for non-serialized products.
 */
export async function registerSerials(
  tx: Prisma.TransactionClient,
  o: { productId: number; branchId: number | null; serials: string[]; ref?: string }
): Promise<number> {
  const product = await tx.product.findUnique({ where: { id: o.productId }, select: { trackSerials: true } });
  if (!product?.trackSerials) return 0;
  const clean = [...new Set(o.serials.map((s) => s.trim()).filter(Boolean))];
  if (!clean.length) return 0;
  const r = await tx.productSerial.createMany({
    data: clean.map((serialNo) => ({ productId: o.productId, branchId: o.branchId, serialNo, status: 'IN_STOCK', receivedRef: o.ref ?? '' })),
    skipDuplicates: true,
  });
  return r.count;
}
