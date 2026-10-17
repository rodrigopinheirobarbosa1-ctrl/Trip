'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { exigirUsuarioAction } from '@/lib/auth'
import { auditar } from '@/lib/audit'
import { CATEGORIAS_ENTRADA, rotulo } from '@/lib/rotulos'
import { TROCAVEIS, type Trocavel } from '@/lib/custo-atribuido'

/** Troca a categoria de todas as entradas de um grupo (mesmo programa, categoria e observação). */
export async function reclassificarGrupo(dados: FormData): Promise<void> {
  const usuario = await exigirUsuarioAction()
  const programaId = String(dados.get('programaId') ?? '')
  const de = String(dados.get('de') ?? '') as Trocavel
  const para = String(dados.get('para') ?? '') as Trocavel
  const observacao = dados.get('observacao') === null ? null : String(dados.get('observacao'))
  if (!TROCAVEIS.includes(de) || !TROCAVEIS.includes(para) || de === para || !programaId) return
  // Só entradas sem pagamento: o que foi pago continua como está.
  const r = await db.entrada.updateMany({
    where: { programaId, categoria: de, observacao: observacao || null, formaPagamento: 'SEM_DESEMBOLSO' },
    data: { categoria: para },
  })
  const programa = await db.programa.findUnique({ where: { id: programaId } })
  await auditar({
    usuario,
    acao: 'ALTERAR',
    entidade: 'Entrada',
    resumo:
      `Reclassificou ${r.count} entrada(s) ${programa?.nome ?? ''} "${observacao || 'sem observação'}": ` +
      `${rotulo(CATEGORIAS_ENTRADA, de)} → ${rotulo(CATEGORIAS_ENTRADA, para)}`,
  })
  revalidatePath('/', 'layout')
}
