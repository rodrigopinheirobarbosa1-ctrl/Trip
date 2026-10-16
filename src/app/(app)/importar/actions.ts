'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db } from '@/lib/db'
import { exigirAdminAction } from '@/lib/auth'
import { auditar } from '@/lib/audit'
import { normalizar, type DadosImportacao } from '@/lib/importacao/planilha'

const dataIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const dataOuNulo = dataIso.nullable()
const texto = z.string().trim().min(1).max(500)
const textoOuNulo = z.string().max(2000).nullable()
const inteiro = z.number().int()
const tipoPrograma = z.enum(['CARTAO_CREDITO', 'CIA_AEREA', 'HOTEL', 'ABASTECIMENTO', 'OUTRO'])
const forma = z.enum(['PIX', 'CARTAO', 'BOLETO', 'DINHEIRO', 'OUTRO', 'SEM_DESEMBOLSO'])

// Os dados chegam do navegador: são conferidos de novo aqui, campo a campo.
const esquema = z.object({
  titulares: z.array(z.object({ nome: texto, saldoInicialCaixa: inteiro })).max(500),
  programas: z.array(z.object({ nome: texto, tipo: tipoPrograma })).max(500),
  contas: z.array(z.object({ titular: texto, programa: texto, login: texto })).max(5000),
  cartoes: z.array(z.object({ nome: texto, final: textoOuNulo })).max(500),
  entradas: z
    .array(
      z.object({
        data: dataIso,
        titular: texto,
        programa: texto,
        categoria: z.enum(['COMPRA', 'ACUMULO', 'BONUS', 'SALDO_INICIAL', 'AJUSTE']),
        pontos: inteiro,
        valor: inteiro.nonnegative(),
        formaPagamento: forma,
        parcelas: inteiro.min(1).max(48),
        cartao: textoOuNulo,
        observacao: textoOuNulo,
      }),
    )
    .max(50000),
  transferencias: z
    .array(
      z.object({
        data: dataIso,
        titular: texto,
        origem: texto,
        destino: texto,
        pontos: inteiro.positive(),
        bonusPercentual: z.number(),
        pontosDestino: inteiro,
        observacao: textoOuNulo,
      }),
    )
    .max(50000),
  saidas: z
    .array(
      z.object({
        data: dataIso,
        titular: texto,
        programa: texto,
        tipo: z.enum(['VENDA', 'USO_PESSOAL', 'OUTRO']),
        pontos: inteiro.positive(),
        taxaEmbarque: inteiro.nonnegative(),
        valorVenda: inteiro.nonnegative(),
        fornecedor: textoOuNulo,
        cliente: textoOuNulo,
        localizador: textoOuNulo,
        dataIda: dataOuNulo,
        dataVolta: dataOuNulo,
        passageiros: inteiro.nullable(),
        origem: textoOuNulo,
        destino: textoOuNulo,
        formaRecebimento: forma.nullable(),
        parcelas: inteiro.min(1).max(48),
        dataRecebimento: dataOuNulo,
        observacao: textoOuNulo,
      }),
    )
    .max(50000),
  movimentos: z
    .array(
      z.object({
        data: dataIso,
        titular: z.string().nullable(),
        tipo: z.enum(['ENTRADA', 'SAIDA']),
        valor: inteiro.positive(),
        descricao: texto,
      }),
    )
    .max(50000),
})

const dia = (s: string) => new Date(`${s}T00:00:00Z`)
const diaOuNulo = (s: string | null) => (s ? dia(s) : null)

export type ResultadoImportacao = { erro?: string; ok?: string } | null

/**
 * Grava os dados da planilha. Cadastros (pessoas, programas, cartões) são
 * aproveitados se já existirem (pelo nome). Lançamentos só são gravados se o
 * banco estiver sem lançamentos, ou se a pessoa pediu para substituir tudo.
 */
export async function importarDados(entrada: Omit<DadosImportacao, 'avisos'>, substituir: boolean): Promise<ResultadoImportacao> {
  const admin = await exigirAdminAction()
  const r = esquema.safeParse(entrada)
  if (!r.success) {
    const i = r.error.issues[0]
    return { erro: `Os dados lidos da planilha têm um problema em ${i.path.join(' > ')}: ${i.message}` }
  }
  const d = r.data

  const existentes =
    (await db.entrada.count()) + (await db.transferencia.count()) + (await db.saida.count()) + (await db.movimentoFinanceiro.count())
  if (existentes > 0 && !substituir) {
    return {
      erro: `O sistema já tem ${existentes} lançamento(s). Para importar de novo, marque a opção de substituir os lançamentos existentes.`,
    }
  }

  try {
    await db.$transaction(
      async (tx) => {
        if (substituir) {
          await tx.entrada.deleteMany()
          await tx.transferencia.deleteMany()
          await tx.saida.deleteMany()
          await tx.movimentoFinanceiro.deleteMany()
        }

        // Cadastros: procura pelo nome (sem diferenciar maiúsculas/acentos).
        const titularId = new Map<string, string>()
        const programaId = new Map<string, string>()
        const cartaoId = new Map<string, string>()
        for (const t of await tx.titular.findMany()) titularId.set(normalizar(t.nome), t.id)
        for (const p of await tx.programa.findMany()) programaId.set(normalizar(p.nome), p.id)
        for (const c of await tx.cartao.findMany()) cartaoId.set(normalizar(c.nome), c.id)

        for (const t of d.titulares) {
          const id = titularId.get(normalizar(t.nome))
          if (id) await tx.titular.update({ where: { id }, data: { saldoInicialCaixa: t.saldoInicialCaixa } })
          else titularId.set(normalizar(t.nome), (await tx.titular.create({ data: t })).id)
        }
        for (const p of d.programas) {
          if (!programaId.has(normalizar(p.nome))) {
            programaId.set(normalizar(p.nome), (await tx.programa.create({ data: p })).id)
          }
        }
        for (const c of d.cartoes) {
          if (!cartaoId.has(normalizar(c.nome))) cartaoId.set(normalizar(c.nome), (await tx.cartao.create({ data: c })).id)
        }

        const T = (nome: string) => {
          const id = titularId.get(normalizar(nome))
          if (!id) throw new Error(`Pessoa não encontrada: ${nome}`)
          return id
        }
        const P = (nome: string) => {
          const id = programaId.get(normalizar(nome))
          if (!id) throw new Error(`Programa não encontrado: ${nome}`)
          return id
        }

        for (const c of d.contas) {
          const t = T(c.titular)
          const p = P(c.programa)
          await tx.contaPrograma.upsert({
            where: { titularId_programaId: { titularId: t, programaId: p } },
            create: { titularId: t, programaId: p, login: c.login },
            update: { login: c.login },
          })
        }

        const criadoPor = `${admin.nome} (importação)`
        await tx.entrada.createMany({
          data: d.entradas.map((e) => ({
            data: dia(e.data),
            titularId: T(e.titular),
            programaId: P(e.programa),
            categoria: e.categoria,
            pontos: e.pontos,
            valor: e.valor,
            formaPagamento: e.formaPagamento,
            parcelas: e.parcelas,
            cartaoId: e.cartao ? (cartaoId.get(normalizar(e.cartao)) ?? null) : null,
            observacao: e.observacao,
            criadoPor,
          })),
        })
        await tx.transferencia.createMany({
          data: d.transferencias.map((t) => ({
            data: dia(t.data),
            titularId: T(t.titular),
            origemId: P(t.origem),
            destinoId: P(t.destino),
            pontos: t.pontos,
            bonusPercentual: t.bonusPercentual,
            pontosDestino: t.pontosDestino,
            observacao: t.observacao,
            criadoPor,
          })),
        })
        await tx.saida.createMany({
          data: d.saidas.map((s) => ({
            data: dia(s.data),
            titularId: T(s.titular),
            programaId: P(s.programa),
            tipo: s.tipo,
            pontos: s.pontos,
            taxaEmbarque: s.taxaEmbarque,
            valorVenda: s.valorVenda,
            fornecedor: s.fornecedor,
            cliente: s.cliente,
            localizador: s.localizador,
            dataIda: diaOuNulo(s.dataIda),
            dataVolta: diaOuNulo(s.dataVolta),
            passageiros: s.passageiros,
            origem: s.origem?.slice(0, 10) ?? null,
            destino: s.destino?.slice(0, 10) ?? null,
            formaRecebimento: s.formaRecebimento === 'SEM_DESEMBOLSO' ? null : s.formaRecebimento,
            parcelas: s.parcelas,
            dataRecebimento: diaOuNulo(s.dataRecebimento),
            observacao: s.observacao,
            criadoPor,
          })),
        })
        await tx.movimentoFinanceiro.createMany({
          data: d.movimentos.map((m) => ({
            data: dia(m.data),
            titularId: m.titular ? T(m.titular) : null,
            tipo: m.tipo,
            valor: m.valor,
            descricao: m.descricao,
            criadoPor,
          })),
        })
      },
      { timeout: 120000 },
    )
  } catch (e) {
    console.error(e)
    return { erro: `A importação foi cancelada e nada foi gravado. Motivo: ${e instanceof Error ? e.message : 'erro desconhecido'}` }
  }

  const resumo =
    `${d.entradas.length} entradas, ${d.transferencias.length} transferências, ${d.saidas.length} emissões/vendas e ` +
    `${d.movimentos.length} movimentos financeiros`
  await auditar({
    usuario: admin,
    acao: 'IMPORTAR',
    entidade: 'Planilha',
    resumo: `Importou a planilha${substituir ? ' (substituindo os lançamentos)' : ''}: ${resumo}`,
  })
  revalidatePath('/', 'layout')
  return { ok: `Importação concluída: ${resumo}.` }
}
