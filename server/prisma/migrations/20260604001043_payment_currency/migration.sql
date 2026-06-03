-- AlterTable: multi-currency capture on each tender
ALTER TABLE "SalePayment" ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'THB';
ALTER TABLE "SalePayment" ADD COLUMN "fxRate" DECIMAL(14,4) NOT NULL DEFAULT 1;
ALTER TABLE "SalePayment" ADD COLUMN "foreignAmount" DECIMAL(14,2) NOT NULL DEFAULT 0;
-- Backfill existing rows: base-currency tenders → foreignAmount = amount.
UPDATE "SalePayment" SET "foreignAmount" = "amount" WHERE "foreignAmount" = 0;
