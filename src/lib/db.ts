import { PrismaClient } from '@prisma/client'

// Endereço do banco. Cada provedor usa um nome de variável diferente (ver
// scripts/banco.mjs); o "prisma+postgres://" é trocado pela conexão comum.
function enderecoDoBanco(): string | undefined {
  const direto = (v?: string) => (v && !v.startsWith('prisma+') ? v : undefined)
  return direto(process.env.DATABASE_URL) ?? direto(process.env.POSTGRES_PRISMA_URL) ?? direto(process.env.POSTGRES_URL)
}

// Em desenvolvimento o Next recarrega os modulos a cada alteracao; guardamos o
// cliente no escopo global para nao abrir conexoes demais com o banco.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasourceUrl: enderecoDoBanco(),
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
