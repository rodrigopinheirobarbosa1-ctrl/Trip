/**
 * Custo atribuído aos pontos de parceiros de produto.
 *
 * Pontos ganhos ao comprar num parceiro (Uber, Amazon, Insider...) não têm
 * custo direto, mas a pessoa costuma pagar mais pelo produto para ganhá-los.
 * Esses pontos (categoria PARCEIRO) recebem um custo atribuído: o valor
 * informado no próprio lançamento ou, se vazio, o custo padrão do programa.
 * Não sai do caixa (sem desembolso): só entra no CMP e no lucro.
 *
 * Bônus do próprio programa (já pagos na mensalidade/anuidade) e pontos da
 * fatura do cartão continuam com custo zero.
 */
/** Categorias sem pagamento que se trocam entre si: só muda o custo, nunca os pontos nem o caixa. */
export const TROCAVEIS = ['ACUMULO', 'PARCEIRO', 'BONUS'] as const
export type Trocavel = (typeof TROCAVEIS)[number]

export function custoDaEntrada(
  e: { categoria: string; pontos: number; valor: number },
  custoParceiroMilheiro: number | null | undefined,
): { valor: number; atribuido: boolean } {
  if (e.categoria !== 'PARCEIRO') return { valor: e.valor, atribuido: false }
  if (e.valor > 0) return { valor: e.valor, atribuido: true }
  if (!custoParceiroMilheiro || e.pontos <= 0) return { valor: 0, atribuido: false }
  return { valor: Math.round((e.pontos * custoParceiroMilheiro) / 1000), atribuido: true }
}
