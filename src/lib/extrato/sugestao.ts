/**
 * Conferência de extratos: transforma as linhas lidas do extrato de um
 * programa em sugestões de lançamento.
 *
 * Código puro (sem banco nem IA), testado em testes/extrato.test.ts.
 *
 * Para cada linha:
 *  1. procura um lançamento que já existe (mesma pessoa e programa, mesma
 *     quantidade de pontos, data até 3 dias de diferença), para não duplicar;
 *     Se não achar, mas houver uma transferência recebida na mesma época que
 *     parece ser esta linha com outro total (o bônus ficou errado ou de fora,
 *     comum no que veio da planilha), sugere corrigir o bônus dela;
 *  2. sugere o tipo: primeiro pela regra que a pessoa já usou para uma linha
 *     igual; se não houver, pelo texto (bônus, compra, resgate para outro
 *     programa...).
 */

export type LinhaLida = {
  /** "2026-09-28" */
  data: string
  /** Como aparece no extrato: "Acúmulo", "Resgate", "Pontos + Dinheiro"... */
  operacao: string
  /** Parceiro / descrição: "Clube Livelo", "Smiles", "Compra de Pontos"... */
  descricao: string
  /** Positivo entra, negativo sai. */
  pontos: number
  observacao: string | null
  /** Passagens: localizador da reserva, quando o extrato mostra. */
  localizador?: string | null
  /** De qual arquivo/página veio (para mostrar e para tirar repetidas). */
  pagina: number
}

export const ACOES = {
  COMPRA: 'Entrada: compra',
  ACUMULO: 'Entrada: acúmulo (cartão, voo: sem custo)',
  BONUS: 'Entrada: bônus do programa (sem custo)',
  PARCEIRO: 'Entrada: parceiro (custo atribuído)',
  TRANSF_RECEBIDA: 'Transferência recebida',
  TRANSF_ENVIADA: 'Transferência enviada',
  TRANSF_IMEDIATA: 'Transferência imediata (pontos + compra)',
  USO_PESSOAL: 'Saída: uso pessoal',
  VENDA: 'Saída: venda',
  OUTRA_SAIDA: 'Saída: outra (expiração, ajuste)',
  IGNORAR: 'Ignorar esta linha',
} as const
export type Acao = keyof typeof ACOES

export const ACOES_ENTRADA: Acao[] = ['COMPRA', 'ACUMULO', 'PARCEIRO', 'BONUS', 'TRANSF_RECEBIDA', 'IGNORAR']
export const ACOES_SAIDA: Acao[] = ['TRANSF_ENVIADA', 'TRANSF_IMEDIATA', 'USO_PESSOAL', 'VENDA', 'OUTRA_SAIDA', 'IGNORAR']

export type Regra = {
  chave: string
  acao: string
  outroProgramaId: string | null
  valorMilheiro: number | null
  bonusPercentual: number | null
}

export type Existentes = {
  entradas: { id: string; data: Date; pontos: number }[]
  /** Transferências que saíram deste programa (compraId: transferência imediata). */
  enviadas: { id: string; data: Date; pontos: number; compraId?: string | null }[]
  /** Transferências que chegaram neste programa. */
  recebidas: { id: string; data: Date; pontos: number; pontosDestino: number; origemId: string; bonusPercentual: number }[]
  saidas: { id: string; data: Date; pontos: number }[]
}

export type JaLancado = {
  tipo: 'ENTRADA' | 'TRANSFERENCIA' | 'SAIDA'
  id: string
  data: string
  /** Transferência imediata: a compra feita na hora, que também corresponde a esta linha. */
  compraId?: string
}

/** Transferência recebida que é esta linha, mas com outro total: corrigir o bônus. */
export type CorrecaoBonus = {
  id: string
  data: string
  origemId: string
  /** Pontos que saíram da origem (não mudam). */
  pontos: number
  bonusAtual: number
  pontosDestinoAtual: number
  bonusNovo: number
  /** Os pontos da linha do extrato. */
  pontosDestinoNovo: number
}

/** Bônus (%) que faz `pontos` virar `pontosDestino`, com duas casas. */
export function bonusQueResulta(pontos: number, pontosDestino: number): number {
  return Math.round((pontosDestino / pontos - 1) * 10000) / 100
}

export type Sugestao = {
  linha: LinhaLida
  chave: string
  acao: Acao
  outroProgramaId: string | null
  /** Custo por milheiro sugerido para compras (centavos), vindo da regra. */
  valorMilheiro: number | null
  bonusPercentual: number | null
  jaLancado: JaLancado | null
  corrigirBonus: CorrecaoBonus | null
  /** Esta linha é o bônus, mostrado à parte, da transferência com este id (entra na correção). */
  parteDe: string | null
  /** Devolução de um resgate que está lançado no sistema (e não no extrato): a emissão a excluir. */
  anulaSaida: { id: string; data: string } | null
  /** Lançamentos do sistema que esta linha mostra que devem sair (cancelamento): já vêm marcados. */
  excluirSugerido: string[]
  /** Por que esta sugestão (mostrado na tela). */
  motivo: string
}

/** Texto sem acento, minúsculo e com espaços simples. */
export function normalizar(t: string | null | undefined): string {
  return String(t ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/** Identifica "o mesmo tipo de linha" para lembrar a classificação. */
export function chaveDaLinha(l: Pick<LinhaLida, 'operacao' | 'descricao' | 'pontos'>): string {
  return `${l.pontos >= 0 ? '+' : '-'}|${normalizar(l.operacao)}|${normalizar(l.descricao)}`
}

/**
 * Tira linhas repetidas porque dois prints mostram o mesmo pedaço do extrato.
 * Só remove repetição ENTRE páginas diferentes: duas linhas iguais na mesma
 * página são lançamentos de verdade (ex.: dois acúmulos iguais no mesmo dia).
 */
export function juntarPaginas(paginas: LinhaLida[][]): LinhaLida[] {
  const resultado: LinhaLida[] = []
  const vistas = new Map<string, { pagina: number; quantas: number }[]>()
  for (const linhas of paginas) {
    // Conta quantas vezes cada linha aparece nesta página.
    const nestaPagina = new Map<string, number>()
    for (const l of linhas) {
      const k = `${l.data}|${chaveDaLinha(l)}|${l.pontos}`
      nestaPagina.set(k, (nestaPagina.get(k) ?? 0) + 1)
    }
    const jaAdicionadas = new Map<string, number>()
    for (const l of linhas) {
      const k = `${l.data}|${chaveDaLinha(l)}|${l.pontos}`
      const anteriores = vistas.get(k) ?? []
      const maxAnterior = Math.max(0, ...anteriores.map((a) => a.quantas))
      const usadas = jaAdicionadas.get(k) ?? 0
      // Se outra página já trouxe esta linha N vezes, as N primeiras daqui são repetição.
      if (usadas < maxAnterior) {
        jaAdicionadas.set(k, usadas + 1)
        continue
      }
      jaAdicionadas.set(k, usadas + 1)
      resultado.push(l)
    }
    for (const [k, quantas] of nestaPagina) {
      vistas.set(k, [...(vistas.get(k) ?? []), { pagina: linhas[0]?.pagina ?? 0, quantas }])
    }
  }
  return resultado.sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0))
}

/**
 * Procura um programa cadastrado citado no texto ("Resgate · Smiles").
 * Primeiro pelo nome inteiro; depois por uma palavra do nome com 5 letras ou
 * mais no começo de uma palavra do texto ("AccorHotels" -> "All Accor").
 */
export function programaCitado(texto: string, programas: { id: string; nome: string }[], excetoId: string): string | null {
  const limpar = (x: string) => normalizar(x).replace(/[^a-z0-9& ]/g, ' ').replace(/\s+/g, ' ').trim()
  const t = ` ${limpar(texto)} `
  // Nomes mais longos primeiro: "Latam Pass" antes de "Latam".
  const ordenados = [...programas].filter((p) => p.id !== excetoId).sort((a, b) => b.nome.length - a.nome.length)
  for (const p of ordenados) {
    const n = limpar(p.nome)
    if (n && t.includes(` ${n} `)) return p.id
  }
  for (const p of ordenados) {
    const palavras = limpar(p.nome).split(' ').filter((w) => w.length >= 5)
    if (palavras.some((w) => t.includes(` ${w}`))) return p.id
  }
  return null
}

/** Textos de pontos que vêm da fatura do cartão de crédito (sem custo). */
const CARTAO =
  /cartao|fatura|membership rewards|\bamex\b|american express|itau|itaucard|santander|bradesco|\bcaixa\b|\bbanco\b|nubank|\bc6\b|\bbtg\b|\bxp\b|sicredi|sicoob|credicard|ourocard|porto seguro|\binter\b|\bsafra\b|\bdiners\b|\bvisa\b|mastercard|\belo\b|credito de pontos/

/** Sugestão pelo texto da linha, quando não há regra aprendida. */
export function sugerirPeloTexto(
  l: LinhaLida,
  programas: { id: string; nome: string }[],
  programaId: string,
): { acao: Acao; outroProgramaId: string | null; motivo: string } {
  const op = normalizar(l.operacao)
  const desc = normalizar(l.descricao)
  const tudo = `${op} ${desc} ${normalizar(l.observacao)}`
  const outro = programaCitado(`${l.descricao} ${l.observacao ?? ''}`, programas, programaId)

  if (l.pontos >= 0) {
    // Bônus antes de transferência: a Smiles mostra o bônus de uma transferência numa
    // linha à parte ("Transf. Pontos + CM - Bônus"), que não tira pontos da origem.
    if (/bonus|bonific|promoc/.test(tudo)) return { acao: 'BONUS', outroProgramaId: null, motivo: 'texto fala em bônus' }
    const nomeOutro = outro ? normalizar(programas.find((p) => p.id === outro)?.nome) : ''
    if (outro && (/transf|resgate|conversao|recebid|parceir/.test(tudo) || tudo.includes(`pontos ${nomeOutro}`))) {
      return { acao: 'TRANSF_RECEBIDA', outroProgramaId: outro, motivo: 'cita outro programa' }
    }
    if (/compra de (pontos|milhas)|comprar (pontos|milhas)|clube/.test(tudo)) {
      return { acao: 'COMPRA', outroProgramaId: null, motivo: 'compra ou clube de pontos' }
    }
    // Fatura do cartão (sem custo) e voo: acúmulo. O resto vem de parceiro de produto.
    if (CARTAO.test(tudo)) return { acao: 'ACUMULO', outroProgramaId: null, motivo: 'pontos do cartão de crédito' }
    if (/\bvoo\b|\btrecho|\bvoar\b|booking|passagem/.test(tudo)) return { acao: 'ACUMULO', outroProgramaId: null, motivo: 'pontos de voo' }
    return { acao: 'PARCEIRO', outroProgramaId: null, motivo: 'compra em parceiro (custo atribuído)' }
  }
  if (/expira|vencid|vencimento|estorno|cancelad/.test(tudo)) {
    return { acao: 'OUTRA_SAIDA', outroProgramaId: null, motivo: 'expiração ou estorno' }
  }
  // "Pontos + Dinheiro" para outro programa: a parte em dinheiro comprou pontos na hora.
  if (outro && /dinheiro|imediat/.test(tudo)) {
    return { acao: 'TRANSF_IMEDIATA', outroProgramaId: outro, motivo: 'pontos + dinheiro para outro programa' }
  }
  if (outro) {
    return { acao: 'TRANSF_ENVIADA', outroProgramaId: outro, motivo: 'saída para outro programa' }
  }
  if (/transferid|grupo de transf|familia/.test(tudo)) {
    return { acao: 'OUTRA_SAIDA', outroProgramaId: null, motivo: 'transferência para outra pessoa' }
  }
  return { acao: 'USO_PESSOAL', outroProgramaId: null, motivo: 'pontos usados' }
}

const DIA = 86400000
const dataDe = (s: string) => new Date(`${s}T00:00:00Z`)

/** Monta as sugestões e marca o que já está lançado no sistema. */
export function montarSugestoes(
  linhas: LinhaLida[],
  contexto: { programaId: string; programas: { id: string; nome: string }[]; regras: Regra[]; existentes: Existentes },
): Sugestao[] {
  const regras = new Map(contexto.regras.map((r) => [r.chave, r]))
  const usados = new Set<string>()

  const casar = <T extends { id: string; data: Date }>(lista: T[], pontos: (x: T) => number, l: LinhaLida) => {
    const alvo = Math.abs(l.pontos)
    const d = dataDe(l.data).getTime()
    let melhor: T | null = null
    let melhorDif = Infinity
    for (const x of lista) {
      if (usados.has(x.id) || pontos(x) !== alvo) continue
      const dif = Math.abs(x.data.getTime() - d)
      if (dif <= 3 * DIA && dif < melhorDif) {
        melhor = x
        melhorDif = dif
      }
    }
    return melhor
  }

  // 1ª passada: o que já está lançado exatamente como no extrato.
  const lancados: (JaLancado | null)[] = linhas.map((l) => {
    if (l.pontos >= 0) {
      const e = casar(contexto.existentes.entradas, (x) => x.pontos, l)
      const t = e ? null : casar(contexto.existentes.recebidas, (x) => x.pontosDestino, l)
      const achado = e ?? t
      if (!achado) return null
      usados.add(achado.id)
      return { tipo: e ? 'ENTRADA' : 'TRANSFERENCIA', id: achado.id, data: achado.data.toISOString().slice(0, 10) }
    }
    const s = casar(contexto.existentes.saidas, (x) => x.pontos, l)
    const t = s ? null : casar(contexto.existentes.enviadas, (x) => x.pontos, l)
    const achado = s ?? t
    if (!achado) return null
    usados.add(achado.id)
    return { tipo: s ? 'SAIDA' : 'TRANSFERENCIA', id: achado.id, data: achado.data.toISOString().slice(0, 10) }
  })

  // Saída sem par que é uma transferência imediata já lançada: a transferência
  // tirou mais pontos, e a diferença é a compra feita na hora (ligada ou não).
  linhas.forEach((l, n) => {
    if (lancados[n] || l.pontos >= 0) return
    const proprios = -l.pontos
    const d = dataDe(l.data).getTime()
    const perto = (x: { data: Date }) => Math.abs(x.data.getTime() - d) <= 3 * DIA
    for (const t of contexto.existentes.enviadas) {
      if (usados.has(t.id) || t.pontos <= proprios || !perto(t)) continue
      const compra = contexto.existentes.entradas.find(
        (e) => !usados.has(e.id) && (t.compraId ? e.id === t.compraId : e.pontos === t.pontos - proprios && perto(e)),
      )
      if (!compra || compra.pontos !== t.pontos - proprios) continue
      usados.add(t.id)
      usados.add(compra.id)
      lancados[n] = { tipo: 'TRANSFERENCIA', id: t.id, data: t.data.toISOString().slice(0, 10), compraId: compra.id }
      return
    }
  })

  const textoDe = (l: LinhaLida) => normalizar(`${l.operacao} ${l.descricao} ${l.observacao ?? ''}`)
  const citadoEm = (l: LinhaLida) => programaCitado(`${l.descricao} ${l.observacao ?? ''}`, contexto.programas, contexto.programaId)
  const perto = (l: LinhaLida, x: { data: Date }) => Math.abs(dataDe(l.data).getTime() - x.data.getTime()) <= 3 * DIA
  const jaLancadoDe = (t: { id: string; data: Date }): JaLancado => ({ tipo: 'TRANSFERENCIA', id: t.id, data: t.data.toISOString().slice(0, 10) })

  const correcoes: (CorrecaoBonus | null)[] = linhas.map(() => null)
  /** Linha que é o bônus de uma transferência mostrado à parte (id da transferência). */
  const parteDe: (string | null)[] = linhas.map(() => null)
  const livre = (k: number) => !lancados[k] && !correcoes[k] && !parteDe[k]
  type Recebida = Existentes['recebidas'][number]
  // O bônus de uma transferência numa linha à parte (a Smiles mostra assim:
  // "Pontos Livelo 70.000" e "Transferência de pontos - Bônus 56.000").
  const ehBonusDe = (x: LinhaLida, t: Recebida) => {
    const c = citadoEm(x)
    return x.pontos > 0 && x.pontos / t.pontos >= 0.05 && /bonus|transf/.test(textoDe(x)) && (c === null || c === t.origemId)
  }
  const corrigir = (n: number, t: Recebida, total: number) => {
    correcoes[n] = {
      id: t.id,
      data: t.data.toISOString().slice(0, 10),
      origemId: t.origemId,
      pontos: t.pontos,
      bonusAtual: t.bonusPercentual,
      pontosDestinoAtual: t.pontosDestino,
      bonusNovo: bonusQueResulta(t.pontos, total),
      pontosDestinoNovo: total,
    }
  }

  // 2ª passada (a): transferência já casada pelos pontos que saíram da origem
  // (lançada sem bônus), com o bônus numa linha à parte: corrigir o total.
  linhas.forEach((m, n) => {
    const j = lancados[n]
    if (!j || j.tipo !== 'TRANSFERENCIA' || m.pontos <= 0) return
    const t = contexto.existentes.recebidas.find((x) => x.id === j.id)
    if (!t || m.pontos !== t.pontos) return
    const b = linhas.findIndex((x, k) => k !== n && livre(k) && perto(x, t) && ehBonusDe(x, t))
    if (b < 0) return
    lancados[n] = null
    corrigir(n, t, m.pontos + linhas[b].pontos)
    parteDe[b] = t.id
  })

  // 2ª passada (b): entrada sem par que é uma transferência recebida com outro total.
  // Só depois de todos os pares exatos, para não roubar o par de outra linha.
  linhas.forEach((l, n) => {
    if (!livre(n) || l.pontos <= 0) return
    const d = dataDe(l.data).getTime()
    const tudo = textoDe(l)
    const citado = citadoEm(l)
    let melhor: Recebida | null = null
    let melhorDif = Infinity
    for (const t of contexto.existentes.recebidas) {
      if (usados.has(t.id) || t.pontos <= 0 || t.pontosDestino === l.pontos) continue
      const dif = Math.abs(t.data.getTime() - d)
      if (dif > 3 * DIA || dif >= melhorDif) continue
      // Mesmo programa de origem citado, ou um texto de transferência sem citar outro.
      const parece = citado === t.origemId || (citado === null && /transf|resgate|conversao|recebid|parceir/.test(tudo))
      // Bônus entre -50% e +400%: além disso é outra coisa.
      const razao = l.pontos / t.pontos
      if (!parece || razao < 0.5 || razao > 5) continue
      melhor = t
      melhorDif = dif
    }
    if (!melhor) return
    usados.add(melhor.id)
    const t = melhor
    // Duas linhas (pontos + bônus): a principal tem os pontos que saíram da origem.
    const outra = linhas.findIndex(
      (x, k) =>
        k !== n && livre(k) && x.pontos > 0 && perto(x, t) &&
        (l.pontos === t.pontos ? ehBonusDe(x, t) : x.pontos === t.pontos && ehBonusDe(l, t)),
    )
    if (outra >= 0) {
      const total = l.pontos + linhas[outra].pontos
      if (total === t.pontosDestino) {
        lancados[n] = jaLancadoDe(t)
        lancados[outra] = jaLancadoDe(t)
        return
      }
      const [principal, bonus] = l.pontos === t.pontos ? [n, outra] : [outra, n]
      corrigir(principal, t, total)
      parteDe[bonus] = t.id
      return
    }
    // Duas linhas que, somadas, dão o total já lançado: nada a corrigir.
    const par = linhas.findIndex((x, k) => k !== n && livre(k) && x.pontos > 0 && x.pontos + l.pontos === t.pontosDestino && perto(x, t))
    if (par >= 0) {
      lancados[n] = jaLancadoDe(t)
      lancados[par] = jaLancadoDe(t)
      return
    }
    corrigir(n, t, l.pontos)
  })

  // 3ª passada: resgate cancelado e devolvido. A devolução (+) e o resgate (-) de
  // mesmo valor se anulam; os dois ficam de fora. Se o resgate cancelado já estava
  // lançado, ele deixa de casar e aparece para excluir (e a devolução gravada antes
  // como entrada também).
  //  - Texto de cancelamento ("cancelamento", "estorno", "reembolso"...): o resgate pode
  //    ter sido até 1 ano antes (reserva de hotel cancelada semanas depois).
  //  - Só "passagem"/"resgate" (cancelada e reemitida): até 3 dias.
  const anula: (number | null)[] = linhas.map(() => null)
  const anulaSaida: ({ id: string; data: string } | null)[] = linhas.map(() => null)
  /** Lançamentos do sistema ligados a um cancelamento, que devem vir marcados para excluir. */
  const excluirSugerido: string[][] = linhas.map(() => [])
  const CANCELAMENTO = /cancel|estorn|reembols|devolu|revers|refund|ressarc/
  linhas.forEach((l, n) => {
    if (l.pontos <= 0 || anula[n] !== null || correcoes[n] || parteDe[n]) return
    if (lancados[n] && lancados[n]!.tipo !== 'ENTRADA') return
    const texto = textoDe(l)
    const cancelamento = CANCELAMENTO.test(texto)
    if (!cancelamento && !/passagem|resgate|bilhete|emiss|reserva/.test(texto)) return
    const d = dataDe(l.data).getTime()
    // O resgate vem antes da devolução (ou no mesmo dia).
    const naJanela = (t: number) => (cancelamento ? t >= d - 365 * DIA && t <= d + 3 * DIA : Math.abs(t - d) <= 3 * DIA)
    const pontuar = (k: number) =>
      (l.localizador && linhas[k].localizador === l.localizador ? 0 : 4) + (lancados[k] ? 1 : 0) +
      Math.abs(dataDe(linhas[k].data).getTime() - d) / (400 * DIA)
    const k = linhas
      .map((_, k) => k)
      .filter(
        (k) =>
          k !== n && anula[k] === null && linhas[k].pontos === -l.pontos && !correcoes[k] && !parteDe[k] &&
          naJanela(dataDe(linhas[k].data).getTime()) && (!lancados[k] || lancados[k]!.tipo === 'SAIDA'),
      )
      .sort((a, b) => pontuar(a) - pontuar(b))[0]
    const soltar = (i: number) => {
      if (!lancados[i]) return
      usados.delete(lancados[i]!.id)
      excluirSugerido[n].push(lancados[i]!.id)
      lancados[i] = null
    }
    if (k !== undefined) {
      soltar(n)
      soltar(k)
      anula[n] = k
      anula[k] = n
      return
    }
    // O resgate não está no extrato (foi antes do período), mas está lançado no sistema.
    if (!cancelamento) return
    const saida = contexto.existentes.saidas
      .filter((x) => !usados.has(x.id) && x.pontos === l.pontos && naJanela(x.data.getTime()))
      .sort((a, b) => b.data.getTime() - a.data.getTime())[0]
    if (!saida) return
    soltar(n)
    usados.add(saida.id)
    excluirSugerido[n].push(saida.id)
    anulaSaida[n] = { id: saida.id, data: saida.data.toISOString().slice(0, 10) }
  })

  return linhas.map((l, n) => {
    const chave = chaveDaLinha(l)
    const jaLancado = lancados[n]
    const corrigirBonus = correcoes[n]
    const extras = { parteDe: parteDe[n], anulaSaida: anulaSaida[n], excluirSugerido: excluirSugerido[n] }
    if (anulaSaida[n]) {
      return {
        linha: l, chave, acao: 'IGNORAR' as const, outroProgramaId: null, valorMilheiro: null, bonusPercentual: null,
        jaLancado: null, corrigirBonus: null, ...extras,
        motivo: `devolução da emissão de ${anulaSaida[n]!.data.split('-').reverse().join('/')}, que vai para a lista de exclusão`,
      }
    }
    if (anula[n] !== null) {
      const o = linhas[anula[n]!]
      return {
        linha: l, chave, acao: 'IGNORAR' as const, outroProgramaId: null, valorMilheiro: null, bonusPercentual: null,
        jaLancado: null, corrigirBonus: null, ...extras,
        motivo: `resgate cancelado: anula a linha de ${o.data.split('-').reverse().join('/')} (${o.pontos > 0 ? '+' : ''}${o.pontos.toLocaleString('pt-BR')})`,
      }
    }
    if (parteDe[n]) {
      return {
        linha: l, chave, acao: 'TRANSF_RECEBIDA' as const, outroProgramaId: null, valorMilheiro: null, bonusPercentual: null,
        jaLancado: null, corrigirBonus: null, ...extras, motivo: 'bônus da transferência, que entra na correção do bônus',
      }
    }
    if (corrigirBonus) {
      return {
        linha: l, chave, acao: 'TRANSF_RECEBIDA' as const, outroProgramaId: corrigirBonus.origemId,
        valorMilheiro: null, bonusPercentual: corrigirBonus.bonusNovo, jaLancado, corrigirBonus, ...extras,
        motivo: 'transferência já lançada com outro bônus',
      }
    }

    const regra = regras.get(chave)
    const validas = l.pontos >= 0 ? ACOES_ENTRADA : ACOES_SAIDA
    if (regra && (validas as string[]).includes(regra.acao)) {
      return {
        linha: l,
        chave,
        acao: regra.acao as Acao,
        outroProgramaId: regra.outroProgramaId,
        valorMilheiro: regra.valorMilheiro,
        bonusPercentual: regra.bonusPercentual,
        jaLancado,
        corrigirBonus,
        ...extras,
        motivo: 'como você classificou da última vez',
      }
    }
    const s = sugerirPeloTexto(l, contexto.programas, contexto.programaId)
    return { linha: l, chave, ...s, valorMilheiro: null, bonusPercentual: null, jaLancado, corrigirBonus, ...extras }
  })
}
