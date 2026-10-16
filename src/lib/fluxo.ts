/**
 * Fluxo de caixa mensal. (Planilha: aba "Fluxo de Caixa")
 *
 * Código puro (sem banco), testado em testes/fluxo.test.ts.
 *
 * Saídas de dinheiro:
 *  - compras de pontos, divididas nas parcelas a partir do mês da compra;
 *  - taxas de embarque pagas nas emissões, no mês da emissão;
 *  - saídas financeiras avulsas.
 * Entradas de dinheiro:
 *  - vendas, divididas nas parcelas a partir do mês do recebimento;
 *  - entradas financeiras avulsas.
 *
 * Lançamentos marcados como "sem desembolso" (bônus, saldo inicial) não
 * entram no caixa — não saiu dinheiro por eles.
 */
import { chaveMes, somarMeses } from './formatos'

export type ItemCaixa = {
  /** Mês da primeira parcela. */
  data: Date
  /** Valor total em centavos (sempre positivo). */
  valor: number
  parcelas: number
  sentido: 'ENTRADA' | 'SAIDA'
}

export type MesFluxo = {
  mes: string // "2026-01"
  entradas: number
  saidas: number
  saldo: number
  acumulado: number
}

/** Divide um valor em parcelas que somam exatamente o total. */
export function dividirEmParcelas(total: number, parcelas: number): number[] {
  const n = Math.max(1, Math.floor(parcelas))
  const base = Math.trunc(total / n)
  const resto = total - base * n
  return Array.from({ length: n }, (_, i) => base + (i < resto ? 1 : 0))
}

/**
 * Monta o fluxo dos meses pedidos. O acumulado começa no saldo inicial e
 * soma também tudo o que aconteceu antes do primeiro mês mostrado — assim o
 * saldo de janeiro já considera o dezembro anterior.
 */
export function calcularFluxo(itens: ItemCaixa[], meses: string[], saldoInicial: number): MesFluxo[] {
  const porMes = new Map<string, { entradas: number; saidas: number }>()
  const somar = (mes: string, sentido: ItemCaixa['sentido'], valor: number) => {
    const m = porMes.get(mes) ?? { entradas: 0, saidas: 0 }
    if (sentido === 'ENTRADA') m.entradas += valor
    else m.saidas += valor
    porMes.set(mes, m)
  }

  for (const item of itens) {
    if (item.valor === 0) continue
    const inicio = chaveMes(item.data)
    dividirEmParcelas(item.valor, item.parcelas).forEach((v, i) => somar(somarMeses(inicio, i), item.sentido, v))
  }

  const primeiro = [...meses].sort()[0]
  let acumulado = saldoInicial
  for (const [mes, m] of porMes) {
    if (primeiro && mes < primeiro) acumulado += m.entradas - m.saidas
  }

  return [...meses].sort().map((mes) => {
    const m = porMes.get(mes) ?? { entradas: 0, saidas: 0 }
    const saldo = m.entradas - m.saidas
    acumulado += saldo
    return { mes, entradas: m.entradas, saidas: m.saidas, saldo, acumulado }
  })
}

/** "2026" -> ["2026-01", ..., "2026-12"] */
export function mesesDoAno(ano: number): string[] {
  return Array.from({ length: 12 }, (_, i) => `${ano}-${String(i + 1).padStart(2, '0')}`)
}
