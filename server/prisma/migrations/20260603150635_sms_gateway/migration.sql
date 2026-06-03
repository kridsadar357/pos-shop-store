-- AlterTable: outgoing SMS gateway config (generic JSON HTTP POST)
ALTER TABLE "Setting" ADD COLUMN "smsApiUrl" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Setting" ADD COLUMN "smsApiKey" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Setting" ADD COLUMN "smsSender" TEXT NOT NULL DEFAULT '';
