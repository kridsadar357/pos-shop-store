-- AlterTable
ALTER TABLE "Branch" ADD COLUMN     "vfdAddress" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "Setting" ADD COLUMN     "vfdAddress" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "vfdEnabled" BOOLEAN NOT NULL DEFAULT false;
