/**
 * Carteira de pontos: saldo e custo de cada titular em cada programa.
 *
 * Código puro (sem banco): recebe os lançamentos e devolve os saldos. Por
 * isso é testado diretamente em testes/carteira.test.ts.
 *
 * MÉTODO: PEPS (primeiro que entra, primeiro que sai), por lotes.
 *  - Cada entrada de pontos (compra, bônus, transferência recebida) vira um
 *    LOTE com o seu próprio custo por milheiro.
 *  - Toda saída (venda, uso, transferência enviada) consome os lotes mais
 *    antigos primeiro. O custo da saída é o custo exato dos pontos que saíram.
 *  - A transferência leva para o destino o custo dos lotes que saíram da
 *    origem, num lote novo; o bônus entra sem custo e por isso baixa o CMP
 *    desse lote.
 *  - Exceção: a TRANSFERÊNCIA IMEDIATA (pontos comprados na hora para
 *    completar a transferência) usa primeiro o lote dessa compra. Os pontos
 *    comprados nunca ficaram na conta; o custo da operação é o da compra.
 *  - Assim, uma promoção barata e uma compra cara ficam separadas: não se
 *    misturam numa média.
 *
 * CMP da posição (custo médio por milheiro) = custo dos lotes que ainda têm
 * pontos / pontos restantes * 1000. É uma informação de resumo; o lucro das
 * vendas usa o custo real dos lotes consumidos.
 *
 * ORDEM: por data; no mesmo dia, entradas, depois transferências, depois
 * saídas (assim um bônus recebido de manhã já pode ser usado à tarde).
 *
 * FALTA DE SALDO (entradas que não foram lançadas): os pontos que saem sem
 * lote usam o custo do último lote conhecido, e ficam como "déficit". A
 * próxima entrada cobre primeiro esse déficit (aqueles pontos já tinham
 * saído) e só o que sobra dela fica disponível.
 */

export type MovEntrada = {
  id: string
  data: Date
  titularId: string
  programaId: string
  pontos: number
  valor: number // centavos
  ordem?: number // desempate no mesmo dia (ex.: criadoEm)
  /** Categoria da entrada; usada no CMP recente (saldo inicial e ajuste não contam). */
  categoria?: string
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
  /** Transferência imediata: a compra feita na hora, cujos pontos saem primeiro. */
  compraId?: string | null
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

/** Um lote de pontos, com custo próprio. */
export type Lote = {
  /** Id do lançamento que criou o lote (entrada ou transferência). */
  id: string
  origem: 'ENTRADA' | 'TRANSFERENCIA'
  data: Date
  /** Pontos que chegaram neste lote. */
  pontos: number
  /** Pontos ainda disponíveis. */
  restantes: number
  /** Pontos deste lote usados para cobrir saídas feitas antes dele (falta de saldo). */
  cobriuDeficit: number
  /** Custo total do lote em centavos (com fração). */
  custo: number
  /** Centavos por milheiro. */
  cmp: number
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

/** De qual lote saíram os pontos de uma operação. */
export type Consumo = { loteId: string; data: Date; pontos: number; cmp: number; custo: number }

/** Custo atribuído a cada saída e a cada transferência, na data em que ocorreu. */
export type CustoMovimento = {
  /** CMP médio dos pontos que saíram nesta operação (centavos por milheiro). */
  cmp: number
  /** Custo dos pontos que saíram (centavos, com fração). */
  custo: number
  /** Saldo de pontos da origem logo depois da operação. */
  saldoDepois: number
  /** Lotes consumidos, do mais antigo para o mais novo. */
  lotes: Consumo[]
  /** Pontos que saíram sem lote (faltava saldo), custeados pelo último CMP conhecido. */
  semLote: number
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
  /** Lotes de cada posição, do mais antigo para o mais novo (inclusive os esgotados). */
  lotes: Map<string, Lote[]>
}

export function chavePosicao(titularId: string, programaId: string): string {
  return `${titularId}|${programaId}`
}

type Evento =
  | { classe: 0; data: number; ordem: number; id: string; e: MovEntrada }
  | { classe: 1; data: number; ordem: number; id: string; t: MovTransferencia }
  | { classe: 2; data: number; ordem: number; id: string; s: MovSaida }

/** Estado interno de uma posição durante o cálculo. */
type Estado = {
  posicao: Posicao
  lotes: Lote[]
  /** Índice do lote mais antigo que ainda pode ter pontos. */
  inicio: number
  /** Pontos que saíram sem existir (falta de saldo). */
  deficit: number
  /** CMP do último lote conhecido, para custear pontos que faltaram. */
  ultimoCmp: number | null
}

export function calcularCarteira(movs: Movimentos, ate?: Date): Carteira {
  const eventos: Evento[] = [
    ...movs.entradas.map((e) => ({ classe: 0 as const, data: e.data.getTime(), ordem: e.ordem ?? 0, id: e.id, e })),
    ...movs.transferencias.map((t) => ({ classe: 1 as const, data: t.data.getTime(), ordem: t.ordem ?? 0, id: t.id, t })),
    ...movs.saidas.map((s) => ({ classe: 2 as const, data: s.data.getTime(), ordem: s.ordem ?? 0, id: s.id, s })),
  ]
    .filter((ev) => ate === undefined || ev.data <= ate.getTime())
    .sort((a, b) => a.data - b.data || a.classe - b.classe || a.ordem - b.ordem || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))

  const estados = new Map<string, Estado>()
  const custoSaidas = new Map<string, CustoMovimento>()
  const custoTransferencias = new Map<string, CustoMovimento>()
  const extratos = new Map<string, LinhaExtrato[]>()

  const estado = (titularId: string, programaId: string): Estado => {
    const chave = chavePosicao(titularId, programaId)
    let st = estados.get(chave)
    if (!st) {
      st = {
        posicao: { titularId, programaId, pontos: 0, custo: 0, cmp: null, menorSaldo: 0, ficouNegativoEm: null },
        lotes: [],
        inicio: 0,
        deficit: 0,
        ultimoCmp: null,
      }
      estados.set(chave, st)
      extratos.set(chave, [])
    }
    return st
  }

  /** Recalcula custo e CMP da posição a partir dos lotes restantes. */
  const atualizar = (st: Estado) => {
    let restantes = 0
    let custo = 0
    for (let i = st.inicio; i < st.lotes.length; i++) {
      const l = st.lotes[i]
      if (l.restantes <= 0) continue
      restantes += l.restantes
      custo += (l.cmp * l.restantes) / 1000
    }
    const p = st.posicao
    p.pontos = restantes - st.deficit
    p.custo = custo
    p.cmp = restantes > 0 ? (custo / restantes) * 1000 : null
  }

  const anotar = (st: Estado, linha: Omit<LinhaExtrato, 'saldo' | 'custoSaldo' | 'cmp'>) => {
    atualizar(st)
    const p = st.posicao
    if (p.pontos < p.menorSaldo) p.menorSaldo = p.pontos
    if (p.pontos < 0 && !p.ficouNegativoEm) p.ficouNegativoEm = linha.data
    extratos.get(chavePosicao(p.titularId, p.programaId))!.push({ ...linha, saldo: p.pontos, custoSaldo: p.custo, cmp: p.cmp })
  }

  /** Cria um lote novo (o déficit, se houver, é coberto primeiro). */
  const acrescentar = (st: Estado, lote: Omit<Lote, 'restantes' | 'cobriuDeficit' | 'cmp'>) => {
    const cmp = lote.pontos > 0 ? (lote.custo / lote.pontos) * 1000 : 0
    const cobre = Math.min(st.deficit, lote.pontos)
    st.deficit -= cobre
    st.lotes.push({ ...lote, cmp, restantes: lote.pontos - cobre, cobriuDeficit: cobre })
    st.ultimoCmp = cmp
  }

  /** Retira pontos dos lotes mais antigos primeiro (ou, antes de todos, do lote `primeiro`). */
  const retirar = (st: Estado, pontos: number, primeiro?: string | null): Omit<CustoMovimento, 'saldoDepois'> => {
    let falta = pontos
    let custo = 0
    const consumos: Consumo[] = []
    const escolhido = primeiro ? st.lotes.find((l) => l.id === primeiro && l.restantes > 0) : undefined
    if (escolhido) {
      const usa = Math.min(falta, escolhido.restantes)
      const c = (escolhido.cmp * usa) / 1000
      escolhido.restantes -= usa
      falta -= usa
      custo += c
      consumos.push({ loteId: escolhido.id, data: escolhido.data, pontos: usa, cmp: escolhido.cmp, custo: c })
    }
    while (falta > 0 && st.inicio < st.lotes.length) {
      const l = st.lotes[st.inicio]
      if (l.restantes <= 0) {
        st.inicio++
        continue
      }
      const usa = Math.min(falta, l.restantes)
      const c = (l.cmp * usa) / 1000
      l.restantes -= usa
      falta -= usa
      custo += c
      consumos.push({ loteId: l.id, data: l.data, pontos: usa, cmp: l.cmp, custo: c })
      st.ultimoCmp = l.cmp
      if (l.restantes === 0) st.inicio++
    }
    if (falta > 0) {
      // Faltou saldo: custeia pelo último CMP conhecido e guarda o déficit.
      custo += ((st.ultimoCmp ?? 0) * falta) / 1000
      st.deficit += falta
    }
    return { cmp: pontos > 0 ? (custo / pontos) * 1000 : 0, custo, lotes: consumos, semLote: falta }
  }

  for (const ev of eventos) {
    if (ev.classe === 0) {
      const { e } = ev
      const st = estado(e.titularId, e.programaId)
      if (e.pontos >= 0) {
        if (e.pontos > 0) acrescentar(st, { id: e.id, origem: 'ENTRADA', data: e.data, pontos: e.pontos, custo: e.valor })
        anotar(st, { tipo: 'ENTRADA', id: e.id, data: e.data, pontos: e.pontos, custo: e.valor })
      } else {
        // Ajuste negativo: funciona como uma saída.
        const r = retirar(st, -e.pontos)
        anotar(st, { tipo: 'ENTRADA', id: e.id, data: e.data, pontos: e.pontos, custo: -r.custo })
      }
    } else if (ev.classe === 1) {
      const { t } = ev
      const origem = estado(t.titularId, t.origemId)
      const r = retirar(origem, t.pontos, t.compraId)
      anotar(origem, { tipo: 'TRANSFERENCIA_ENVIADA', id: t.id, data: t.data, pontos: -t.pontos, custo: -r.custo })
      custoTransferencias.set(t.id, { ...r, saldoDepois: origem.posicao.pontos })

      const destino = estado(t.titularId, t.destinoId)
      if (t.pontosDestino > 0) {
        acrescentar(destino, { id: t.id, origem: 'TRANSFERENCIA', data: t.data, pontos: t.pontosDestino, custo: r.custo })
      }
      anotar(destino, { tipo: 'TRANSFERENCIA_RECEBIDA', id: t.id, data: t.data, pontos: t.pontosDestino, custo: r.custo })
    } else {
      const { s } = ev
      const st = estado(s.titularId, s.programaId)
      const r = retirar(st, s.pontos)
      anotar(st, { tipo: 'SAIDA', id: s.id, data: s.data, pontos: -s.pontos, custo: -r.custo })
      custoSaidas.set(s.id, { ...r, saldoDepois: st.posicao.pontos })
    }
  }

  const posicoes = new Map<string, Posicao>()
  const lotes = new Map<string, Lote[]>()
  for (const [chave, st] of estados) {
    posicoes.set(chave, st.posicao)
    lotes.set(chave, st.lotes)
  }
  return { posicoes, custoSaidas, custoTransferencias, extratos, lotes }
}

/**
 * Custo de tirar `pontos` de uma lista de lotes restantes, do mais antigo para
 * o mais novo (prévia nos formulários). Lotes no formato [pontos, cmp].
 * Devolve null se não houver pontos suficientes.
 */
export function previaPeps(lotes: [number, number][], pontos: number): { custo: number; cmp: number } | null {
  let falta = pontos
  let custo = 0
  for (const [restantes, cmp] of lotes) {
    if (falta <= 0) break
    const usa = Math.min(falta, restantes)
    custo += (cmp * usa) / 1000
    falta -= usa
  }
  if (falta > 0 || pontos <= 0) return null
  return { custo, cmp: (custo / pontos) * 1000 }
}

/**
 * CMP recente: quanto custou cada milheiro que ENTROU num período (compras,
 * acúmulos, bônus e transferências recebidas). Mostra o custo de gerar pontos
 * agora, independente do que ainda está guardado. Saldo inicial e ajustes não
 * entram, porque não são aquisições do período.
 */
export function calcularCmpRecente(
  movs: Movimentos,
  carteira: Carteira,
  desde: Date,
  ate: Date,
): Map<string, { pontos: number; custo: number; cmp: number | null }> {
  const total = new Map<string, { pontos: number; custo: number; cmp: number | null }>()
  const somar = (chave: string, pontos: number, custo: number) => {
    const t = total.get(chave) ?? { pontos: 0, custo: 0, cmp: null }
    t.pontos += pontos
    t.custo += custo
    t.cmp = t.pontos > 0 ? (t.custo / t.pontos) * 1000 : null
    total.set(chave, t)
  }
  const dentro = (d: Date) => d.getTime() >= desde.getTime() && d.getTime() <= ate.getTime()
  for (const e of movs.entradas) {
    if (e.pontos <= 0 || !dentro(e.data) || e.categoria === 'SALDO_INICIAL' || e.categoria === 'AJUSTE') continue
    somar(chavePosicao(e.titularId, e.programaId), e.pontos, e.valor)
  }
  for (const t of movs.transferencias) {
    if (t.pontosDestino <= 0 || !dentro(t.data)) continue
    somar(chavePosicao(t.titularId, t.destinoId), t.pontosDestino, carteira.custoTransferencias.get(t.id)?.custo ?? 0)
  }
  return total
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
