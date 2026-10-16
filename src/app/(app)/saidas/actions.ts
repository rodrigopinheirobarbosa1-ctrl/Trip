'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { exigirUsuarioAction } from '@/lib/auth'
import { auditar } from '@/lib/audit'
import { validarSaldos } from '@/lib/dados'
import type { MovSaida } from '@/lib/carteira'
import { formatarData, formatarPontos, formatarReais } from '@/lib/formatos'
import {
  centavosOpcional,
  dataObrigatoria,
  dataOpcional,
  ErroFormulario,
  inteiroEntre,
  opcao,
  pontosObrigatorio,
  textoObrigatorio,
  textoOpcional,
  tratarErros,
} from '@/lib/form-dados'
import { FORMAS_PAGAMENTO, TIPOS_SAIDA } from '@/lib/rotulos'
import type { EstadoForm } from '@/components/form'

const TIPOS = Object.keys(TIPOS_SAIDA) as (keyof typeof TIPOS_SAIDA)[]
const FORMAS = (Object.keys(FORMAS_PAGAMENTO) as (keyof typeof FORMAS_PAGAMENTO)[]).filter((f) => f !== 'SEM_DESEMBOLSO')

const aeroporto = (dados: FormData, nome: string) => textoOpcional(dados, nome)?.toUpperCase() ?? null

function lerSaida(dados: FormData) {
  const tipo = opcao(dados, 'tipo', 'Tipo', TIPOS)
  const venda = tipo === 'VENDA'
  const data = dataObrigatoria(dados, 'data', 'Data da emissão')
  const valorVenda = venda ? centavosOpcional(dados, 'valorVenda', 'Valor da venda') : 0
  const dataIda = dataOpcional(dados, 'dataIda', 'Data de ida')
  const dataVolta = dataOpcional(dados, 'dataVolta', 'Data de volta')
  if (dataIda && dataVolta && dataVolta < dataIda) throw new ErroFormulario('A data de volta é anterior à de ida.')
  const passageiros = textoOpcional(dados, 'passageiros') ? inteiroEntre(dados, 'passageiros', 'Passageiros', 1, 99, 1) : null
  return {
    data,
    titularId: textoObrigatorio(dados, 'titularId', 'Pessoa'),
    programaId: textoObrigatorio(dados, 'programaId', 'Programa'),
    tipo,
    pontos: pontosObrigatorio(dados, 'pontos', 'Pontos usados'),
    taxaEmbarque: centavosOpcional(dados, 'taxaEmbarque', 'Taxa de embarque'),
    valorVenda,
    fornecedor: textoOpcional(dados, 'fornecedor'),
    cliente: textoOpcional(dados, 'cliente'),
    localizador: textoOpcional(dados, 'localizador')?.toUpperCase() ?? null,
    dataIda,
    dataVolta,
    passageiros,
    origem: aeroporto(dados, 'origem'),
    destino: aeroporto(dados, 'destino'),
    formaRecebimento: venda && valorVenda > 0 ? opcao(dados, 'formaRecebimento', 'Forma de recebimento', FORMAS) : null,
    parcelas: venda && valorVenda > 0 ? inteiroEntre(dados, 'parcelas', 'Parcelas', 1, 48, 1) : 1,
    dataRecebimento: venda && valorVenda > 0 ? (dataOpcional(dados, 'dataRecebimento', 'Data do recebimento') ?? data) : null,
    observacao: textoOpcional(dados, 'observacao'),
  }
}

const paraCarteira = (id: string, s: ReturnType<typeof lerSaida>, ordem: number): MovSaida => ({
  id, data: s.data, titularId: s.titularId, programaId: s.programaId, pontos: s.pontos, ordem,
})

export async function salvarSaida(id: string | null, _e: EstadoForm, dados: FormData): Promise<EstadoForm> {
  return tratarErros(async () => {
    const usuario = await exigirUsuarioAction()
    const nova = lerSaida(dados)
    const anterior = id ? await db.saida.findUniqueOrThrow({ where: { id } }) : null

    const chaves: [string, string][] = [[nova.titularId, nova.programaId]]
    if (anterior) chaves.push([anterior.titularId, anterior.programaId])
    const erroSaldo = await validarSaldos(
      (m) => ({
        ...m,
        saidas: [...m.saidas.filter((s) => s.id !== id), paraCarteira(id ?? 'nova', nova, anterior?.criadoEm.getTime() ?? Date.now())],
      }),
      chaves,
    )
    if (erroSaldo) return { erro: erroSaldo }

    const inclui = { titular: true, programa: true } as const
    const salvo = anterior
      ? await db.saida.update({ where: { id: anterior.id }, data: nova, include: inclui })
      : await db.saida.create({ data: { ...nova, criadoPor: usuario.nome }, include: inclui })

    await auditar({
      usuario,
      acao: anterior ? 'ALTERAR' : 'CRIAR',
      entidade: 'Saida',
      entidadeId: salvo.id,
      resumo:
        `${anterior ? 'Alterou' : 'Lançou'} ${TIPOS_SAIDA[salvo.tipo].toLowerCase()} de ${formatarPontos(salvo.pontos)} pontos ` +
        `${salvo.programa.nome} de ${salvo.titular.nome} em ${formatarData(salvo.data)}` +
        (salvo.valorVenda ? ` por ${formatarReais(salvo.valorVenda)}` : ''),
    })
    revalidatePath('/', 'layout')
    redirect(dados.get('continuar') === 'sim' ? `/saidas/nova?ok=${Date.now()}` : '/saidas')
  })
}

export async function excluirSaida(id: string, _e: EstadoForm): Promise<EstadoForm> {
  return tratarErros(async () => {
    const usuario = await exigirUsuarioAction()
    const s = await db.saida.delete({ where: { id }, include: { titular: true, programa: true } })
    await auditar({
      usuario,
      acao: 'EXCLUIR',
      entidade: 'Saida',
      entidadeId: id,
      resumo: `Excluiu ${TIPOS_SAIDA[s.tipo].toLowerCase()} de ${formatarPontos(s.pontos)} pontos ${s.programa.nome} de ${s.titular.nome} (${formatarData(s.data)})`,
    })
    revalidatePath('/', 'layout')
    redirect('/saidas')
  })
}
