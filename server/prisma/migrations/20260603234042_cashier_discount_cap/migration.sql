-- AlterTable: cashier manual-discount cap (100 = unlimited)
ALTER TABLE "Setting" ADD COLUMN "cashierMaxDiscountPct" INTEGER NOT NULL DEFAULT 100;
