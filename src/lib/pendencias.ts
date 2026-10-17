import 'server-only'
import { db } from './db'
import { carregarCarteira, carregarNomes } from './dados'

export type Pendencia = {
  tipo: 'SALDO_NEGATIVO' | 'VENDA_SEM_VALOR' | 'CUSTO_SUBESTIMADO'
  titulo: string
  detalhe: string
  link: string
}

/**
 * Problemas nos dados que precisam de alguém olhando. Na planilha eles
 * ficavam escondidos (saldo negativo aparecia como "-" ou passava batido).
 */
export async function listarPendencias(): Promise<Pendencia[]> {
  const [carteira, nomes, vendasSemValor, transferencias, saidas] = await Promise.all([
    carregarCarteira(),
    carregarNomes(),
    db.saida.findMany({
      where: { tipo: 'VENDA', valorVenda: 0 },
      include: { titular: true, programa: true },
      orderBy: { data: 'asc' },
    }),
    db.transferencia.findMany({ include: { titular: true, origem: true, destino: true }, orderBy: { data: 'asc' } }),
    db.saida.findMany({ include: { titular: true, programa: true }, orderBy: { data: 'asc' } }),
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
  // Pontos que saíram sem existir na origem: o custo usado é um palpite (o último CMP
  // conhecido), então o custo levado para o destino e o lucro das vendas não são confiáveis.
  const data = (d: Date) => d.toLocaleDateString('pt-BR', { timeZone: 'UTC' })
  for (const t of transferencias) {
    const c = carteira.custoTransferencias.get(t.id)
    if (!c || c.semLote <= 0) continue
    lista.push({
      tipo: 'CUSTO_SUBESTIMADO',
      titulo:
        `Transferência ${t.origem.nome} → ${t.destino.nome} de ${t.titular.nome} (${data(t.data)}): ` +
        `faltaram ${c.semLote.toLocaleString('pt-BR')} pontos na origem`,
      detalhe:
        `Saíram ${t.pontos.toLocaleString('pt-BR')} pontos, mas a ${t.origem.nome} de ${t.titular.nome} só tinha ` +
        `${(t.pontos - c.semLote).toLocaleString('pt-BR')} nessa data. O custo levado para a ${t.destino.nome} ` +
        `(R$ ${(c.custo / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}) não é confiável. ` +
        `Lance, com data anterior a ${data(t.data)}, as entradas da ${t.origem.nome} que faltam (ou importe o extrato).`,
      link: `/extrato?titular=${t.titularId}&programa=${t.origemId}`,
    })
  }
  for (const s of saidas) {
    const c = carteira.custoSaidas.get(s.id)
    if (!c || c.semLote <= 0) continue
    lista.push({
      tipo: 'CUSTO_SUBESTIMADO',
      titulo:
        `Emissão de ${s.pontos.toLocaleString('pt-BR')} pontos ${s.programa.nome} de ${s.titular.nome} (${data(s.data)}): ` +
        `faltaram ${c.semLote.toLocaleString('pt-BR')} pontos`,
      detalhe:
        `Nessa data o saldo não cobria a emissão. O custo (e o lucro, se for venda) não é confiável até lançar, com data ` +
        `anterior, as entradas que faltam.`,
      link: `/saidas/${s.id}`,
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
