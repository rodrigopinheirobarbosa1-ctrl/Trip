import 'server-only'
/**
 * Ligação com o Claude (conector MCP em /api/mcp/<chave>).
 *
 * O endereço tem uma chave secreta longa: quem tem o endereço tem acesso, como
 * uma senha. No banco fica só o hash da chave (não dá para recuperá-la);
 * gerar uma nova invalida a anterior. A edição pode ser desligada, deixando o
 * Claude só com leitura.
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { db } from './db'
import type { UsuarioLogado } from './auth'

const CHAVE_HASH = 'claude_chave_hash'
const EDICAO = 'claude_edicao'

/** Quem aparece no histórico e em "Lançado por" quando o Claude altera algo. */
export const USUARIO_CLAUDE: UsuarioLogado = { id: '', nome: 'Claude (assistente)', email: '', papel: 'OPERADOR' }

const hash = (chave: string) => createHash('sha256').update(chave).digest('hex')

async function ler(chave: string): Promise<string | null> {
  return (await db.configuracao.findUnique({ where: { chave } }))?.valor ?? null
}
async function gravar(chave: string, valor: string) {
  await db.configuracao.upsert({ where: { chave }, create: { chave, valor }, update: { valor } })
}

export async function situacaoLigacao(): Promise<{ ligada: boolean; edicao: boolean; desde: Date | null }> {
  const [h, e] = await Promise.all([
    db.configuracao.findUnique({ where: { chave: CHAVE_HASH } }),
    ler(EDICAO),
  ])
  return { ligada: !!h, edicao: e !== 'nao', desde: h?.atualizadoEm ?? null }
}

/** Gera uma chave nova (a anterior deixa de funcionar) e devolve a chave em texto, uma única vez. */
export async function gerarChave(): Promise<string> {
  const chave = randomBytes(32).toString('base64url')
  await gravar(CHAVE_HASH, hash(chave))
  return chave
}

export async function desligar(): Promise<void> {
  await db.configuracao.deleteMany({ where: { chave: CHAVE_HASH } })
}

export async function definirEdicao(permitir: boolean): Promise<void> {
  await gravar(EDICAO, permitir ? 'sim' : 'nao')
}

/** Confere a chave do endereço. Devolve se a edição está liberada, ou null se a chave não vale. */
export async function conferirChave(chave: string): Promise<{ edicao: boolean } | null> {
  const guardado = await ler(CHAVE_HASH)
  if (!guardado || chave.length < 20) return null
  const a = Buffer.from(hash(chave), 'hex')
  const b = Buffer.from(guardado, 'hex')
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  return { edicao: (await ler(EDICAO)) !== 'nao' }
}
