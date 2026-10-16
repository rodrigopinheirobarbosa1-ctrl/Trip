import 'server-only'
import { db } from './db'
import { calcularCarteira, chavePosicao, conferirSaldos, type Movimentos } from './carteira'
import { formatarData, formatarPontos } from './formatos'
import type { ItemCaixa } from './fluxo'

/**
 * Lê todos os lançamentos de pontos do banco no formato da carteira.
 * O volume é pequeno (centenas por ano), então recalcular tudo a cada tela
 * é rápido e garante que nada fica desatualizado.
 */
export async function carregarMovimentos(): Promise<Movimentos> {
  const [entradas, transferencias, saidas] = await Promise.all([
    db.entrada.findMany({
      select: { id: true, data: true, titularId: true, programaId: true, pontos: true, valor: true, criadoEm: true },
    }),
    db.transferencia.findMany({
      select: {
        id: true, data: true, titularId: true, origemId: true, destinoId: true, pontos: true, pontosDestino: true, criadoEm: true,
      },
    }),
    db.saida.findMany({
      select: { id: true, data: true, titularId: true, programaId: true, pontos: true, criadoEm: true },
    }),
  ])
  return {
    entradas: entradas.map((e) => ({ ...e, ordem: e.criadoEm.getTime() })),
    transferencias: transferencias.map((t) => ({ ...t, ordem: t.criadoEm.getTime() })),
    saidas: saidas.map((s) => ({ ...s, ordem: s.criadoEm.getTime() })),
  }
}

export async function carregarCarteira() {
  return calcularCarteira(await carregarMovimentos())
}

/** Nomes de titulares e programas por id, para montar mensagens e tabelas. */
export async function carregarNomes() {
  const [titulares, programas] = await Promise.all([
    db.titular.findMany({ orderBy: { nome: 'asc' } }),
    db.programa.findMany({ orderBy: { nome: 'asc' } }),
  ])
  return {
    titulares,
    programas,
    titular: new Map(titulares.map((t) => [t.id, t])),
    programa: new Map(programas.map((p) => [p.id, p])),
  }
}

/**
 * Confere se a alteração deixa algum saldo negativo. Devolve a mensagem de
 * erro para a pessoa, ou null se está tudo certo.
 *
 * `alterar` recebe os movimentos atuais e devolve como ficariam depois.
 */
export async function validarSaldos(
  alterar: (atuais: Movimentos) => Movimentos,
  chaves: [titularId: string, programaId: string][],
): Promise<string | null> {
  const antes = await carregarMovimentos()
  const depois = alterar(antes)
  const problema = conferirSaldos(
    antes,
    depois,
    chaves.map(([t, p]) => chavePosicao(t, p)),
  )
  if (!problema) return null
  const nomes = await carregarNomes()
  const t = nomes.titular.get(problema.titularId)?.nome ?? '?'
  const p = nomes.programa.get(problema.programaId)?.nome ?? '?'
  return (
    `Saldo insuficiente: ${p} de ${t} ficaria com ${formatarPontos(problema.menorSaldo)} pontos` +
    (problema.data ? ` em ${formatarData(problema.data)}` : '') +
    '. Confira a quantidade e a data, ou lance antes a entrada/transferência que falta.'
  )
}

/**
 * Tudo o que mexe no caixa, para o fluxo de caixa. Com titularId, só o que é
 * daquela pessoa.
 */
export async function carregarItensCaixa(titularId?: string): Promise<{ itens: ItemCaixa[]; saldoInicial: number }> {
  const filtro = titularId ? { titularId } : {}
  const [entradas, saidas, movimentos, titulares] = await Promise.all([
    db.entrada.findMany({
      where: { ...filtro, formaPagamento: { not: 'SEM_DESEMBOLSO' }, valor: { gt: 0 } },
      select: { data: true, valor: true, parcelas: true },
    }),
    db.saida.findMany({
      where: filtro,
      select: { data: true, dataRecebimento: true, valorVenda: true, taxaEmbarque: true, parcelas: true },
    }),
    db.movimentoFinanceiro.findMany({ where: filtro, select: { data: true, valor: true, tipo: true } }),
    db.titular.findMany({ where: titularId ? { id: titularId } : {}, select: { saldoInicialCaixa: true } }),
  ])

  const itens: ItemCaixa[] = []
  for (const e of entradas) itens.push({ data: e.data, valor: e.valor, parcelas: e.parcelas, sentido: 'SAIDA' })
  for (const s of saidas) {
    if (s.valorVenda > 0) {
      itens.push({ data: s.dataRecebimento ?? s.data, valor: s.valorVenda, parcelas: s.parcelas, sentido: 'ENTRADA' })
    }
    if (s.taxaEmbarque > 0) itens.push({ data: s.data, valor: s.taxaEmbarque, parcelas: 1, sentido: 'SAIDA' })
  }
  for (const m of movimentos) {
    itens.push({ data: m.data, valor: m.valor, parcelas: 1, sentido: m.tipo === 'ENTRADA' ? 'ENTRADA' : 'SAIDA' })
  }
  const saldoInicial = titulares.reduce((s, t) => s + t.saldoInicialCaixa, 0)
  return { itens, saldoInicial }
}

/** Anos que aparecem nos lançamentos (para os filtros), mais o ano atual. */
export async function anosDisponiveis(): Promise<number[]> {
  const linhas = await db.$queryRaw<{ ano: number }[]>`
    SELECT DISTINCT EXTRACT(YEAR FROM data)::int AS ano FROM (
      SELECT data FROM "Entrada" UNION ALL SELECT data FROM "Saida"
      UNION ALL SELECT data FROM "Transferencia" UNION ALL SELECT data FROM "MovimentoFinanceiro"
    ) t`
  const anos = new Set(linhas.map((l) => Number(l.ano)))
  anos.add(new Date().getFullYear())
  return [...anos].sort((a, b) => b - a)
}

/**
 * Pessoas, programas e cartões para as listas de seleção dos formulários.
 * Só os ativos — mais os já usados no lançamento sendo editado, para ele
 * continuar abrindo certo mesmo que o cadastro tenha sido desativado.
 */
export async function listasLancamento(manter: { titulares?: string[]; programas?: string[]; cartoes?: string[] } = {}) {
  const ou = (ids?: string[]) => [{ ativo: true }, ...(ids?.length ? [{ id: { in: ids } }] : [])]
  const [titulares, programas, cartoes] = await Promise.all([
    db.titular.findMany({ where: { OR: ou(manter.titulares) }, orderBy: { nome: 'asc' }, select: { id: true, nome: true } }),
    db.programa.findMany({ where: { OR: ou(manter.programas) }, orderBy: { nome: 'asc' }, select: { id: true, nome: true } }),
    db.cartao.findMany({ where: { OR: ou(manter.cartoes) }, orderBy: { nome: 'asc' }, select: { id: true, nome: true } }),
  ])
  return { titulares, programas, cartoes }
}

/** Saldo e CMP atuais de cada pessoa em cada programa, para mostrar nos formulários. */
export async function saldosParaFormulario(): Promise<Record<string, { pontos: number; cmp: number | null }>> {
  const carteira = await carregarCarteira()
  const saida: Record<string, { pontos: number; cmp: number | null }> = {}
  for (const [chave, p] of carteira.posicoes) saida[chave] = { pontos: p.pontos, cmp: p.cmp }
  return saida
}
