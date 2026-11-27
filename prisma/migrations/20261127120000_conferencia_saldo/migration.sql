-- Última conferência do saldo de cada pessoa em cada programa.
CREATE TABLE "ConferenciaSaldo" (
    "id" TEXT NOT NULL,
    "titularId" TEXT NOT NULL,
    "programaId" TEXT NOT NULL,
    "conferidoEm" DATE NOT NULL,
    "saldo" INTEGER NOT NULL,
    "observacao" TEXT,
    "registradoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "registradoPor" TEXT NOT NULL,

    CONSTRAINT "ConferenciaSaldo_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ConferenciaSaldo_titularId_programaId_key" ON "ConferenciaSaldo"("titularId", "programaId");

ALTER TABLE "ConferenciaSaldo" ADD CONSTRAINT "ConferenciaSaldo_titularId_fkey" FOREIGN KEY ("titularId") REFERENCES "Titular"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConferenciaSaldo" ADD CONSTRAINT "ConferenciaSaldo_programaId_fkey" FOREIGN KEY ("programaId") REFERENCES "Programa"("id") ON DELETE CASCADE ON UPDATE CASCADE;
