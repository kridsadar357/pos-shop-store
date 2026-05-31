-- CreateTable
CREATE TABLE "HeldBill" (
    "id" SERIAL NOT NULL,
    "shiftId" INTEGER NOT NULL,
    "cashierId" INTEGER NOT NULL,
    "type" "SaleType" NOT NULL DEFAULT 'RETAIL',
    "memberId" INTEGER,
    "discount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "couponCode" TEXT NOT NULL DEFAULT '',
    "note" TEXT NOT NULL DEFAULT '',
    "items" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HeldBill_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HeldBill_shiftId_idx" ON "HeldBill"("shiftId");

-- AddForeignKey
ALTER TABLE "HeldBill" ADD CONSTRAINT "HeldBill_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HeldBill" ADD CONSTRAINT "HeldBill_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;
