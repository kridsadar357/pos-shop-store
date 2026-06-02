-- AlterTable
ALTER TABLE "Setting" ADD COLUMN     "secondaryCurrency" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "secondaryRate" DECIMAL(14,4) NOT NULL DEFAULT 0;
