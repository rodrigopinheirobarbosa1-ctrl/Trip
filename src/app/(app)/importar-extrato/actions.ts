'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { exigirUsuarioAction } from '@/lib/auth'
import { auditar } from '@/lib/audit'
import { carregarCarteira, validarSaldos } from '@/lib/dados'
import { calcularPontosDestino, chavePosicao, type Movimentos } from '@/lib/carteira'
import { lerPaginaDoExtrato, type ResultadoLeitura } from '@/lib/extrato/ler-com-ia'
import { ACOES, juntarPaginas, montarSugestoes, type LinhaLida, type Sugestao } from '@/lib/extrato/sugestao'

const TIPOS_ARQUIVO = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const

/** Lê uma página (print ou PDF) do extrato. Chamada uma vez por arquivo. */
export async function lerPagina(entrada: {
  programaId: string
  pagina: number
  dados: string
  tipo: string
}): Promise<ResultadoLeitura> {
  await exigirUsuarioAction()
  const tipo = TIPOS_ARQUIVO.find((t) => t === entrada.tipo)
  if (!tipo) return { ok: false, erro: 'Tipo de arquivo não aceito. Use imagens (PNG, JPG), PDF ou Word com os prints.' }
  // ~3 MB em base64: acima disso a Vercel recusa o envio.
  if (entrada.dados.length > 4_000_000) return { ok: false, erro: `A página ${entrada.pagina} é grande demais. Divida o PDF.` }
  const programa = await db.programa.findUnique({ where: { id: entrada.programaId } })
  if (!programa) return { ok: false, erro: 'Programa não encontrado.' }
  return lerPaginaDoExtrato({ pagina: entrada.pagina, dados: entrada.dados, tipo, programa: programa.nome })
}

export type Conferencia = {
  sugestoes: Sugestao[]
  saldoSistema: number
  programas: { id: string; nome: string }[]
  /** Já existe algum lançamento desta pessoa neste programa antes da primeira linha do extrato? */
  temLancamentoAntes: boolean
}

/** Junta as páginas lidas e sugere o que fazer com cada linha. */
export async function montarConferencia(entrada: {
  titularId: string
  programaId: string
  paginas: LinhaLida[][]
}): Promise<Conferencia> {
  await exigirUsuarioAction()
  const { titularId, programaId } = entrada
  const linhas = juntarPaginas(entrada.paginas)

  const [programas, regras, entradas, enviadas, recebidas, saidas, carteira] = await Promise.all([
    db.programa.findMany({ orderBy: { nome: 'asc' }, select: { id: true, nome: true } }),
    db.regraExtrato.findMany({ where: { programaId } }),
    db.entrada.findMany({ where: { titularId, programaId }, select: { id: true, data: true, pontos: true } }),
    db.transferencia.findMany({ where: { titularId, origemId: programaId }, select: { id: true, data: true, pontos: true } }),
    db.transferencia.findMany({ where: { titularId, destinoId: programaId }, select: { id: true, data: true, pontosDestino: true } }),
    db.saida.findMany({ where: { titularId, programaId }, select: { id: true, data: true, pontos: true } }),
    carregarCarteira(),
  ])

  const primeira = linhas[0] ? new Date(`${linhas[0].data}T00:00:00Z`).getTime() : Infinity
  const antes = (xs: { data: Date }[]) => xs.some((x) => x.data.getTime() < primeira)
  return {
    sugestoes: montarSugestoes(linhas, { programaId, programas, regras, existentes: { entradas, enviadas, recebidas, saidas } }),
    saldoSistema: carteira.posicoes.get(chavePosicao(titularId, programaId))?.pontos ?? 0,
    programas,
    temLancamentoAntes: antes(entradas) || antes(enviadas) || antes(recebidas) || antes(saidas),
  }
}

const Item = z.object({
  linha: z.object({
    data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    operacao: z.string().max(200),
    descricao: z.string().max(200),
    pontos: z.number().int().refine((n) => n !== 0),
    observacao: z.string().max(500).nullable(),
    pagina: z.number().int(),
  }),
  chave: z.string().max(500),
  acao: z.enum(Object.keys(ACOES) as [keyof typeof ACOES, ...(keyof typeof ACOES)[]]),
  outroProgramaId: z.string().nullable(),
  /** Compras: valor pago em centavos. */
  valor: z.number().int().nonnegative(),
  formaPagamento: z.enum(['PIX', 'CARTAO', 'BOLETO', 'DINHEIRO', 'OUTRO']),
  parcelas: z.number().int().min(1).max(48),
  /** Transferências: pontos do outro lado (que chegaram ou que saíram). */
  pontosOutro: z.number().int().positive().nullable(),
  bonusPercentual: z.number().min(-99).max(1000),
  /** Vendas: valor da venda em centavos. */
  valorVenda: z.number().int().nonnegative(),
})
export type ItemConfirmado = z.infer<typeof Item>

/** Grava as linhas confirmadas como lançamentos. Tudo ou nada. */
const SaldoInicial = z.object({
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  pontos: z.number().int().positive(),
  /** Custo total desses pontos (centavos); zero se não souber. */
  valor: z.number().int().nonnegative(),
})

export async function gravarExtrato(entrada: {
  titularId: string
  programaId: string
  itens: ItemConfirmado[]
  /** Pontos que já existiam antes do período do extrato. */
  saldoInicial: z.infer<typeof SaldoInicial> | null
}): Promise<{ erro?: string; ok?: string }> {
  const usuario = await exigirUsuarioAction()
  const r = z
    .object({ titularId: z.string(), programaId: z.string(), itens: z.array(Item).max(2000), saldoInicial: SaldoInicial.nullable() })
    .safeParse(entrada)
  if (!r.success) return { erro: `Dados inválidos: ${r.error.issues[0].path.join('.')} ${r.error.issues[0].message}` }
  const { titularId, programaId, itens, saldoInicial } = r.data
  const programa = await db.programa.findUnique({ where: { id: programaId } })
  if (!programa) return { erro: 'Programa não encontrado.' }

  const dia = (s: string) => new Date(`${s}T00:00:00Z`)
  const criadoPor = `${usuario.nome} (extrato)`
  const observacao = (i: ItemConfirmado) => `${i.linha.operacao} · ${i.linha.descricao}${i.linha.observacao ? ` · ${i.linha.observacao}` : ''}`

  const entradas: (Prisma.EntradaCreateManyInput & { data: Date })[] = []
  const transferencias: (Prisma.TransferenciaUncheckedCreateInput & { data: Date })[] = []
  const saidas: (Prisma.SaidaCreateManyInput & { data: Date })[] = []

  for (const i of itens) {
    const pts = Math.abs(i.linha.pontos)
    const data = dia(i.linha.data)
    const entra = i.linha.pontos > 0
    switch (i.acao) {
      case 'IGNORAR':
        break
      case 'COMPRA':
      case 'ACUMULO':
      case 'BONUS': {
        if (!entra) return { erro: `Linha de ${i.linha.data} (${observacao(i)}) é de saída e não pode ser entrada.` }
        const paga = i.acao === 'COMPRA' && i.valor > 0
        entradas.push({
          data,
          titularId,
          programaId,
          categoria: i.acao,
          pontos: pts,
          valor: i.acao === 'COMPRA' ? i.valor : 0,
          formaPagamento: paga ? i.formaPagamento : 'SEM_DESEMBOLSO',
          parcelas: paga ? i.parcelas : 1,
          observacao: observacao(i),
          criadoPor,
        })
        break
      }
      case 'TRANSF_ENVIADA':
      case 'TRANSF_RECEBIDA': {
        if (!i.outroProgramaId || i.outroProgramaId === programaId) {
          return { erro: `Escolha o outro programa da transferência de ${i.linha.data} (${observacao(i)}).` }
        }
        if (i.acao === 'TRANSF_ENVIADA') {
          if (entra) return { erro: `Linha de ${i.linha.data} é de entrada e não pode ser transferência enviada.` }
          transferencias.push({
            data, titularId, origemId: programaId, destinoId: i.outroProgramaId, pontos: pts,
            bonusPercentual: i.bonusPercentual,
            pontosDestino: i.pontosOutro ?? calcularPontosDestino(pts, i.bonusPercentual),
            observacao: observacao(i), criadoPor,
          })
        } else {
          if (!entra) return { erro: `Linha de ${i.linha.data} é de saída e não pode ser transferência recebida.` }
          transferencias.push({
            data, titularId, origemId: i.outroProgramaId, destinoId: programaId,
            pontos: i.pontosOutro ?? Math.round(pts / (1 + i.bonusPercentual / 100)),
            bonusPercentual: i.bonusPercentual, pontosDestino: pts,
            observacao: observacao(i), criadoPor,
          })
        }
        break
      }
      case 'USO_PESSOAL':
      case 'VENDA':
      case 'OUTRA_SAIDA': {
        if (entra) return { erro: `Linha de ${i.linha.data} (${observacao(i)}) é de entrada e não pode ser saída.` }
        saidas.push({
          data, titularId, programaId, tipo: i.acao === 'OUTRA_SAIDA' ? 'OUTRO' : i.acao, pontos: pts,
          valorVenda: i.acao === 'VENDA' ? i.valorVenda : 0,
          formaRecebimento: i.acao === 'VENDA' && i.valorVenda > 0 ? 'PIX' : null,
          dataRecebimento: i.acao === 'VENDA' && i.valorVenda > 0 ? data : null,
          observacao: observacao(i), criadoPor,
        })
        break
      }
    }
  }
  if (saldoInicial) {
    entradas.unshift({
      data: dia(saldoInicial.data),
      titularId,
      programaId,
      categoria: 'SALDO_INICIAL',
      pontos: saldoInicial.pontos,
      valor: saldoInicial.valor,
      formaPagamento: 'SEM_DESEMBOLSO',
      parcelas: 1,
      observacao: 'Saldo anterior ao período do extrato',
      criadoPor,
    })
  }
  const total = entradas.length + transferencias.length + saidas.length
  if (total === 0) return { erro: 'Nenhuma linha marcada para lançar.' }

  // Mesma regra dos lançamentos à mão: não pode deixar saldo negativo.
  const agora = Date.now()
  const chaves = new Set<string>()
  const pares: [string, string][] = []
  const anotar = (t: string, p: string) => {
    if (!chaves.has(`${t}|${p}`)) {
      chaves.add(`${t}|${p}`)
      pares.push([t, p])
    }
  }
  anotar(titularId, programaId)
  for (const t of transferencias) {
    anotar(titularId, t.origemId)
    anotar(titularId, t.destinoId)
  }
  const erroSaldo = await validarSaldos(
    (m): Movimentos => ({
      entradas: [
        ...m.entradas,
        ...entradas.map((e, n) => ({ id: `x-e${n}`, data: e.data, titularId, programaId, pontos: e.pontos, valor: e.valor ?? 0, ordem: agora + n })),
      ],
      transferencias: [
        ...m.transferencias,
        ...transferencias.map((t, n) => ({
          id: `x-t${n}`, data: t.data, titularId, origemId: t.origemId, destinoId: t.destinoId,
          pontos: t.pontos, pontosDestino: t.pontosDestino, ordem: agora + n,
        })),
      ],
      saidas: [
        ...m.saidas,
        ...saidas.map((s, n) => ({ id: `x-s${n}`, data: s.data, titularId, programaId, pontos: s.pontos, ordem: agora + n })),
      ],
    }),
    pares,
  )
  if (erroSaldo) {
    return { erro: `${erroSaldo} Dica: inclua também as entradas desse período (ou o saldo inicial) antes das saídas.` }
  }

  await db.$transaction(async (tx) => {
    if (entradas.length) await tx.entrada.createMany({ data: entradas })
    for (const t of transferencias) await tx.transferencia.create({ data: t })
    if (saidas.length) await tx.saida.createMany({ data: saidas })

    // Lembra a classificação de cada tipo de linha para a próxima importação.
    const ultimas = new Map<string, ItemConfirmado>()
    for (const i of itens) ultimas.set(i.chave, i)
    for (const [chave, i] of ultimas) {
      const pts = Math.abs(i.linha.pontos)
      const dados = {
        acao: i.acao,
        outroProgramaId: i.outroProgramaId,
        valorMilheiro: i.acao === 'COMPRA' && i.valor > 0 ? Math.round((i.valor / pts) * 1000) : null,
        bonusPercentual: i.acao.startsWith('TRANSF') ? i.bonusPercentual : null,
      }
      await tx.regraExtrato.upsert({
        where: { programaId_chave: { programaId, chave } },
        create: { programaId, chave, ...dados },
        update: dados,
      })
    }
  })

  const titular = await db.titular.findUnique({ where: { id: titularId } })
  const resumo = `${entradas.length} entrada(s), ${transferencias.length} transferência(s) e ${saidas.length} saída(s)`
  await auditar({
    usuario,
    acao: 'IMPORTAR',
    entidade: 'Extrato',
    resumo: `Importou extrato ${programa.nome} de ${titular?.nome ?? '?'}: ${resumo}`,
  })
  revalidatePath('/', 'layout')
  return { ok: `Extrato importado: ${resumo}.` }
}
