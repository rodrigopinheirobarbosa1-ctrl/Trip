import 'server-only'
import { db } from './db'
import type { UsuarioLogado } from './auth'
import type { Retrato } from './relancar'

/**
 * Registra no histórico quem fez o quê e quando. Com várias pessoas usando o
 * sistema, é o que responde "quem lançou isto?".
 */
export async function auditar(registro: {
  usuario: UsuarioLogado
  acao: 'CRIAR' | 'ALTERAR' | 'EXCLUIR' | 'LOGIN' | 'IMPORTAR' | 'PRIMEIRO_ACESSO'
  entidade: string
  entidadeId?: string | null
  resumo: string
  /** Exclusões: cópia do lançamento, para o botão "Relançar" do histórico. */
  dados?: Retrato
}): Promise<void> {
  await db.auditoria.create({
    data: {
      usuarioId: registro.usuario.id,
      usuarioNome: registro.usuario.nome,
      acao: registro.acao,
      entidade: registro.entidade,
      entidadeId: registro.entidadeId ?? null,
      resumo: registro.resumo,
      ...(registro.dados ? { dados: registro.dados } : {}),
    },
  })
}
