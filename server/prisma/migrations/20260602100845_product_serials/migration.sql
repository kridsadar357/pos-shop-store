-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "trackSerials" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ProductSerial" (
    "id" SERIAL NOT NULL,
    "productId" INTEGER NOT NULL,
    "branchId" INTEGER,
    "serialNo" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'IN_STOCK',
    "note" TEXT NOT NULL DEFAULT '',
    "receivedRef" TEXT NOT NULL DEFAULT '',
    "saleId" INTEGER,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "soldAt" TIMESTAMP(3),

    CONSTRAINT "ProductSerial_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductSerial_productId_status_idx" ON "ProductSerial"("productId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ProductSerial_productId_serialNo_key" ON "ProductSerial"("productId", "serialNo");

-- AddForeignKey
ALTER TABLE "ProductSerial" ADD CONSTRAINT "ProductSerial_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
