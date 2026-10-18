'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { exigirUsuarioAction } from '@/lib/auth'
import { detalharEntrada } from '@/lib/detalhes-historico'
import { retratoEntrada } from '@/lib/relancar'
import { auditar } from '@/lib/audit'
import { validarSaldos } from '@/lib/dados'
import { formatarData, formatarPontos, formatarReais } from '@/lib/formatos'
import {
  centavosOpcional,
  dataObrigatoria,
  ErroFormulario,
  inteiroEntre,
  opcao,
  pontosObrigatorio,
  textoObrigatorio,
  textoOpcional,
  tratarErros,
} from '@/lib/form-dados'
import { CATEGORIAS_ENTRADA, FORMAS_PAGAMENTO } from '@/lib/rotulos'
import type { MovEntrada } from '@/lib/carteira'
import type { EstadoForm } from '@/components/form'

const CATEGORIAS = Object.keys(CATEGORIAS_ENTRADA) as (keyof typeof CATEGORIAS_ENTRADA)[]
const FORMAS = Object.keys(FORMAS_PAGAMENTO) as (keyof typeof FORMAS_PAGAMENTO)[]

function lerEntrada(dados: FormData) {
  const categoria = opcao(dados, 'categoria', 'Tipo de entrada', CATEGORIAS)
  const pontos = pontosObrigatorio(dados, 'pontos', 'Quantidade de pontos', categoria === 'AJUSTE')
  const valor = centavosOpcional(dados, 'valor', 'Valor pago')
  let formaPagamento = opcao(dados, 'formaPagamento', 'Forma de pagamento', FORMAS)
  // Sem valor pago não há desembolso, seja qual for a forma escolhida. No parceiro, o
  // valor é um custo atribuído: também não sai do caixa.
  if (valor === 0 || categoria === 'PARCEIRO') formaPagamento = 'SEM_DESEMBOLSO'
  if (valor > 0 && formaPagamento === 'SEM_DESEMBOLSO' && categoria !== 'PARCEIRO') {
    throw new ErroFormulario('Há valor pago: escolha a forma de pagamento (PIX, cartão...).')
  }
  const parcelas = formaPagamento === 'SEM_DESEMBOLSO' ? 1 : inteiroEntre(dados, 'parcelas', 'Parcelas', 1, 48, 1)
  if (formaPagamento === 'PIX' && parcelas !== 1) throw new ErroFormulario('Pagamento por PIX é sempre em 1 parcela.')
  return {
    data: dataObrigatoria(dados, 'data', 'Data'),
    titularId: textoObrigatorio(dados, 'titularId', 'Pessoa'),
    programaId: textoObrigatorio(dados, 'programaId', 'Programa'),
    categoria,
    pontos,
    valor,
    formaPagamento,
    parcelas,
    cartaoId: formaPagamento === 'CARTAO' ? textoOpcional(dados, 'cartaoId') : null,
    observacao: textoOpcional(dados, 'observacao'),
  }
}

const paraCarteira = (id: string, e: ReturnType<typeof lerEntrada>, ordem: number): MovEntrada => ({
  id, data: e.data, titularId: e.titularId, programaId: e.programaId, pontos: e.pontos, valor: e.valor, ordem,
})

export async function salvarEntrada(id: string | null, _e: EstadoForm, dados: FormData): Promise<EstadoForm> {
  return tratarErros(async () => {
    const usuario = await exigirUsuarioAction()
    const nova = lerEntrada(dados)
    const anterior = id ? await db.entrada.findUniqueOrThrow({ where: { id } }) : null

    const chaves: [string, string][] = [[nova.titularId, nova.programaId]]
    if (anterior) chaves.push([anterior.titularId, anterior.programaId])
    const erroSaldo = await validarSaldos(
      (m) => ({
        ...m,
        entradas: [
          ...m.entradas.filter((e) => e.id !== id),
          paraCarteira(id ?? 'nova', nova, anterior?.criadoEm.getTime() ?? Date.now()),
        ],
      }),
      chaves,
    )
    if (erroSaldo) return { erro: erroSaldo }

    const salvo = anterior
      ? await db.entrada.update({ where: { id: anterior.id }, data: nova, include: { titular: true, programa: true } })
      : await db.entrada.create({ data: { ...nova, criadoPor: usuario.nome }, include: { titular: true, programa: true } })

    await auditar({
      usuario,
      acao: anterior ? 'ALTERAR' : 'CRIAR',
      entidade: 'Entrada',
      entidadeId: salvo.id,
      resumo:
        `${anterior ? 'Alterou' : 'Lançou'} entrada de ${formatarPontos(salvo.pontos)} pontos ${salvo.programa.nome} ` +
        `para ${salvo.titular.nome} em ${formatarData(salvo.data)} (${formatarReais(salvo.valor)})`,
    })
    revalidatePath('/', 'layout')
    redirect(dados.get('continuar') === 'sim' ? `/entradas/nova?ok=${Date.now()}` : '/entradas')
  })
}

export async function excluirEntrada(id: string, _e: EstadoForm): Promise<EstadoForm> {
  return tratarErros(async () => {
    const usuario = await exigirUsuarioAction()
    const e = await db.entrada.findUniqueOrThrow({ where: { id }, include: { titular: true, programa: true, cartao: true } })
    const erroSaldo = await validarSaldos(
      (m) => ({ ...m, entradas: m.entradas.filter((x) => x.id !== id) }),
      [[e.titularId, e.programaId]],
    )
    if (erroSaldo) return { erro: `Não dá para excluir: estes pontos já foram usados. ${erroSaldo}` }
    await db.entrada.delete({ where: { id } })
    await auditar({
      usuario,
      acao: 'EXCLUIR',
      entidade: 'Entrada',
      entidadeId: id,
      resumo: `Excluiu — ${detalharEntrada(e)}`,
      dados: retratoEntrada(e),
    })
    revalidatePath('/', 'layout')
    redirect('/entradas')
  })
}
