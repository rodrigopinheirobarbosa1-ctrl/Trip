/**
 * Cria o arquivo .env na primeira execução, a partir do .env.example.
 *
 * O .env guarda o endereço do banco, por isso nunca é enviado ao GitHub.
 * Na Vercel ele não é usado: as variáveis vêm do painel.
 */
import { copyFileSync, existsSync } from 'node:fs'
import path from 'node:path'

const raiz = process.cwd()
const destino = path.join(raiz, '.env')
const modelo = path.join(raiz, '.env.example')

if (existsSync(destino) || process.env.DATABASE_URL) process.exit(0)

if (!existsSync(modelo)) {
  console.error('Não encontrei o arquivo .env.example. Verifique se o download do projeto está completo.')
  process.exit(1)
}

copyFileSync(modelo, destino)
console.log('Arquivo .env criado a partir do .env.example.')
