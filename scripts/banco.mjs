/**
 * Descobre os endereços do banco a partir das variáveis que existirem.
 * Usado no build (scripts/build.mjs) e na aplicação (src/lib/db.ts).
 *
 * Devolve uma cópia das variáveis com DATABASE_URL (conexão normal) e
 * DATABASE_URL_UNPOOLED (conexão direta, para criar as tabelas) preenchidas.
 */
export function resolverEnderecosDoBanco(original) {
  const env = { ...original }
  const direto = (v) => (v && !v.startsWith('prisma+') ? v : undefined)

  // O endereço "prisma+postgres://" só funciona com um complemento pago do
  // Prisma; preferimos sempre a conexão postgres:// comum.
  env.DATABASE_URL = direto(env.DATABASE_URL) ?? direto(env.POSTGRES_PRISMA_URL) ?? direto(env.POSTGRES_URL)
  env.DATABASE_URL_UNPOOLED =
    direto(env.DATABASE_URL_UNPOOLED) ?? direto(env.POSTGRES_URL_NON_POOLING) ?? direto(env.POSTGRES_URL) ?? env.DATABASE_URL

  if (!env.DATABASE_URL) delete env.DATABASE_URL
  if (!env.DATABASE_URL_UNPOOLED) delete env.DATABASE_URL_UNPOOLED
  return env
}
