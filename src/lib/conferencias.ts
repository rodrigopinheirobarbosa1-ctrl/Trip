import 'server-only'
import { db } from './db'
import { auditar } from './audit'
import type { UsuarioLogado } from './auth'
import { chavePosicao } from './carteira'
import { formatarData, formatarPontos } from './formatos'

/**
 * Conferência de saldo: a data em que o saldo de uma pessoa num programa foi
 * visto no app do programa, e o saldo que aparecia lá. Serve para quem consulta
 * (inclusive outras aplicações) saber se o número do Trip está em dia.
 */

export type SituacaoConferencia = 'EM_DIA' | 'MUDOU_DEPOIS' | 'DIFERENTE' | 'NUNCA_CONFERIDA'

export type Conferencia = {
  conferidoEm: Date
  saldoConferido: number
  observacao: string | null
  registradoPor: string
  /** Lançamentos com data posterior à conferência (ainda não conferidos no app). */
  lancamentosDepois: number
}

export const ROTULO_SITUACAO: Record<SituacaoConferencia, string> = {
  EM_DIA: 'Em dia',
  MUDOU_DEPOIS: 'Mudou depois',
  DIFERENTE: 'Diferente do app',
  NUNCA_CONFERIDA: 'Nunca conferida',
}

/**
 * Situação de uma conta:
 * - EM_DIA: o saldo do Trip é o que o app mostrava e nada foi lançado depois;
 * - MUDOU_DEPOIS: houve lançamentos depois da conferência (o saldo novo não foi visto no app);
 * - DIFERENTE: sem lançamentos depois, mas o saldo do Trip não bate com o conferido;
 * - NUNCA_CONFERIDA.
 */
export function situacaoConferencia(c: Conferencia | undefined, saldoTrip: number): SituacaoConferencia {
  if (!c) return 'NUNCA_CONFERIDA'
  if (c.lancamentosDepois > 0) return 'MUDOU_DEPOIS'
  return c.saldoConferido === saldoTrip ? 'EM_DIA' : 'DIFERENTE'
}

/** Todas as conferências, por chavePosicao(titularId, programaId). */
export async function carregarConferencias(): Promise<Map<string, Conferencia>> {
  const conferencias = await db.conferenciaSaldo.findMany()
  const mapa = new Map<string, Conferencia>()
  if (conferencias.length === 0) return mapa

  // Datas dos lançamentos de cada conta, para contar os que vieram depois.
  const [entradas, saidas, transferencias] = await Promise.all([
    db.entrada.findMany({ select: { data: true, titularId: true, programaId: true } }),
    db.saida.findMany({ select: { data: true, titularId: true, programaId: true } }),
    db.transferencia.findMany({ select: { data: true, titularId: true, origemId: true, destinoId: true } }),
  ])
  const datas = new Map<string, number[]>()
  const anotar = (titularId: string, programaId: string, data: Date) => {
    const k = chavePosicao(titularId, programaId)
    const lista = datas.get(k)
    if (lista) lista.push(data.getTime())
    else datas.set(k, [data.getTime()])
  }
  for (const e of entradas) anotar(e.titularId, e.programaId, e.data)
  for (const s of saidas) anotar(s.titularId, s.programaId, s.data)
  for (const t of transferencias) {
    anotar(t.titularId, t.origemId, t.data)
    anotar(t.titularId, t.destinoId, t.data)
  }

  for (const c of conferencias) {
    const k = chavePosicao(c.titularId, c.programaId)
    const limite = c.conferidoEm.getTime()
    mapa.set(k, {
      conferidoEm: c.conferidoEm,
      saldoConferido: c.saldo,
      observacao: c.observacao,
      registradoPor: c.registradoPor,
      lancamentosDepois: (datas.get(k) ?? []).filter((d) => d > limite).length,
    })
  }
  return mapa
}

/** Grava (ou substitui) a conferência de uma conta e registra no histórico. */
export async function marcarConferida(dados: {
  usuario: UsuarioLogado
  titular: { id: string; nome: string }
  programa: { id: string; nome: string }
  conferidoEm: Date
  saldo: number
  observacao?: string | null
}): Promise<void> {
  const { usuario, titular, programa, conferidoEm, saldo } = dados
  const observacao = dados.observacao?.trim() || null
  const valores = { conferidoEm, saldo, observacao, registradoEm: new Date(), registradoPor: usuario.nome }
  const registro = await db.conferenciaSaldo.upsert({
    where: { titularId_programaId: { titularId: titular.id, programaId: programa.id } },
    create: { titularId: titular.id, programaId: programa.id, ...valores },
    update: valores,
  })
  await auditar({
    usuario,
    acao: 'ALTERAR',
    entidade: 'ConferenciaSaldo',
    entidadeId: registro.id,
    resumo: `Conferiu ${titular.nome} · ${programa.nome}: saldo ${formatarPontos(saldo)} em ${formatarData(conferidoEm)}`,
  })
}
