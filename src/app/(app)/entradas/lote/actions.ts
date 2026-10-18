'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db } from '@/lib/db'
import { exigirUsuarioAction } from '@/lib/auth'
import { auditar } from '@/lib/audit'
import { detalharEntrada } from '@/lib/detalhes-historico'

/** Categorias que se editam em lote (os pontos não mudam, então o saldo também não). */
const CATEGORIAS = ['COMPRA', 'ACUMULO', 'PARCEIRO', 'BONUS', 'SALDO_INICIAL'] as const
const FORMAS = ['PIX', 'CARTAO', 'BOLETO', 'DINHEIRO', 'OUTRO', 'SEM_DESEMBOLSO'] as const

const Item = z.object({
  id: z.string(),
  categoria: z.enum(CATEGORIAS),
  valor: z.number().int().nonnegative(),
  formaPagamento: z.enum(FORMAS),
  parcelas: z.number().int().min(1).max(48),
  cartaoId: z.string().nullable(),
})
export type ItemLote = z.infer<typeof Item>

/** Regras de pagamento de cada entrada (as mesmas do formulário de uma entrada). */
function normalizar(i: ItemLote): ItemLote {
  // Parceiro (custo atribuído), saldo inicial e entradas sem valor não saem do caixa.
  const semCaixa = i.valor === 0 || i.categoria === 'PARCEIRO' || i.categoria === 'SALDO_INICIAL'
  const formaPagamento = semCaixa ? 'SEM_DESEMBOLSO' : i.formaPagamento === 'SEM_DESEMBOLSO' ? 'CARTAO' : i.formaPagamento
  const parcelas = formaPagamento === 'SEM_DESEMBOLSO' || formaPagamento === 'PIX' ? 1 : i.parcelas
  return { ...i, formaPagamento, parcelas, cartaoId: formaPagamento === 'CARTAO' ? i.cartaoId : null }
}

/** Grava as alterações de várias entradas de uma vez. Só o que mudou é gravado. */
export async function salvarLote(itens: ItemLote[]): Promise<{ erro?: string; ok?: string }> {
  const usuario = await exigirUsuarioAction()
  const r = z.array(Item).max(1000).safeParse(itens)
  if (!r.success) return { erro: 'Dados inválidos. Recarregue a página e tente de novo.' }
  const novos = r.data.map(normalizar)
  const atuais = await db.entrada.findMany({
    where: { id: { in: novos.map((n) => n.id) } },
    include: { titular: true, programa: true, cartao: true },
  })
  const porId = new Map(atuais.map((a) => [a.id, a]))
  const cartoes = new Map((await db.cartao.findMany()).map((c) => [c.id, c]))

  const mudancas = novos.filter((n) => {
    const a = porId.get(n.id)
    if (!a || a.categoria === 'AJUSTE') return false
    return (
      a.categoria !== n.categoria || a.valor !== n.valor || a.formaPagamento !== n.formaPagamento ||
      a.parcelas !== n.parcelas || (a.cartaoId ?? null) !== (n.cartaoId ?? null)
    )
  })
  if (mudancas.length === 0) return { ok: 'Nada mudou.' }

  await db.$transaction(
    mudancas.map((n) =>
      db.entrada.update({
        where: { id: n.id },
        data: { categoria: n.categoria, valor: n.valor, formaPagamento: n.formaPagamento, parcelas: n.parcelas, cartaoId: n.cartaoId },
      }),
    ),
  )
  for (const n of mudancas) {
    const a = porId.get(n.id)!
    const depois = { ...a, ...n, cartao: n.cartaoId ? (cartoes.get(n.cartaoId) ?? null) : null }
    await auditar({
      usuario,
      acao: 'ALTERAR',
      entidade: 'Entrada',
      entidadeId: n.id,
      resumo: `Alterou em lote — antes: ${detalharEntrada(a)} — depois: ${detalharEntrada(depois)}`,
    })
  }
  revalidatePath('/', 'layout')
  return { ok: `${mudancas.length} entrada(s) atualizada(s).` }
}
