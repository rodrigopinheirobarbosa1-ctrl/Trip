-- CreateEnum
CREATE TYPE "Papel" AS ENUM ('ADMIN', 'OPERADOR');

-- CreateEnum
CREATE TYPE "TipoPrograma" AS ENUM ('CARTAO_CREDITO', 'CIA_AEREA', 'HOTEL', 'ABASTECIMENTO', 'OUTRO');

-- CreateEnum
CREATE TYPE "CategoriaEntrada" AS ENUM ('COMPRA', 'ACUMULO', 'BONUS', 'SALDO_INICIAL', 'AJUSTE');

-- CreateEnum
CREATE TYPE "FormaPagamento" AS ENUM ('PIX', 'CARTAO', 'BOLETO', 'DINHEIRO', 'OUTRO', 'SEM_DESEMBOLSO');

-- CreateEnum
CREATE TYPE "TipoSaida" AS ENUM ('VENDA', 'USO_PESSOAL', 'OUTRO');

-- CreateEnum
CREATE TYPE "TipoMovimento" AS ENUM ('ENTRADA', 'SAIDA');

-- CreateTable
CREATE TABLE "Usuario" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "senhaHash" TEXT NOT NULL,
    "papel" "Papel" NOT NULL DEFAULT 'OPERADOR',
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "ultimoAcesso" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sessao" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "expiraEm" TIMESTAMP(3) NOT NULL,
    "ip" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Sessao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Auditoria" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT,
    "usuarioNome" TEXT NOT NULL,
    "acao" TEXT NOT NULL,
    "entidade" TEXT NOT NULL,
    "entidadeId" TEXT,
    "resumo" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Titular" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "cpf" TEXT,
    "saldoInicialCaixa" INTEGER NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "observacao" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Titular_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Programa" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" "TipoPrograma" NOT NULL DEFAULT 'OUTRO',
    "valorMilheiro" INTEGER,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Programa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContaPrograma" (
    "id" TEXT NOT NULL,
    "titularId" TEXT NOT NULL,
    "programaId" TEXT NOT NULL,
    "login" TEXT NOT NULL,
    "observacao" TEXT,

    CONSTRAINT "ContaPrograma_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cartao" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "final" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Cartao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Entrada" (
    "id" TEXT NOT NULL,
    "data" DATE NOT NULL,
    "titularId" TEXT NOT NULL,
    "programaId" TEXT NOT NULL,
    "categoria" "CategoriaEntrada" NOT NULL DEFAULT 'COMPRA',
    "pontos" INTEGER NOT NULL,
    "valor" INTEGER NOT NULL DEFAULT 0,
    "formaPagamento" "FormaPagamento" NOT NULL DEFAULT 'PIX',
    "parcelas" INTEGER NOT NULL DEFAULT 1,
    "cartaoId" TEXT,
    "observacao" TEXT,
    "criadoPor" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Entrada_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transferencia" (
    "id" TEXT NOT NULL,
    "data" DATE NOT NULL,
    "titularId" TEXT NOT NULL,
    "origemId" TEXT NOT NULL,
    "destinoId" TEXT NOT NULL,
    "pontos" INTEGER NOT NULL,
    "bonusPercentual" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "pontosDestino" INTEGER NOT NULL,
    "observacao" TEXT,
    "criadoPor" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Transferencia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Saida" (
    "id" TEXT NOT NULL,
    "data" DATE NOT NULL,
    "titularId" TEXT NOT NULL,
    "programaId" TEXT NOT NULL,
    "tipo" "TipoSaida" NOT NULL DEFAULT 'VENDA',
    "pontos" INTEGER NOT NULL,
    "taxaEmbarque" INTEGER NOT NULL DEFAULT 0,
    "valorVenda" INTEGER NOT NULL DEFAULT 0,
    "fornecedor" TEXT,
    "cliente" TEXT,
    "localizador" TEXT,
    "dataIda" DATE,
    "dataVolta" DATE,
    "passageiros" INTEGER,
    "origem" TEXT,
    "destino" TEXT,
    "formaRecebimento" "FormaPagamento",
    "parcelas" INTEGER NOT NULL DEFAULT 1,
    "dataRecebimento" DATE,
    "observacao" TEXT,
    "criadoPor" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Saida_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MovimentoFinanceiro" (
    "id" TEXT NOT NULL,
    "data" DATE NOT NULL,
    "titularId" TEXT,
    "tipo" "TipoMovimento" NOT NULL,
    "valor" INTEGER NOT NULL,
    "descricao" TEXT NOT NULL,
    "criadoPor" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MovimentoFinanceiro_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_email_key" ON "Usuario"("email");

-- CreateIndex
CREATE INDEX "Sessao_usuarioId_idx" ON "Sessao"("usuarioId");

-- CreateIndex
CREATE INDEX "Auditoria_criadoEm_idx" ON "Auditoria"("criadoEm");

-- CreateIndex
CREATE UNIQUE INDEX "Titular_nome_key" ON "Titular"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "Programa_nome_key" ON "Programa"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "ContaPrograma_titularId_programaId_key" ON "ContaPrograma"("titularId", "programaId");

-- CreateIndex
CREATE UNIQUE INDEX "Cartao_nome_key" ON "Cartao"("nome");

-- CreateIndex
CREATE INDEX "Entrada_data_idx" ON "Entrada"("data");

-- CreateIndex
CREATE INDEX "Entrada_titularId_programaId_idx" ON "Entrada"("titularId", "programaId");

-- CreateIndex
CREATE INDEX "Transferencia_data_idx" ON "Transferencia"("data");

-- CreateIndex
CREATE INDEX "Saida_data_idx" ON "Saida"("data");

-- CreateIndex
CREATE INDEX "Saida_titularId_programaId_idx" ON "Saida"("titularId", "programaId");

-- CreateIndex
CREATE INDEX "MovimentoFinanceiro_data_idx" ON "MovimentoFinanceiro"("data");

-- AddForeignKey
ALTER TABLE "Sessao" ADD CONSTRAINT "Sessao_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContaPrograma" ADD CONSTRAINT "ContaPrograma_titularId_fkey" FOREIGN KEY ("titularId") REFERENCES "Titular"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContaPrograma" ADD CONSTRAINT "ContaPrograma_programaId_fkey" FOREIGN KEY ("programaId") REFERENCES "Programa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Entrada" ADD CONSTRAINT "Entrada_titularId_fkey" FOREIGN KEY ("titularId") REFERENCES "Titular"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Entrada" ADD CONSTRAINT "Entrada_programaId_fkey" FOREIGN KEY ("programaId") REFERENCES "Programa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Entrada" ADD CONSTRAINT "Entrada_cartaoId_fkey" FOREIGN KEY ("cartaoId") REFERENCES "Cartao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transferencia" ADD CONSTRAINT "Transferencia_titularId_fkey" FOREIGN KEY ("titularId") REFERENCES "Titular"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transferencia" ADD CONSTRAINT "Transferencia_origemId_fkey" FOREIGN KEY ("origemId") REFERENCES "Programa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transferencia" ADD CONSTRAINT "Transferencia_destinoId_fkey" FOREIGN KEY ("destinoId") REFERENCES "Programa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Saida" ADD CONSTRAINT "Saida_titularId_fkey" FOREIGN KEY ("titularId") REFERENCES "Titular"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Saida" ADD CONSTRAINT "Saida_programaId_fkey" FOREIGN KEY ("programaId") REFERENCES "Programa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoFinanceiro" ADD CONSTRAINT "MovimentoFinanceiro_titularId_fkey" FOREIGN KEY ("titularId") REFERENCES "Titular"("id") ON DELETE SET NULL ON UPDATE CASCADE;
