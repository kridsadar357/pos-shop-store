-- AlterTable: auto-send receipt to the member on a completed sale (default off)
ALTER TABLE "Setting" ADD COLUMN "autoReceiptEmail" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Setting" ADD COLUMN "autoReceiptSms" BOOLEAN NOT NULL DEFAULT false;
