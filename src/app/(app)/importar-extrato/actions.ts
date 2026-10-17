'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { exigirUsuarioAction } from '@/lib/auth'
import { auditar } from '@/lib/audit'
import { detalharEntrada, detalharSaida, detalharTransferencia } from '@/lib/detalhes-historico'
import { carregarMovimentos, validarSaldos } from '@/lib/dados'
import { calcularCarteira, calcularPontosDestino, chavePosicao, type Movimentos } from '@/lib/carteira'
import { lerPaginaDoExtrato, type ResultadoLeitura } from '@/lib/extrato/ler-com-ia'
import { lerPdfSemIa } from '@/lib/extrato/pdf-texto'
import { ACOES, bonusQueResulta, juntarPaginas, montarSugestoes, type LinhaLida, type Sugestao } from '@/lib/extrato/sugestao'

const TIPOS_ARQUIVO = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const

/** Lê uma página (print ou PDF) do extrato. Chamada uma vez por arquivo. */
export async function lerPagina(entrada: {
  programaId: string
  desde?: string | null
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
  const desde = entrada.desde && /^\d{4}-\d{2}-\d{2}$/.test(entrada.desde) ? entrada.desde : null
  // PDF com texto num formato conhecido (o extrato da Smiles): lido aqui, sem IA e sem custo.
  if (tipo === 'application/pdf') {
    const semIa = await lerPdfSemIa(entrada.dados, entrada.pagina)
    if (semIa) return { ok: true, saldoExibido: null, semIa: true, linhas: semIa.filter((l) => !desde || l.data >= desde) }
  }
  return lerPaginaDoExtrato({ pagina: entrada.pagina, dados: entrada.dados, tipo, programa: programa.nome, desde })
}

/** Lançamento que o sistema tem do início do extrato em diante, mas que o extrato não mostra. */
export type ForaDoExtrato = {
  tipo: 'ENTRADA' | 'SAIDA' | 'TRANSFERENCIA'
  id: string
  data: string
  /** Efeito no saldo deste programa: positivo somava, negativo tirava. */
  pontos: number
  descricao: string
  /** Transferências: o que a exclusão muda no outro programa. */
  outroLado: string | null
}

export type Conferencia = {
  sugestoes: Sugestao[]
  saldoSistema: number
  programas: { id: string; nome: string }[]
  /** Já existe algum lançamento desta pessoa neste programa antes da primeira linha do extrato? */
  temLancamentoAntes: boolean
  /** Saldo do sistema no dia anterior à primeira linha do extrato. */
  saldoAntesDoPeriodo: number
  foraDoExtrato: ForaDoExtrato[]
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

  const [programas, regras, entradas, enviadas, recebidas, saidas, movimentos] = await Promise.all([
    db.programa.findMany({ orderBy: { nome: 'asc' }, select: { id: true, nome: true } }),
    db.regraExtrato.findMany({ where: { programaId } }),
    db.entrada.findMany({ where: { titularId, programaId }, select: { id: true, data: true, pontos: true, categoria: true, observacao: true } }),
    db.transferencia.findMany({
      where: { titularId, origemId: programaId },
      select: { id: true, data: true, pontos: true, pontosDestino: true, compraId: true, destino: { select: { nome: true } } },
    }),
    db.transferencia.findMany({
      where: { titularId, destinoId: programaId },
      select: { id: true, data: true, pontos: true, pontosDestino: true, origemId: true, bonusPercentual: true, origem: { select: { nome: true } } },
    }),
    db.saida.findMany({ where: { titularId, programaId }, select: { id: true, data: true, pontos: true, tipo: true, cliente: true, observacao: true } }),
    carregarMovimentos(),
  ])

  const chave = chavePosicao(titularId, programaId)
  const sugestoes = montarSugestoes(linhas, { programaId, programas, regras, existentes: { entradas, enviadas, recebidas, saidas } })
  const dia = (s: string) => new Date(`${s}T00:00:00Z`).getTime()
  const primeira = linhas[0] ? dia(linhas[0].data) : Infinity
  const antes = (xs: { data: Date }[]) => xs.some((x) => x.data.getTime() < primeira)
  // Do início do extrato em diante, sem limite final: o saldo do extrato é o de hoje, então o
  // que o sistema tem depois da última linha (e o extrato não mostra) também entra na conta.
  const noPeriodo = (d: Date) => d.getTime() >= primeira

  // O que o sistema tem no período e não casou com nenhuma linha do extrato.
  // As transferências com bônus a corrigir também casaram: não são para excluir.
  const casados = new Set(sugestoes.flatMap((s) => [s.jaLancado?.id, s.jaLancado?.compraId, s.corrigirBonus?.id]).filter(Boolean))
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  const foraDoExtrato: ForaDoExtrato[] = [
    ...entradas.filter((e) => noPeriodo(e.data) && !casados.has(e.id)).map((e) => ({
      tipo: 'ENTRADA' as const, id: e.id, data: iso(e.data), pontos: e.pontos,
      descricao: ['Entrada', e.observacao].filter(Boolean).join(' · '), outroLado: null,
    })),
    ...saidas.filter((s) => noPeriodo(s.data) && !casados.has(s.id)).map((s) => ({
      tipo: 'SAIDA' as const, id: s.id, data: iso(s.data), pontos: -s.pontos,
      descricao: ['Saída', s.cliente, s.observacao].filter(Boolean).join(' · '), outroLado: null,
    })),
    ...enviadas.filter((t) => noPeriodo(t.data) && !casados.has(t.id)).map((t) => ({
      tipo: 'TRANSFERENCIA' as const, id: t.id, data: iso(t.data), pontos: -t.pontos,
      descricao: `Transferência para ${t.destino.nome}`,
      outroLado: `excluir também tira ${t.pontosDestino.toLocaleString('pt-BR')} pontos da ${t.destino.nome}`,
    })),
    ...recebidas.filter((t) => noPeriodo(t.data) && !casados.has(t.id)).map((t) => ({
      tipo: 'TRANSFERENCIA' as const, id: t.id, data: iso(t.data), pontos: t.pontosDestino,
      descricao: `Transferência de ${t.origem.nome}`,
      outroLado: `excluir também devolve ${t.pontos.toLocaleString('pt-BR')} pontos para a ${t.origem.nome}`,
    })),
  ].sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0))

  const carteira = calcularCarteira(movimentos)
  const antesDoPeriodo = Number.isFinite(primeira) ? calcularCarteira(movimentos, new Date(primeira - 86400000)) : carteira
  return {
    sugestoes,
    saldoSistema: carteira.posicoes.get(chave)?.pontos ?? 0,
    programas,
    temLancamentoAntes: antes(entradas) || antes(enviadas) || antes(recebidas) || antes(saidas),
    saldoAntesDoPeriodo: antesDoPeriodo.posicoes.get(chave)?.pontos ?? 0,
    foraDoExtrato,
  }
}

const Item = z.object({
  linha: z.object({
    data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    operacao: z.string().max(200),
    descricao: z.string().max(200),
    pontos: z.number().int().refine((n) => n !== 0),
    observacao: z.string().max(500).nullable(),
    localizador: z.string().max(50).nullable().optional(),
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
  /** Transferência imediata: pontos comprados na hora (a linha do extrato mostra só os que já estavam na conta). */
  pontosComprados: z.number().int().nonnegative().default(0),
})
export type ItemConfirmado = z.infer<typeof Item>

/** Grava as linhas confirmadas como lançamentos. Tudo ou nada. */
const SaldoInicial = z.object({
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** Positivo: pontos que já existiam. Negativo: ajuste para tirar pontos que o sistema tinha a mais. */
  pontos: z.number().int().refine((n) => n !== 0),
  /** Custo total desses pontos (centavos); zero se não souber. */
  valor: z.number().int().nonnegative(),
})

export async function gravarExtrato(entrada: {
  titularId: string
  programaId: string
  itens: ItemConfirmado[]
  /** Pontos que já existiam antes do período do extrato. */
  saldoInicial: z.infer<typeof SaldoInicial> | null
  /** Lançamentos do sistema que não aparecem no extrato e devem ser apagados. */
  excluir: { tipo: 'ENTRADA' | 'SAIDA' | 'TRANSFERENCIA'; id: string }[]
  /** Transferências recebidas cujo total passa a ser o do extrato (o bônus é recalculado). */
  corrigir?: { id: string; pontosDestino: number }[]
}): Promise<{ erro?: string; ok?: string }> {
  const usuario = await exigirUsuarioAction()
  const r = z
    .object({
      titularId: z.string(),
      programaId: z.string(),
      itens: z.array(Item).max(2000),
      saldoInicial: SaldoInicial.nullable(),
      excluir: z.array(z.object({ tipo: z.enum(['ENTRADA', 'SAIDA', 'TRANSFERENCIA']), id: z.string() })).max(2000),
      // Opcional: uma tela aberta antes desta versão não envia o campo.
      corrigir: z.array(z.object({ id: z.string(), pontosDestino: z.number().int().positive() })).max(2000).default([]),
    })
    .safeParse(entrada)
  if (!r.success) return { erro: `Dados inválidos: ${r.error.issues[0].path.join('.')} ${r.error.issues[0].message}` }
  const { titularId, programaId, itens, saldoInicial, excluir, corrigir } = r.data
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
      case 'TRANSF_IMEDIATA': {
        if (entra) return { erro: `Linha de ${i.linha.data} é de entrada e não pode ser transferência imediata.` }
        if (!i.outroProgramaId || i.outroProgramaId === programaId) {
          return { erro: `Escolha para qual programa foi a transferência imediata de ${i.linha.data} (${observacao(i)}).` }
        }
        if (i.pontosComprados <= 0) {
          return { erro: `Informe quantos pontos foram comprados na transferência imediata de ${i.linha.data} (${observacao(i)}).` }
        }
        // A compra feita na hora (o extrato não mostra) e a transferência do total, ligadas.
        const compraId = randomUUID()
        const total = pts + i.pontosComprados
        entradas.push({
          id: compraId,
          data,
          titularId,
          programaId,
          categoria: 'COMPRA',
          pontos: i.pontosComprados,
          valor: i.valor,
          formaPagamento: i.valor > 0 ? i.formaPagamento : 'SEM_DESEMBOLSO',
          parcelas: i.valor > 0 ? i.parcelas : 1,
          observacao: `Compra na transferência imediata · ${observacao(i)}`,
          criadoPor,
        })
        transferencias.push({
          data, titularId, origemId: programaId, destinoId: i.outroProgramaId, pontos: total,
          bonusPercentual: i.bonusPercentual,
          pontosDestino: i.pontosOutro ?? calcularPontosDestino(total, i.bonusPercentual),
          compraId,
          observacao: `Transferência imediata · ${observacao(i)}`, criadoPor,
        })
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
          localizador: i.linha.localizador || null,
          observacao: observacao(i), criadoPor,
        })
        break
      }
    }
  }
  if (saldoInicial) {
    const positivo = saldoInicial.pontos > 0
    entradas.unshift({
      data: dia(saldoInicial.data),
      titularId,
      programaId,
      categoria: positivo ? 'SALDO_INICIAL' : 'AJUSTE',
      pontos: saldoInicial.pontos,
      valor: positivo ? saldoInicial.valor : 0,
      formaPagamento: 'SEM_DESEMBOLSO',
      parcelas: 1,
      observacao: positivo
        ? 'Saldo anterior ao período do extrato'
        : 'Ajuste para o saldo antes do período bater com o extrato',
      criadoPor,
    })
  }

  // Confere que o que vai ser apagado é mesmo desta pessoa e deste programa.
  const idsExcluir = { ENTRADA: [] as string[], SAIDA: [] as string[], TRANSFERENCIA: [] as string[] }
  for (const x of excluir) idsExcluir[x.tipo].push(x.id)
  const [entExcluir, saiExcluir, traExcluir] = await Promise.all([
    db.entrada.findMany({
      where: { id: { in: idsExcluir.ENTRADA }, titularId, programaId },
      include: { titular: true, programa: true, cartao: true },
    }),
    db.saida.findMany({ where: { id: { in: idsExcluir.SAIDA }, titularId, programaId }, include: { titular: true, programa: true } }),
    db.transferencia.findMany({
      where: { id: { in: idsExcluir.TRANSFERENCIA }, titularId, OR: [{ origemId: programaId }, { destinoId: programaId }] },
      include: { titular: true, origem: true, destino: true },
    }),
  ])
  if (entExcluir.length + saiExcluir.length + traExcluir.length !== excluir.length) {
    return { erro: 'Algum lançamento marcado para exclusão não pertence a este programa ou já foi apagado. Leia o extrato de novo.' }
  }
  const apagar = new Set([...entExcluir, ...saiExcluir, ...traExcluir].map((x) => x.id))

  // Transferências que chegaram neste programa com o total errado (o bônus ficou de fora).
  const aCorrigir = await db.transferencia.findMany({
    where: { id: { in: corrigir.map((c) => c.id) }, titularId, destinoId: programaId },
    include: { titular: true, origem: true, destino: true },
  })
  if (aCorrigir.length !== new Set(corrigir.map((c) => c.id)).size || aCorrigir.some((t) => apagar.has(t.id))) {
    return { erro: 'Alguma transferência a corrigir não chega neste programa ou já foi apagada. Leia o extrato de novo.' }
  }
  const novoDestino = new Map(corrigir.map((c) => [c.id, c.pontosDestino]))
  for (const t of aCorrigir) {
    const bonus = bonusQueResulta(t.pontos, novoDestino.get(t.id)!)
    if (bonus < -99 || bonus > 1000) {
      return { erro: `O total do extrato daria um bônus de ${bonus}% na transferência de ${t.origem.nome}. Confira a linha.` }
    }
  }

  const total = entradas.length + transferencias.length + saidas.length + apagar.size + aCorrigir.length
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
  for (const t of [...transferencias, ...traExcluir]) {
    anotar(titularId, t.origemId)
    anotar(titularId, t.destinoId)
  }
  const erroSaldo = await validarSaldos(
    (m): Movimentos => ({
      entradas: [
        ...m.entradas.filter((e) => !apagar.has(e.id)),
        ...entradas.map((e, n) => ({ id: e.id ?? `x-e${n}`, data: e.data, titularId, programaId, pontos: e.pontos, valor: e.valor ?? 0, ordem: agora + n })),
      ],
      transferencias: [
        ...m.transferencias
          .filter((t) => !apagar.has(t.id))
          .map((t) => (novoDestino.has(t.id) ? { ...t, pontosDestino: novoDestino.get(t.id)! } : t)),
        ...transferencias.map((t, n) => ({
          id: `x-t${n}`, data: t.data, titularId, origemId: t.origemId, destinoId: t.destinoId,
          pontos: t.pontos, pontosDestino: t.pontosDestino, ordem: agora + n, compraId: t.compraId ?? null,
        })),
      ],
      saidas: [
        ...m.saidas.filter((s) => !apagar.has(s.id)),
        ...saidas.map((s, n) => ({ id: `x-s${n}`, data: s.data, titularId, programaId, pontos: s.pontos, ordem: agora + n })),
      ],
    }),
    pares,
  )
  if (erroSaldo) {
    return { erro: `${erroSaldo} Dica: inclua também as entradas desse período (ou o saldo inicial) antes das saídas.` }
  }

  await db.$transaction(async (tx) => {
    if (entExcluir.length) await tx.entrada.deleteMany({ where: { id: { in: entExcluir.map((x) => x.id) } } })
    if (saiExcluir.length) await tx.saida.deleteMany({ where: { id: { in: saiExcluir.map((x) => x.id) } } })
    if (traExcluir.length) await tx.transferencia.deleteMany({ where: { id: { in: traExcluir.map((x) => x.id) } } })
    if (entradas.length) await tx.entrada.createMany({ data: entradas })
    for (const t of transferencias) await tx.transferencia.create({ data: t })
    if (saidas.length) await tx.saida.createMany({ data: saidas })
    for (const t of aCorrigir) {
      const pontosDestino = novoDestino.get(t.id)!
      await tx.transferencia.update({
        where: { id: t.id },
        data: { pontosDestino, bonusPercentual: bonusQueResulta(t.pontos, pontosDestino) },
      })
    }

    // Lembra a classificação de cada tipo de linha para a próxima importação.
    const ultimas = new Map<string, ItemConfirmado>()
    for (const i of itens) ultimas.set(i.chave, i)
    for (const [chave, i] of ultimas) {
      const pts = Math.abs(i.linha.pontos)
      const dados = {
        acao: i.acao,
        outroProgramaId: i.outroProgramaId,
        valorMilheiro:
          i.acao === 'COMPRA' && i.valor > 0
            ? Math.round((i.valor / pts) * 1000)
            : i.acao === 'TRANSF_IMEDIATA' && i.valor > 0 && i.pontosComprados > 0
              ? Math.round((i.valor / i.pontosComprados) * 1000)
              : null,
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
  const resumo =
    `${entradas.length} entrada(s), ${transferencias.length} transferência(s) e ${saidas.length} saída(s) lançadas` +
    (apagar.size ? `; ${apagar.size} lançamento(s) que não estavam no extrato foram excluídos` : '') +
    (aCorrigir.length ? `; ${aCorrigir.length} transferência(s) com o bônus corrigido` : '')
  // Tudo o que foi excluído fica descrito no histórico, para poder ser lançado
  // de novo (por exemplo, no CPF certo) sem perder o valor pago ou o bônus.
  const excluidos = [
    ...entExcluir.map((e) => ({ entidade: 'Entrada', id: e.id, texto: detalharEntrada(e) })),
    ...traExcluir.map((t) => ({ entidade: 'Transferencia', id: t.id, texto: detalharTransferencia(t) })),
    ...saiExcluir.map((x) => ({ entidade: 'Saida', id: x.id, texto: detalharSaida(x) })),
  ]
  for (const t of aCorrigir) {
    const pontosDestino = novoDestino.get(t.id)!
    const depois = { ...t, pontosDestino, bonusPercentual: bonusQueResulta(t.pontos, pontosDestino) }
    await auditar({
      usuario,
      acao: 'ALTERAR',
      entidade: 'Transferencia',
      entidadeId: t.id,
      resumo: `Corrigiu o bônus ao importar o extrato ${programa.nome} — antes: ${detalharTransferencia(t)} — depois: ${detalharTransferencia(depois)}`,
    })
  }
  for (const x of excluidos) {
    await auditar({
      usuario,
      acao: 'EXCLUIR',
      entidade: x.entidade,
      entidadeId: x.id,
      resumo: `Excluiu ao importar o extrato ${programa.nome} (não estava no extrato) — ${x.texto}`,
    })
  }
  await auditar({
    usuario,
    acao: 'IMPORTAR',
    entidade: 'Extrato',
    resumo: `Importou extrato ${programa.nome} de ${titular?.nome ?? '?'}: ${resumo}`,
  })
  revalidatePath('/', 'layout')
  return { ok: `Extrato importado: ${resumo}.` }
}
