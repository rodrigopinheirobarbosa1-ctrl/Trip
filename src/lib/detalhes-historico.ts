/**
 * Texto completo de um lançamento para o histórico. Usado ao excluir: o
 * registro some do banco, mas tudo o que é preciso para lançá-lo de novo
 * (inclusive o que o extrato não mostra, como o valor pago e o bônus) fica
 * guardado no histórico.
 *
 * Código puro, testado em testes/detalhes-historico.test.ts.
 */
import { formatarData, formatarPercentual, formatarPontos, formatarReais } from './formatos'
import { CATEGORIAS_ENTRADA, FORMAS_PAGAMENTO, TIPOS_SAIDA, rotulo } from './rotulos'

const juntar = (partes: (string | null | false | undefined)[]) => partes.filter(Boolean).join('; ')

export function detalharEntrada(e: {
  data: Date
  titular: { nome: string }
  programa: { nome: string }
  categoria: string
  pontos: number
  valor: number
  formaPagamento: string
  parcelas: number
  cartao?: { nome: string; final: string | null } | null
  observacao: string | null
}): string {
  const cmp = e.pontos > 0 && e.valor > 0 ? formatarReais(Math.round((e.valor / e.pontos) * 1000)) : null
  return juntar([
    `Entrada (${rotulo(CATEGORIAS_ENTRADA, e.categoria).toLowerCase()}) de ${formatarPontos(e.pontos)} pontos ${e.programa.nome}`,
    `pessoa: ${e.titular.nome}`,
    `data: ${formatarData(e.data)}`,
    `valor pago: ${formatarReais(e.valor)}${cmp ? ` (${cmp} o milheiro)` : ''}`,
    `pagamento: ${rotulo(FORMAS_PAGAMENTO, e.formaPagamento)}${e.parcelas > 1 ? ` em ${e.parcelas}x` : ''}`,
    e.cartao && `cartão: ${e.cartao.nome}${e.cartao.final && !e.cartao.nome.includes(e.cartao.final) ? ` final ${e.cartao.final}` : ''}`,
    e.observacao && `observação: ${e.observacao}`,
  ])
}

export function detalharTransferencia(t: {
  data: Date
  titular: { nome: string }
  origem: { nome: string }
  destino: { nome: string }
  pontos: number
  bonusPercentual: number
  pontosDestino: number
  observacao: string | null
}): string {
  return juntar([
    `Transferência ${t.origem.nome} → ${t.destino.nome}`,
    `pessoa: ${t.titular.nome}`,
    `data: ${formatarData(t.data)}`,
    `saíram ${formatarPontos(t.pontos)} pontos ${t.origem.nome}`,
    `bônus: ${formatarPercentual(t.bonusPercentual)}`,
    `chegaram ${formatarPontos(t.pontosDestino)} pontos ${t.destino.nome}`,
    t.observacao && `observação: ${t.observacao}`,
  ])
}

export function detalharSaida(s: {
  data: Date
  titular: { nome: string }
  programa: { nome: string }
  tipo: string
  pontos: number
  taxaEmbarque: number
  valorVenda: number
  fornecedor: string | null
  cliente: string | null
  localizador: string | null
  dataIda: Date | null
  dataVolta: Date | null
  passageiros: number | null
  origem: string | null
  destino: string | null
  formaRecebimento: string | null
  parcelas: number
  dataRecebimento: Date | null
  observacao: string | null
}): string {
  return juntar([
    `${rotulo(TIPOS_SAIDA, s.tipo)} de ${formatarPontos(s.pontos)} pontos ${s.programa.nome}`,
    `pessoa: ${s.titular.nome}`,
    `data: ${formatarData(s.data)}`,
    s.valorVenda > 0 && `valor da venda: ${formatarReais(s.valorVenda)}`,
    s.taxaEmbarque > 0 && `taxa de embarque: ${formatarReais(s.taxaEmbarque)}`,
    s.formaRecebimento &&
      `recebimento: ${rotulo(FORMAS_PAGAMENTO, s.formaRecebimento)}${s.parcelas > 1 ? ` em ${s.parcelas}x` : ''}` +
        (s.dataRecebimento ? ` em ${formatarData(s.dataRecebimento)}` : ''),
    s.cliente && `cliente: ${s.cliente}`,
    s.fornecedor && `fornecedor: ${s.fornecedor}`,
    s.localizador && `localizador: ${s.localizador}`,
    (s.origem || s.destino) && `trecho: ${s.origem ?? '?'} → ${s.destino ?? '?'}`,
    s.dataIda && `ida: ${formatarData(s.dataIda)}`,
    s.dataVolta && `volta: ${formatarData(s.dataVolta)}`,
    s.passageiros ? `passageiros: ${s.passageiros}` : null,
    s.observacao && `observação: ${s.observacao}`,
  ])
}
