-- AlterTable: client-supplied idempotency key for offline POS replay / double-submit protection
ALTER TABLE "Sale" ADD COLUMN "clientRef" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Sale_clientRef_key" ON "Sale"("clientRef");
