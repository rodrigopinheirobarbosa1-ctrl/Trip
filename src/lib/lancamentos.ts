import 'server-only'
/**
 * Gravar e excluir entradas, saídas e transferências: as regras dos
 * formulários (validação, saldo que não pode ficar negativo, histórico) num
 * lugar só. Usado pelas telas e pela ligação com o Claude (api/mcp).
 *
 * Erros de preenchimento são lançados como ErroFormulario; problemas de saldo
 * voltam como { erro }.
 */
import { db } from './db'
import type { UsuarioLogado } from './auth'
import { auditar } from './audit'
import { validarSaldos } from './dados'
import { detalharEntrada, detalharSaida, detalharTransferencia } from './detalhes-historico'
import { retratoEntrada, retratoSaida, retratoTransferencia } from './relancar'
import { calcularPontosDestino, type MovEntrada, type MovSaida, type MovTransferencia } from './carteira'
import { formatarData, formatarPontos, formatarReais, lerPontos } from './formatos'
import {
  centavosOpcional,
  dataObrigatoria,
  dataOpcional,
  ErroFormulario,
  inteiroEntre,
  numeroOpcional,
  opcao,
  pontosObrigatorio,
  textoObrigatorio,
  textoOpcional,
} from './form-dados'
import { CATEGORIAS_ENTRADA, FORMAS_PAGAMENTO, TIPOS_SAIDA } from './rotulos'

export type Resultado = { erro: string } | { id: string }

// ---------------------------------------------------------------- entradas

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

const entradaNaCarteira = (id: string, e: ReturnType<typeof lerEntrada>, ordem: number): MovEntrada => ({
  id, data: e.data, titularId: e.titularId, programaId: e.programaId, pontos: e.pontos, valor: e.valor, ordem,
})

export async function gravarEntrada(usuario: UsuarioLogado, id: string | null, dados: FormData): Promise<Resultado> {
  const nova = lerEntrada(dados)
  const anterior = id ? await db.entrada.findUniqueOrThrow({ where: { id } }) : null

  const chaves: [string, string][] = [[nova.titularId, nova.programaId]]
  if (anterior) chaves.push([anterior.titularId, anterior.programaId])
  const erroSaldo = await validarSaldos(
    (m) => ({
      ...m,
      entradas: [
        ...m.entradas.filter((e) => e.id !== id),
        entradaNaCarteira(id ?? 'nova', nova, anterior?.criadoEm.getTime() ?? Date.now()),
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
  return { id: salvo.id }
}

export async function removerEntrada(usuario: UsuarioLogado, id: string): Promise<Resultado> {
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
  return { id }
}

// ---------------------------------------------------------------- saídas

const TIPOS = Object.keys(TIPOS_SAIDA) as (keyof typeof TIPOS_SAIDA)[]
const FORMAS_RECEBIMENTO = FORMAS.filter((f) => f !== 'SEM_DESEMBOLSO')

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
    formaRecebimento: venda && valorVenda > 0 ? opcao(dados, 'formaRecebimento', 'Forma de recebimento', FORMAS_RECEBIMENTO) : null,
    parcelas: venda && valorVenda > 0 ? inteiroEntre(dados, 'parcelas', 'Parcelas', 1, 48, 1) : 1,
    dataRecebimento: venda && valorVenda > 0 ? (dataOpcional(dados, 'dataRecebimento', 'Data do recebimento') ?? data) : null,
    observacao: textoOpcional(dados, 'observacao'),
  }
}

const saidaNaCarteira = (id: string, s: ReturnType<typeof lerSaida>, ordem: number): MovSaida => ({
  id, data: s.data, titularId: s.titularId, programaId: s.programaId, pontos: s.pontos, ordem,
})

export async function gravarSaida(usuario: UsuarioLogado, id: string | null, dados: FormData): Promise<Resultado> {
  const nova = lerSaida(dados)
  const anterior = id ? await db.saida.findUniqueOrThrow({ where: { id } }) : null

  const chaves: [string, string][] = [[nova.titularId, nova.programaId]]
  if (anterior) chaves.push([anterior.titularId, anterior.programaId])
  const erroSaldo = await validarSaldos(
    (m) => ({
      ...m,
      saidas: [...m.saidas.filter((s) => s.id !== id), saidaNaCarteira(id ?? 'nova', nova, anterior?.criadoEm.getTime() ?? Date.now())],
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
  return { id: salvo.id }
}

export async function removerSaida(usuario: UsuarioLogado, id: string): Promise<Resultado> {
  const s = await db.saida.delete({ where: { id }, include: { titular: true, programa: true } })
  await auditar({
    usuario,
    acao: 'EXCLUIR',
    entidade: 'Saida',
    entidadeId: id,
    resumo: `Excluiu — ${detalharSaida(s)}`,
    dados: retratoSaida(s),
  })
  return { id }
}

// ---------------------------------------------------------------- transferências

function lerTransferencia(dados: FormData) {
  const origemId = textoObrigatorio(dados, 'origemId', 'Programa de origem')
  const destinoId = textoObrigatorio(dados, 'destinoId', 'Programa de destino')
  if (origemId === destinoId) throw new ErroFormulario('Origem e destino precisam ser programas diferentes.')
  const pontos = pontosObrigatorio(dados, 'pontos', 'Pontos transferidos')
  const bonusPercentual = numeroOpcional(dados, 'bonusPercentual', 'Bônus (%)') ?? 0
  if (bonusPercentual <= -100 || bonusPercentual > 1000) throw new ErroFormulario('O bônus deve ficar entre -99% e 1000%.')
  // Quantidade que chegou: a pessoa pode corrigir se o programa arredondou diferente.
  const informado = lerPontos(textoOpcional(dados, 'pontosDestino'))
  const pontosDestino = informado && informado > 0 ? informado : calcularPontosDestino(pontos, bonusPercentual)
  return {
    data: dataObrigatoria(dados, 'data', 'Data'),
    titularId: textoObrigatorio(dados, 'titularId', 'Pessoa'),
    origemId,
    destinoId,
    pontos,
    bonusPercentual,
    pontosDestino,
    observacao: textoOpcional(dados, 'observacao'),
    imediata: dados.get('imediata') === 'sim',
  }
}

const DIA = 86400000

/**
 * Transferência imediata: acha a compra feita na hora, na origem, para completar
 * a transferência. Mesma pessoa e programa, até 3 dias de diferença, no máximo os
 * pontos transferidos, e ainda não ligada a outra transferência.
 */
async function acharCompraImediata(
  t: { data: Date; titularId: string; origemId: string; pontos: number },
  transferenciaId: string | null,
): Promise<string> {
  const compras = await db.entrada.findMany({
    where: {
      titularId: t.titularId,
      programaId: t.origemId,
      categoria: 'COMPRA',
      pontos: { lte: t.pontos },
      data: { gte: new Date(t.data.getTime() - 3 * DIA), lte: new Date(t.data.getTime() + 3 * DIA) },
      transferenciasImediatas: { none: transferenciaId ? { id: { not: transferenciaId } } : {} },
    },
  })
  const melhor = compras.sort(
    (a, b) => Math.abs(a.data.getTime() - t.data.getTime()) - Math.abs(b.data.getTime() - t.data.getTime()) || b.pontos - a.pontos,
  )[0]
  if (!melhor) {
    throw new ErroFormulario(
      'Transferência imediata: não achei a compra de pontos na origem perto desta data. Lance antes a compra (Entradas → Nova, tipo Compra, ' +
        'com os pontos comprados e o valor pago) e salve a transferência de novo.',
    )
  }
  return melhor.id
}

const transferenciaNaCarteira = (
  id: string,
  t: Omit<ReturnType<typeof lerTransferencia>, 'imediata'>,
  ordem: number,
  compraId: string | null,
): MovTransferencia => ({
  id, data: t.data, titularId: t.titularId, origemId: t.origemId, destinoId: t.destinoId,
  pontos: t.pontos, pontosDestino: t.pontosDestino, ordem, compraId,
})

export async function gravarTransferencia(usuario: UsuarioLogado, id: string | null, dados: FormData): Promise<Resultado> {
  const { imediata, ...nova } = lerTransferencia(dados)
  const anterior = id ? await db.transferencia.findUniqueOrThrow({ where: { id } }) : null
  const compraId = imediata ? await acharCompraImediata(nova, id) : null

  const chaves: [string, string][] = [
    [nova.titularId, nova.origemId],
    [nova.titularId, nova.destinoId],
  ]
  if (anterior) chaves.push([anterior.titularId, anterior.origemId], [anterior.titularId, anterior.destinoId])
  const erroSaldo = await validarSaldos(
    (m) => ({
      ...m,
      transferencias: [
        ...m.transferencias.filter((t) => t.id !== id),
        transferenciaNaCarteira(id ?? 'nova', nova, anterior?.criadoEm.getTime() ?? Date.now(), compraId),
      ],
    }),
    chaves,
  )
  if (erroSaldo) return { erro: erroSaldo }

  const inclui = { titular: true, origem: true, destino: true } as const
  const salvo = anterior
    ? await db.transferencia.update({ where: { id: anterior.id }, data: { ...nova, compraId }, include: inclui })
    : await db.transferencia.create({ data: { ...nova, compraId, criadoPor: usuario.nome }, include: inclui })

  await auditar({
    usuario,
    acao: anterior ? 'ALTERAR' : 'CRIAR',
    entidade: 'Transferencia',
    entidadeId: salvo.id,
    resumo:
      `${anterior ? 'Alterou' : 'Lançou'} transferência de ${formatarPontos(salvo.pontos)} ${salvo.origem.nome} → ` +
      `${formatarPontos(salvo.pontosDestino)} ${salvo.destino.nome} (${salvo.titular.nome}, ${formatarData(salvo.data)})` +
      (compraId ? ' — transferência imediata, com a compra feita na hora' : ''),
  })
  return { id: salvo.id }
}

export async function removerTransferencia(usuario: UsuarioLogado, id: string): Promise<Resultado> {
  const t = await db.transferencia.findUniqueOrThrow({ where: { id }, include: { titular: true, origem: true, destino: true } })
  const erroSaldo = await validarSaldos(
    (m) => ({ ...m, transferencias: m.transferencias.filter((x) => x.id !== id) }),
    [[t.titularId, t.destinoId]],
  )
  if (erroSaldo) return { erro: `Não dá para excluir: os pontos recebidos já foram usados. ${erroSaldo}` }
  await db.transferencia.delete({ where: { id } })
  await auditar({
    usuario,
    acao: 'EXCLUIR',
    entidade: 'Transferencia',
    entidadeId: id,
    resumo: `Excluiu — ${detalharTransferencia(t)}`,
    dados: retratoTransferencia(t),
  })
  return { id }
}
