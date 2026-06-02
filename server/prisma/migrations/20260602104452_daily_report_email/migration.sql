-- AlterTable
ALTER TABLE "Setting" ADD COLUMN     "reportEmailEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "reportEmailHour" INTEGER NOT NULL DEFAULT 8,
ADD COLUMN     "reportEmailLastSent" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "reportEmailTo" TEXT NOT NULL DEFAULT '';
