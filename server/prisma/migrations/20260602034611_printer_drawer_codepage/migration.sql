-- AlterTable
ALTER TABLE "Setting" ADD COLUMN     "escposCodepage" INTEGER NOT NULL DEFAULT 21,
ADD COLUMN     "openDrawerOnCash" BOOLEAN NOT NULL DEFAULT true;
