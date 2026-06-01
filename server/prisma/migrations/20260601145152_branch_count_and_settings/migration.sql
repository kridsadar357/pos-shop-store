-- AlterTable
ALTER TABLE "Branch" ADD COLUMN     "printerAddress" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "printerPaper" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "printerType" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "promptPayId" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "promptPayType" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "receiptFooter" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "receiptHeader" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "StockCount" ADD COLUMN     "branchId" INTEGER;

-- AddForeignKey
ALTER TABLE "StockCount" ADD CONSTRAINT "StockCount_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
