import { PrismaClient } from '@prisma/client'

// Em desenvolvimento o Next recarrega os modulos a cada alteracao; guardamos o
// cliente no escopo global para nao abrir conexoes demais com o banco.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({ log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'] })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
