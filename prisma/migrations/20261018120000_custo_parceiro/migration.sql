-- Acúmulo em parceiro de produto: custo atribuído, sem desembolso.
ALTER TYPE "CategoriaEntrada" ADD VALUE 'PARCEIRO';

ALTER TABLE "Programa" ADD COLUMN "custoParceiroMilheiro" INTEGER;
