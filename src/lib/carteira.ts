/**
 * Carteira de pontos: saldo e custo de cada titular em cada programa.
 *
 * Código puro (sem banco): recebe os lançamentos e devolve os saldos. Por
 * isso é testado diretamente em testes/carteira.test.ts.
 *
 * MÉTODO: custo médio ponderado móvel.
 *  - Cada entrada soma pontos e soma o valor pago ao custo da posição.
 *  - Toda saída (venda, uso, transferência enviada) retira pontos pelo CMP
 *    do momento, e o custo da posição cai na mesma proporção.
 *  - A transferência leva para o destino o custo dos pontos que saíram da
 *    origem; o bônus entra sem custo e por isso baixa o CMP do destino.
 *
 * CMP (custo médio por milheiro) = custo da posição / pontos * 1000.
 *
 * Diferença em relação à planilha: lá o CMP era a média de TUDO o que já
 * entrou, mesmo de pontos que já foram vendidos. Aqui o CMP reflete só os
 * pontos que ainda estão na conta, que é o custo real do que sobrou.
 *
 * ORDEM: por data; no mesmo dia, entradas, depois transferências, depois
 * saídas (assim um bônus recebido de manhã já pode ser usado à tarde).
 */

export type MovEntrada = {
  id: string
  data: Date
  titularId: string
  programaId: string
  pontos: number
  valor: number // centavos
  ordem?: number // desempate no mesmo dia (ex.: criadoEm)
}

export type MovTransferencia = {
  id: string
  data: Date
  titularId: string
  origemId: string
  destinoId: string
  pontos: number
  pontosDestino: number
  ordem?: number
}

export type MovSaida = {
  id: string
  data: Date
  titularId: string
  programaId: string
  pontos: number
  ordem?: number
}

export type Movimentos = {
  entradas: MovEntrada[]
  transferencias: MovTransferencia[]
  saidas: MovSaida[]
}

export type Posicao = {
  titularId: string
  programaId: string
  pontos: number
  /** Custo dos pontos que ainda estão na conta, em centavos (com fração). */
  custo: number
  /** Centavos por milheiro; null quando não há pontos. */
  cmp: number | null
  /** Menor saldo que a posição já teve (negativo = faltaram pontos). */
  menorSaldo: number
  /** Data em que o saldo ficou negativo pela primeira vez. */
  ficouNegativoEm: Date | null
}

/** Custo atribuído a cada saída e a cada transferência, na data em que ocorreu. */
export type CustoMovimento = {
  /** CMP usado na operação (centavos por milheiro). */
  cmp: number
  /** Custo dos pontos que saíram (centavos, com fração). */
  custo: number
  /** Saldo de pontos da origem logo depois da operação. */
  saldoDepois: number
}

export type LinhaExtrato = {
  tipo: 'ENTRADA' | 'TRANSFERENCIA_ENVIADA' | 'TRANSFERENCIA_RECEBIDA' | 'SAIDA'
  id: string
  data: Date
  pontos: number // positivo entra, negativo sai
  custo: number // positivo entra, negativo sai
  saldo: number
  custoSaldo: number
  cmp: number | null
}

export type Carteira = {
  posicoes: Map<string, Posicao>
  custoSaidas: Map<string, CustoMovimento>
  custoTransferencias: Map<string, CustoMovimento>
  extratos: Map<string, LinhaExtrato[]>
}

export function chavePosicao(titularId: string, programaId: string): string {
  return `${titularId}|${programaId}`
}

type Evento =
  | { classe: 0; data: number; ordem: number; id: string; e: MovEntrada }
  | { classe: 1; data: number; ordem: number; id: string; t: MovTransferencia }
  | { classe: 2; data: number; ordem: number; id: string; s: MovSaida }

function cmpDe(p: Posicao): number | null {
  return p.pontos > 0 ? (p.custo / p.pontos) * 1000 : null
}

export function calcularCarteira(movs: Movimentos, ate?: Date): Carteira {
  const eventos: Evento[] = [
    ...movs.entradas.map((e) => ({ classe: 0 as const, data: e.data.getTime(), ordem: e.ordem ?? 0, id: e.id, e })),
    ...movs.transferencias.map((t) => ({ classe: 1 as const, data: t.data.getTime(), ordem: t.ordem ?? 0, id: t.id, t })),
    ...movs.saidas.map((s) => ({ classe: 2 as const, data: s.data.getTime(), ordem: s.ordem ?? 0, id: s.id, s })),
  ]
    .filter((ev) => ate === undefined || ev.data <= ate.getTime())
    .sort((a, b) => a.data - b.data || a.classe - b.classe || a.ordem - b.ordem || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))

  const posicoes = new Map<string, Posicao>()
  const custoSaidas = new Map<string, CustoMovimento>()
  const custoTransferencias = new Map<string, CustoMovimento>()
  const extratos = new Map<string, LinhaExtrato[]>()

  const posicao = (titularId: string, programaId: string): Posicao => {
    const chave = chavePosicao(titularId, programaId)
    let p = posicoes.get(chave)
    if (!p) {
      p = { titularId, programaId, pontos: 0, custo: 0, cmp: null, menorSaldo: 0, ficouNegativoEm: null }
      posicoes.set(chave, p)
      extratos.set(chave, [])
    }
    return p
  }

  const anotar = (p: Posicao, linha: Omit<LinhaExtrato, 'saldo' | 'custoSaldo' | 'cmp'>) => {
    p.cmp = cmpDe(p)
    if (p.cmp !== null) ultimoCmp.set(p, p.cmp)
    if (p.pontos < p.menorSaldo) p.menorSaldo = p.pontos
    if (p.pontos < 0 && !p.ficouNegativoEm) p.ficouNegativoEm = linha.data
    extratos.get(chavePosicao(p.titularId, p.programaId))!.push({
      ...linha,
      saldo: p.pontos,
      custoSaldo: p.custo,
      cmp: p.cmp,
    })
  }

  // Último CMP conhecido de cada posição. Quando faltam pontos (entradas que
  // não foram lançadas), a saída usa esse custo em vez de zero: é a melhor
  // estimativa do que os pontos que faltam custaram, e evita que uma
  // transferência leve custo zero e derrube o CMP do destino.
  const ultimoCmp = new Map<Posicao, number>()

  /** Retira pontos pelo CMP atual e devolve o custo retirado. */
  const retirar = (p: Posicao, pontos: number): { cmp: number; custo: number } => {
    const cmp = cmpDe(p) ?? ultimoCmp.get(p) ?? 0
    const custo = (cmp * pontos) / 1000
    p.pontos -= pontos
    p.custo = p.pontos > 0 ? Math.max(0, p.custo - custo) : 0
    return { cmp, custo }
  }

  for (const ev of eventos) {
    if (ev.classe === 0) {
      const { e } = ev
      const p = posicao(e.titularId, e.programaId)
      if (e.pontos >= 0) {
        p.pontos += e.pontos
        p.custo += e.valor
        anotar(p, { tipo: 'ENTRADA', id: e.id, data: e.data, pontos: e.pontos, custo: e.valor })
      } else {
        // Ajuste negativo: funciona como uma saída.
        const r = retirar(p, -e.pontos)
        anotar(p, { tipo: 'ENTRADA', id: e.id, data: e.data, pontos: e.pontos, custo: -r.custo })
      }
    } else if (ev.classe === 1) {
      const { t } = ev
      const origem = posicao(t.titularId, t.origemId)
      const r = retirar(origem, t.pontos)
      custoTransferencias.set(t.id, { ...r, saldoDepois: origem.pontos })
      anotar(origem, { tipo: 'TRANSFERENCIA_ENVIADA', id: t.id, data: t.data, pontos: -t.pontos, custo: -r.custo })

      const destino = posicao(t.titularId, t.destinoId)
      destino.pontos += t.pontosDestino
      destino.custo += r.custo
      anotar(destino, { tipo: 'TRANSFERENCIA_RECEBIDA', id: t.id, data: t.data, pontos: t.pontosDestino, custo: r.custo })
    } else {
      const { s } = ev
      const p = posicao(s.titularId, s.programaId)
      const r = retirar(p, s.pontos)
      custoSaidas.set(s.id, { ...r, saldoDepois: p.pontos })
      anotar(p, { tipo: 'SAIDA', id: s.id, data: s.data, pontos: -s.pontos, custo: -r.custo })
    }
  }

  return { posicoes, custoSaidas, custoTransferencias, extratos }
}

/**
 * Confere se uma alteração deixa algum saldo negativo.
 *
 * Compara a carteira antes e depois: só reclama se a alteração PIORA um
 * saldo que fica negativo. Assim, dados antigos já inconsistentes (vindos da
 * planilha) não travam lançamentos que não têm nada a ver com o problema.
 *
 * Devolve null se está tudo certo, ou a posição que ficaria negativa.
 */
export function conferirSaldos(
  antes: Movimentos,
  depois: Movimentos,
  chaves: string[],
): { titularId: string; programaId: string; menorSaldo: number; data: Date | null } | null {
  const ca = calcularCarteira(antes)
  const cd = calcularCarteira(depois)
  for (const chave of chaves) {
    const d = cd.posicoes.get(chave)
    if (!d || d.menorSaldo >= 0) continue
    const a = ca.posicoes.get(chave)
    const menorAntes = a?.menorSaldo ?? 0
    if (d.menorSaldo < menorAntes) {
      // Primeiro momento em que o saldo fica abaixo do pior saldo anterior.
      const linha = cd.extratos.get(chave)?.find((l) => l.saldo < Math.min(0, menorAntes))
      return { titularId: d.titularId, programaId: d.programaId, menorSaldo: d.menorSaldo, data: linha?.data ?? null }
    }
  }
  return null
}

/** Pontos que chegam no destino: 200.000 com 90% de bônus -> 380.000. */
export function calcularPontosDestino(pontos: number, bonusPercentual: number): number {
  return Math.round(pontos * (1 + bonusPercentual / 100))
}
