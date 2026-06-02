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

/**
 * Mark the given serials of a serial-tracked product as SOLD against a sale.
 * Each serial must currently exist IN_STOCK (or RETURNED) for that product;
 * otherwise the whole checkout transaction rolls back. No-op for non-serialized
 * products. Returns the number of units consumed.
 */
export async function consumeSerials(
  tx: Prisma.TransactionClient,
  o: { productId: number; saleId: number; serials: string[]; soldAt: Date }
): Promise<number> {
  const product = await tx.product.findUnique({ where: { id: o.productId }, select: { trackSerials: true, name: true } });
  if (!product?.trackSerials) return 0;
  const clean = [...new Set(o.serials.map((s) => s.trim()).filter(Boolean))];
  if (!clean.length) return 0;
  for (const serialNo of clean) {
    const unit = await tx.productSerial.findFirst({ where: { productId: o.productId, serialNo } });
    if (!unit) throw Object.assign(new Error(`ไม่พบหมายเลขซีเรียล "${serialNo}" ของ ${product.name}`), { status: 400 });
    if (unit.status === 'SOLD') throw Object.assign(new Error(`หมายเลขซีเรียล "${serialNo}" ถูกขายไปแล้ว`), { status: 400 });
    await tx.productSerial.update({ where: { id: unit.id }, data: { status: 'SOLD', saleId: o.saleId, soldAt: o.soldAt } });
  }
  return clean.length;
}

/**
 * Reverse a sale's consumed serials back to IN_STOCK (used when a sale is voided).
 */
export async function releaseSerials(tx: Prisma.TransactionClient, saleId: number): Promise<number> {
  const r = await tx.productSerial.updateMany({
    where: { saleId, status: 'SOLD' },
    data: { status: 'IN_STOCK', saleId: null, soldAt: null },
  });
  return r.count;
}
