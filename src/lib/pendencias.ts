import 'server-only'
import { db } from './db'
import { carregarCarteira, carregarNomes } from './dados'

export type Pendencia = {
  tipo: 'SALDO_NEGATIVO' | 'VENDA_SEM_VALOR'
  titulo: string
  detalhe: string
  link: string
}

/**
 * Problemas nos dados que precisam de alguém olhando. Na planilha eles
 * ficavam escondidos (saldo negativo aparecia como "-" ou passava batido).
 */
export async function listarPendencias(): Promise<Pendencia[]> {
  const [carteira, nomes, vendasSemValor] = await Promise.all([
    carregarCarteira(),
    carregarNomes(),
    db.saida.findMany({
      where: { tipo: 'VENDA', valorVenda: 0 },
      include: { titular: true, programa: true },
      orderBy: { data: 'asc' },
    }),
  ])

  const lista: Pendencia[] = []
  for (const p of carteira.posicoes.values()) {
    if (p.menorSaldo >= 0) continue
    const t = nomes.titular.get(p.titularId)?.nome ?? '?'
    const prog = nomes.programa.get(p.programaId)?.nome ?? '?'
    const quando = p.ficouNegativoEm?.toLocaleDateString('pt-BR', { timeZone: 'UTC' })
    lista.push({
      tipo: 'SALDO_NEGATIVO',
      titulo: `${prog} de ${t}: saíram mais pontos do que entraram`,
      detalhe:
        `O saldo ficou negativo em ${quando} (pior momento: ${p.menorSaldo.toLocaleString('pt-BR')} pontos; hoje: ` +
        `${p.pontos.toLocaleString('pt-BR')}). Normalmente falta lançar uma compra, um bônus ou um saldo inicial, ` +
        'ou a data de algum lançamento está errada.',
      link: `/extrato?titular=${p.titularId}&programa=${p.programaId}`,
    })
  }
  for (const s of vendasSemValor) {
    lista.push({
      tipo: 'VENDA_SEM_VALOR',
      titulo: `Venda sem valor: ${s.pontos.toLocaleString('pt-BR')} pontos ${s.programa.nome} de ${s.titular.nome}`,
      detalhe: `Emissão de ${s.data.toLocaleDateString('pt-BR', { timeZone: 'UTC' })} marcada como venda, mas sem valor de venda. O lucro dela aparece negativo.`,
      link: `/saidas/${s.id}`,
    })
  }
  return lista
}

export async function contarPendencias(): Promise<number> {
  return (await listarPendencias()).length
}
