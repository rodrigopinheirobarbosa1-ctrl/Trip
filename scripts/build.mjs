/**
 * Build usado na Vercel (e no "npm run build").
 *
 * Cada provedor de banco cria variáveis com nomes um pouco diferentes:
 *  - Neon:            DATABASE_URL + DATABASE_URL_UNPOOLED
 *  - Prisma Postgres: DATABASE_URL + POSTGRES_URL (+ PRISMA_DATABASE_URL)
 *  - Vercel Postgres: POSTGRES_PRISMA_URL + POSTGRES_URL_NON_POOLING
 * Aqui juntamos tudo nos dois nomes que o projeto usa e depois criamos/
 * atualizamos as tabelas e geramos o site.
 */
import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolverEnderecosDoBanco } from './banco.mjs'

// No computador as variáveis ficam no arquivo .env; na Vercel, no painel.
if (existsSync('.env')) process.loadEnvFile('.env')

const env = resolverEnderecosDoBanco(process.env)
if (!env.DATABASE_URL) {
  console.error(
    '\n*** Banco de dados não configurado. ***\n' +
      'Na Vercel: abra o projeto > aba Storage > crie ou conecte um banco Postgres e depois clique em Redeploy.\n',
  )
  process.exit(1)
}

const rodar = (comando) => execSync(comando, { stdio: 'inherit', env })
rodar('npx prisma generate')
rodar('npx prisma migrate deploy')
rodar('npx next build')
