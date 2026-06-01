-- CreateTable
CREATE TABLE "TaxInvoice" (
    "id" SERIAL NOT NULL,
    "number" TEXT NOT NULL,
    "saleId" INTEGER NOT NULL,
    "buyerName" TEXT NOT NULL,
    "buyerTaxId" TEXT NOT NULL DEFAULT '',
    "buyerAddress" TEXT NOT NULL DEFAULT '',
    "buyerBranch" TEXT NOT NULL DEFAULT '',
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" INTEGER,

    CONSTRAINT "TaxInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TaxInvoice_number_key" ON "TaxInvoice"("number");

-- CreateIndex
CREATE UNIQUE INDEX "TaxInvoice_saleId_key" ON "TaxInvoice"("saleId");

-- AddForeignKey
ALTER TABLE "TaxInvoice" ADD CONSTRAINT "TaxInvoice_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
