-- AlterTable
ALTER TABLE "Setting" ADD COLUMN     "printerAddress" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "printerPaper" TEXT NOT NULL DEFAULT '80mm',
ADD COLUMN     "printerType" TEXT NOT NULL DEFAULT 'BROWSER',
ADD COLUMN     "receiptHeader" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "receiptLogoUrl" TEXT,
ADD COLUMN     "receiptShowQR" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "setupCompleted" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "License" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "key" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'INACTIVE',
    "plan" TEXT NOT NULL DEFAULT '',
    "customer" TEXT NOT NULL DEFAULT '',
    "activatedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "demoStartedAt" TIMESTAMP(3),
    "lastCheckedAt" TIMESTAMP(3),
    "raw" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "License_pkey" PRIMARY KEY ("id")
);
