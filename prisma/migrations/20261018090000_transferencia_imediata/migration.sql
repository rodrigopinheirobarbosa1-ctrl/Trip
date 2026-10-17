-- Transferência imediata: liga a transferência à compra feita na hora.
ALTER TABLE "Transferencia" ADD COLUMN "compraId" TEXT;

ALTER TABLE "Transferencia" ADD CONSTRAINT "Transferencia_compraId_fkey" FOREIGN KEY ("compraId") REFERENCES "Entrada"("id") ON DELETE SET NULL ON UPDATE CASCADE;
