import 'server-only'
import { db } from './db'
import { centavosParaCampo, formatarPontos } from './formatos'
import { lerExclusao, type Retrato } from './relancar'

const normal = (t: string) => t.trim().toLowerCase()
const reais = (c: number) => (c > 0 ? centavosParaCampo(c) : '')

/** Lê a exclusão do histórico e devolve o lançamento como estava (ou o que dá para ler do texto). */
async function lerAuditoria(id: string): Promise<{ r: Retrato; origem: string; copia: boolean } | null> {
  const a = await db.auditoria.findUnique({ where: { id } })
  if (!a || a.acao !== 'EXCLUIR') return null
  const origem = `excluído em ${a.criadoEm.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} por ${a.usuarioNome}`
  if (a.dados && typeof a.dados === 'object') return { r: a.dados as unknown as Retrato, origem, copia: true }

  const lido = lerExclusao(a.resumo)
  if (!lido) return null
  const [titulares, programas, cartoes] = await Promise.all([
    db.titular.findMany({ select: { id: true, nome: true } }),
    db.programa.findMany({ select: { id: true, nome: true } }),
    db.cartao.findMany({ select: { id: true, nome: true } }),
  ])
  const idDe = (lista: { id: string; nome: string }[], nome: string | null) =>
    nome ? (lista.find((x) => normal(x.nome) === normal(nome))?.id ?? '') : ''
  const titularId = idDe(titulares, lido.titular)
  if (lido.tipo === 'ENTRADA') {
    const cartaoId = lido.cartao ? (cartoes.find((c) => normal(lido.cartao!).startsWith(normal(c.nome)))?.id ?? null) : null
    return {
      origem, copia: false,
      r: {
        tipo: 'ENTRADA', data: lido.data, titularId, programaId: idDe(programas, lido.programa), categoria: lido.categoria ?? 'COMPRA',
        pontos: lido.pontos, valor: lido.valor, formaPagamento: lido.formaPagamento ?? 'SEM_DESEMBOLSO', parcelas: lido.parcelas,
        cartaoId, observacao: lido.observacao,
      },
    }
  }
  if (lido.tipo === 'SAIDA') {
    const { tipo: _t, titular: _ti, programa, ...resto } = lido
    return {
      origem, copia: false,
      r: { ...resto, tipo: 'SAIDA', titularId, programaId: idDe(programas, programa), tipoSaida: lido.tipoSaida ?? 'USO_PESSOAL' },
    }
  }
  return {
    origem, copia: false,
    r: {
      tipo: 'TRANSFERENCIA', data: lido.data, titularId, origemId: idDe(programas, lido.origem), destinoId: idDe(programas, lido.destino),
      pontos: lido.pontos, bonusPercentual: lido.bonusPercentual, pontosDestino: lido.pontosDestino, observacao: lido.observacao,
    },
  }
}

export async function relancarEntrada(id: string | undefined) {
  if (!id) return null
  const a = await lerAuditoria(id)
  if (!a || a.r.tipo !== 'ENTRADA') return null
  const r = a.r
  const duplicado = Boolean(
    await db.entrada.findFirst({ where: { titularId: r.titularId, programaId: r.programaId, data: new Date(`${r.data}T00:00:00Z`), pontos: r.pontos } }),
  )
  return {
    origem: a.origem, copia: a.copia, duplicado,
    valores: {
      data: r.data, titularId: r.titularId, programaId: r.programaId, categoria: r.categoria, pontos: formatarPontos(r.pontos),
      valor: reais(r.valor), formaPagamento: r.formaPagamento === 'SEM_DESEMBOLSO' ? 'PIX' : r.formaPagamento,
      parcelas: String(r.parcelas), cartaoId: r.cartaoId ?? '', observacao: r.observacao ?? '',
    },
  }
}

export async function relancarSaida(id: string | undefined) {
  if (!id) return null
  const a = await lerAuditoria(id)
  if (!a || a.r.tipo !== 'SAIDA') return null
  const r = a.r
  const duplicado = Boolean(
    await db.saida.findFirst({ where: { titularId: r.titularId, programaId: r.programaId, data: new Date(`${r.data}T00:00:00Z`), pontos: r.pontos } }),
  )
  return {
    origem: a.origem, copia: a.copia, duplicado,
    valores: {
      data: r.data, titularId: r.titularId, programaId: r.programaId, tipo: r.tipoSaida, pontos: formatarPontos(r.pontos),
      taxaEmbarque: reais(r.taxaEmbarque), valorVenda: reais(r.valorVenda), fornecedor: r.fornecedor ?? '', cliente: r.cliente ?? '',
      localizador: r.localizador ?? '', dataIda: r.dataIda ?? '', dataVolta: r.dataVolta ?? '',
      passageiros: r.passageiros ? String(r.passageiros) : '', origem: r.origem ?? '', destino: r.destino ?? '',
      formaRecebimento: r.formaRecebimento ?? 'PIX', parcelas: String(r.parcelas), dataRecebimento: r.dataRecebimento ?? '',
      observacao: r.observacao ?? '',
    },
  }
}

export async function relancarTransferencia(id: string | undefined) {
  if (!id) return null
  const a = await lerAuditoria(id)
  if (!a || a.r.tipo !== 'TRANSFERENCIA') return null
  const r = a.r
  const duplicado = Boolean(
    await db.transferencia.findFirst({
      where: { titularId: r.titularId, origemId: r.origemId, destinoId: r.destinoId, data: new Date(`${r.data}T00:00:00Z`), pontos: r.pontos },
    }),
  )
  return {
    origem: a.origem, copia: a.copia, duplicado,
    valores: {
      data: r.data, titularId: r.titularId, origemId: r.origemId, destinoId: r.destinoId, pontos: formatarPontos(r.pontos),
      bonusPercentual: String(r.bonusPercentual).replace('.', ','), pontosDestino: formatarPontos(r.pontosDestino),
      observacao: r.observacao ?? '',
    },
  }
}
