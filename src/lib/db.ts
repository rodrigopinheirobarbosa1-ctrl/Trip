import { PrismaClient } from '@prisma/client'

// Endereço do banco. Cada provedor usa um nome de variável diferente (ver
// scripts/banco.mjs); o "prisma+postgres://" é trocado pela conexão comum.
function enderecoDoBanco(): string | undefined {
  const direto = (v?: string) => (v && !v.startsWith('prisma+') ? v : undefined)
  const url = direto(process.env.DATABASE_URL) ?? direto(process.env.POSTGRES_PRISMA_URL) ?? direto(process.env.POSTGRES_URL)
  return url ? limitarConexoes(url) : undefined
}

/**
 * Na Vercel cada acesso pode rodar numa cópia separada do servidor, e cada
 * cópia abriria várias conexões. O banco gratuito aceita poucas: limitamos a
 * 2 por cópia, com espera de até 20 s por uma conexão livre em vez de erro.
 * Um limite já escrito no endereço do banco é respeitado.
 */
function limitarConexoes(url: string): string {
  if (process.env.NODE_ENV !== 'production' || /[?&]connection_limit=/.test(url)) return url
  return `${url}${url.includes('?') ? '&' : '?'}connection_limit=2&pool_timeout=20`
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
