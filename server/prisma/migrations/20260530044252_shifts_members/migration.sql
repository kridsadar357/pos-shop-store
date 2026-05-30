-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "memberId" INTEGER,
ADD COLUMN     "shiftId" INTEGER;

-- AlterTable
ALTER TABLE "Setting" ADD COLUMN     "memberGetsWholesale" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "Member" (
    "id" SERIAL NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT NOT NULL DEFAULT '',
    "note" TEXT NOT NULL DEFAULT '',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shift" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "openingFloat" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "countedCash" DECIMAL(12,2),
    "expectedCash" DECIMAL(12,2),
    "cashDiff" DECIMAL(12,2),
    "note" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "Shift_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Member_code_key" ON "Member"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Member_phone_key" ON "Member"("phone");

-- CreateIndex
CREATE INDEX "Member_name_idx" ON "Member"("name");

-- CreateIndex
CREATE INDEX "Shift_userId_status_idx" ON "Shift"("userId", "status");

-- AddForeignKey
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift"("id") ON DELETE SET NULL ON UPDATE CASCADE;
