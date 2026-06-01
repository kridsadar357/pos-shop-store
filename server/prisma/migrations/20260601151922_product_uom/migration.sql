-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "purchaseUnit" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "unitsPerPurchase" INTEGER NOT NULL DEFAULT 1;
