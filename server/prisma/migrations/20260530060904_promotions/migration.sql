-- CreateEnum
CREATE TYPE "PromoType" AS ENUM ('PERCENT', 'FIXED', 'BXGY');

-- CreateEnum
CREATE TYPE "PromoScope" AS ENUM ('BILL', 'PRODUCT', 'CATEGORY');

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "promoDiscount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "promoNames" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "Promotion" (
    "id" SERIAL NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "type" "PromoType" NOT NULL,
    "scope" "PromoScope" NOT NULL DEFAULT 'BILL',
    "value" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "buyQty" INTEGER NOT NULL DEFAULT 0,
    "getQty" INTEGER NOT NULL DEFAULT 0,
    "productId" INTEGER,
    "categoryId" INTEGER,
    "minSpend" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "autoApply" BOOLEAN NOT NULL DEFAULT true,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Promotion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Promotion_code_key" ON "Promotion"("code");

-- AddForeignKey
ALTER TABLE "Promotion" ADD CONSTRAINT "Promotion_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Promotion" ADD CONSTRAINT "Promotion_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;
