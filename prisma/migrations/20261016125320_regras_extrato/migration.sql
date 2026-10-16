-- CreateTable
CREATE TABLE "RegraExtrato" (
    "id" TEXT NOT NULL,
    "programaId" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "acao" TEXT NOT NULL,
    "outroProgramaId" TEXT,
    "valorMilheiro" INTEGER,
    "bonusPercentual" DOUBLE PRECISION,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegraExtrato_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RegraExtrato_programaId_chave_key" ON "RegraExtrato"("programaId", "chave");
