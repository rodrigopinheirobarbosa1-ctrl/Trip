import 'server-only'
/**
 * Ferramentas da ligação com o Claude (protocolo MCP, servidor em
 * app/api/mcp/[chave]/route.ts).
 *
 * Leitura: cadastros, saldos, lançamentos, lotes, pendências e histórico.
 * Edição: criar, alterar e excluir entradas, saídas e transferências, sempre
 * pelas mesmas regras das telas (lib/lancamentos.ts) e registradas no
 * histórico como "Claude (assistente)".
 *
 * Valores em REAIS (número, ex.: 3080.5) e datas no formato AAAA-MM-DD. Pessoa,
 * programa e cartão podem ser informados pelo nome ou pelo id.
 */
import { revalidatePath } from 'next/cache'
import { db } from './db'
import { carregarCarteira, carregarNomes } from './dados'
import { listarPendencias } from './pendencias'
import { chavePosicao, rotuloTrimestre, type CustoMovimento } from './carteira'
import { centavosParaCampo } from './formatos'
import { ErroFormulario } from './form-dados'
import { CATEGORIAS_ENTRADA, FORMAS_PAGAMENTO, TIPOS_SAIDA } from './rotulos'
import { gravarEntrada, gravarSaida, gravarTransferencia, removerEntrada, removerSaida, removerTransferencia } from './lancamentos'
import { USUARIO_CLAUDE } from './ligacao-claude'

type Args = Record<string, unknown>
type Ferramenta = {
  name: string
  description: string
  inputSchema: { type: 'object'; properties: Record<string, unknown>; required?: string[] }
  edicao?: boolean
  executar: (args: Args) => Promise<unknown>
}

// ---------------------------------------------------------------- auxiliares

const reais = (centavos: number | null | undefined) => (centavos == null ? null : Math.round(centavos) / 100)
const dia = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null)
const semAcento = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
const texto = (v: unknown) => (v === undefined || v === null ? undefined : String(v))

class ErroFerramenta extends Error {}

/** Acha um cadastro pelo id ou pelo nome (sem diferenciar maiúsculas e acentos). */
function achar<T extends { id: string; nome: string }>(lista: T[], valor: unknown, oQue: string): T {
  const v = String(valor ?? '').trim()
  const achado = lista.find((x) => x.id === v) ?? lista.find((x) => semAcento(x.nome) === semAcento(v))
  if (!achado) throw new ErroFerramenta(`${oQue} "${v}" não encontrado. Opções: ${lista.map((x) => x.nome).join(', ')}.`)
  return achado
}

/** Monta o FormData das telas a partir dos campos (os não informados ficam como estão). */
function formulario(campos: Record<string, string | null | undefined>): FormData {
  const f = new FormData()
  for (const [k, v] of Object.entries(campos)) if (v !== undefined && v !== null) f.set(k, v)
  return f
}

const campoReais = (v: unknown) => (v === undefined ? undefined : v === null ? '' : centavosParaCampo(Math.round(Number(v) * 100)))
const campoInteiro = (v: unknown) => (v === undefined ? undefined : v === null ? '' : String(Math.round(Number(v))))
const campoTexto = (v: unknown) => (v === undefined ? undefined : v === null ? '' : String(v))

function custoMovimento(c: CustoMovimento | undefined) {
  if (!c) return null
  return {
    custo: reais(c.custo),
    cmpMilheiro: reais(c.cmp),
    provisorio: c.provisorio,
    pontosSemLote: c.semLote,
    lotes: c.lotes.map((l) => ({
      loteDe: dia(l.data), trimestre: l.naMedia ? rotuloTrimestre(l.trimestre) : 'fora da média', pontos: l.pontos,
      cmpMilheiro: reais(l.cmp), custo: reais(l.custo),
    })),
  }
}

// ---------------------------------------------------------------- leitura

async function verLancamento(tipo: string, id: string) {
  const carteira = await carregarCarteira()
  if (tipo === 'entrada') {
    const e = await db.entrada.findUnique({ where: { id }, include: { titular: true, programa: true, cartao: true } })
    if (!e) throw new ErroFerramenta('Entrada não encontrada.')
    return {
      tipo, id: e.id, data: dia(e.data), pessoa: e.titular.nome, programa: e.programa.nome, categoria: e.categoria,
      pontos: e.pontos, valor: reais(e.valor), formaPagamento: e.formaPagamento, parcelas: e.parcelas,
      cartao: e.cartao?.nome ?? null, observacao: e.observacao, lancadoPor: e.criadoPor, lancadoEm: e.criadoEm,
      custoNoLote: reais(carteira.lotes.get(chavePosicao(e.titularId, e.programaId))?.find((l) => l.id === e.id)?.custo),
    }
  }
  if (tipo === 'saida') {
    const s = await db.saida.findUnique({ where: { id }, include: { titular: true, programa: true } })
    if (!s) throw new ErroFerramenta('Saída não encontrada.')
    const c = carteira.custoSaidas.get(s.id)
    return {
      tipo, id: s.id, data: dia(s.data), pessoa: s.titular.nome, programa: s.programa.nome, tipoSaida: s.tipo, pontos: s.pontos,
      valorVenda: reais(s.valorVenda), taxaEmbarque: reais(s.taxaEmbarque), formaRecebimento: s.formaRecebimento,
      parcelas: s.parcelas, dataRecebimento: dia(s.dataRecebimento), cliente: s.cliente, fornecedor: s.fornecedor,
      localizador: s.localizador, origem: s.origem, destino: s.destino, dataIda: dia(s.dataIda), dataVolta: dia(s.dataVolta),
      passageiros: s.passageiros, observacao: s.observacao, lancadoPor: s.criadoPor, lancadoEm: s.criadoEm,
      custoDosPontos: custoMovimento(c),
      lucro: s.tipo === 'VENDA' ? reais(s.valorVenda - s.taxaEmbarque - (c?.custo ?? 0)) : null,
    }
  }
  if (tipo === 'transferencia') {
    const t = await db.transferencia.findUnique({ where: { id }, include: { titular: true, origem: true, destino: true } })
    if (!t) throw new ErroFerramenta('Transferência não encontrada.')
    return {
      tipo, id: t.id, data: dia(t.data), pessoa: t.titular.nome, origem: t.origem.nome, destino: t.destino.nome,
      pontos: t.pontos, bonusPercentual: t.bonusPercentual, pontosDestino: t.pontosDestino, imediata: !!t.compraId,
      compraId: t.compraId, observacao: t.observacao, lancadoPor: t.criadoPor, lancadoEm: t.criadoEm,
      custoLevado: custoMovimento(carteira.custoTransferencias.get(t.id)),
    }
  }
  throw new ErroFerramenta('tipo deve ser "entrada", "saida" ou "transferencia".')
}

async function listarLancamentos(args: Args) {
  const [nomes, carteira, entradas, saidas, transferencias] = await Promise.all([
    carregarNomes(),
    carregarCarteira(),
    db.entrada.findMany({ include: { cartao: true } }),
    db.saida.findMany(),
    db.transferencia.findMany(),
  ])
  const pessoa = args.pessoa ? achar(nomes.titulares, args.pessoa, 'Pessoa') : null
  const programa = args.programa ? achar(nomes.programas, args.programa, 'Programa') : null
  const desde = texto(args.desde)
  const ate = texto(args.ate)
  const tipo = texto(args.tipo)
  const busca = args.busca ? semAcento(String(args.busca)) : null
  const limite = Math.min(Math.max(Number(args.limite) || 300, 1), 2000)
  const ent = new Map(entradas.map((e) => [e.id, e]))
  const sai = new Map(saidas.map((s) => [s.id, s]))
  const tra = new Map(transferencias.map((t) => [t.id, t]))

  const linhas: Record<string, unknown>[] = []
  for (const [chave, extrato] of carteira.extratos) {
    const [titularId, programaId] = chave.split('|')
    if ((pessoa && pessoa.id !== titularId) || (programa && programa.id !== programaId)) continue
    for (const l of extrato) {
      const data = dia(l.data)!
      if ((desde && data < desde) || (ate && data > ate)) continue
      const base = {
        id: l.id, data, pessoa: nomes.titular.get(titularId)?.nome, programa: nomes.programa.get(programaId)?.nome,
        pontos: l.pontos, custo: reais(l.custo), saldoDepois: l.saldo, cmpDepois: reais(l.cmp),
      }
      let linha: Record<string, unknown>
      if (l.tipo === 'ENTRADA') {
        if (tipo && tipo !== 'entrada') continue
        const e = ent.get(l.id)
        linha = {
          ...base, tipo: 'entrada', categoria: e?.categoria, valor: reais(e?.valor), formaPagamento: e?.formaPagamento,
          parcelas: e?.parcelas, cartao: e?.cartao?.nome ?? null, observacao: e?.observacao, lancadoPor: e?.criadoPor,
        }
      } else if (l.tipo === 'SAIDA') {
        if (tipo && tipo !== 'saida') continue
        const s = sai.get(l.id)
        const c = carteira.custoSaidas.get(l.id)
        linha = {
          ...base, tipo: 'saida', tipoSaida: s?.tipo, valorVenda: reais(s?.valorVenda), taxaEmbarque: reais(s?.taxaEmbarque),
          cliente: s?.cliente, localizador: s?.localizador, observacao: s?.observacao, lancadoPor: s?.criadoPor,
          provisorio: c?.provisorio ?? false, pontosSemLote: c?.semLote || undefined,
        }
      } else {
        if (tipo && tipo !== 'transferencia') continue
        const t = tra.get(l.id)
        const enviada = l.tipo === 'TRANSFERENCIA_ENVIADA'
        linha = {
          ...base, tipo: enviada ? 'transferencia_enviada' : 'transferencia_recebida',
          outroPrograma: nomes.programa.get((enviada ? t?.destinoId : t?.origemId) ?? '')?.nome,
          bonusPercentual: t?.bonusPercentual, imediata: !!t?.compraId, observacao: t?.observacao, lancadoPor: t?.criadoPor,
          pontosSemLote: enviada ? carteira.custoTransferencias.get(l.id)?.semLote || undefined : undefined,
        }
      }
      if (busca && !semAcento(JSON.stringify(linha)).includes(busca)) continue
      linhas.push(linha)
    }
  }
  return {
    total: linhas.length,
    mostrando: Math.min(linhas.length, limite),
    aviso: linhas.length > limite ? `Mostrando só os ${limite} primeiros: use filtros ou aumente "limite".` : undefined,
    lancamentos: linhas.slice(0, limite),
  }
}

// ---------------------------------------------------------------- edição

async function salvarEntrada(args: Args) {
  const nomes = await carregarNomes()
  const id = texto(args.id) ?? null
  const atual = id ? await db.entrada.findUnique({ where: { id }, include: { cartao: true } }) : null
  if (id && !atual) throw new ErroFerramenta('Entrada não encontrada.')
  const cartoes = await db.cartao.findMany()
  const dados = formulario({
    data: texto(args.data) ?? dia(atual?.data),
    titularId: args.pessoa !== undefined ? achar(nomes.titulares, args.pessoa, 'Pessoa').id : atual?.titularId,
    programaId: args.programa !== undefined ? achar(nomes.programas, args.programa, 'Programa').id : atual?.programaId,
    categoria: texto(args.categoria) ?? atual?.categoria,
    pontos: campoInteiro(args.pontos) ?? (atual ? String(atual.pontos) : undefined),
    valor: campoReais(args.valor) ?? (atual ? centavosParaCampo(atual.valor) : undefined),
    formaPagamento: texto(args.formaPagamento) ?? atual?.formaPagamento ?? 'SEM_DESEMBOLSO',
    parcelas: campoInteiro(args.parcelas) ?? (atual ? String(atual.parcelas) : undefined),
    cartaoId: args.cartao !== undefined ? (args.cartao ? achar(cartoes, args.cartao, 'Cartão').id : '') : atual?.cartaoId,
    observacao: campoTexto(args.observacao) ?? atual?.observacao,
  })
  const r = await gravarEntrada(USUARIO_CLAUDE, id, dados)
  if ('erro' in r) throw new ErroFerramenta(r.erro)
  return verLancamento('entrada', r.id)
}

async function salvarSaida(args: Args) {
  const nomes = await carregarNomes()
  const id = texto(args.id) ?? null
  const atual = id ? await db.saida.findUnique({ where: { id } }) : null
  if (id && !atual) throw new ErroFerramenta('Saída não encontrada.')
  const dados = formulario({
    data: texto(args.data) ?? dia(atual?.data),
    titularId: args.pessoa !== undefined ? achar(nomes.titulares, args.pessoa, 'Pessoa').id : atual?.titularId,
    programaId: args.programa !== undefined ? achar(nomes.programas, args.programa, 'Programa').id : atual?.programaId,
    tipo: texto(args.tipo) ?? atual?.tipo,
    pontos: campoInteiro(args.pontos) ?? (atual ? String(atual.pontos) : undefined),
    valorVenda: campoReais(args.valorVenda) ?? (atual ? centavosParaCampo(atual.valorVenda) : undefined),
    taxaEmbarque: campoReais(args.taxaEmbarque) ?? (atual ? centavosParaCampo(atual.taxaEmbarque) : undefined),
    formaRecebimento: texto(args.formaRecebimento) ?? atual?.formaRecebimento ?? 'PIX',
    parcelas: campoInteiro(args.parcelas) ?? (atual ? String(atual.parcelas) : undefined),
    dataRecebimento: args.dataRecebimento !== undefined ? campoTexto(args.dataRecebimento) : dia(atual?.dataRecebimento),
    cliente: campoTexto(args.cliente) ?? atual?.cliente,
    fornecedor: campoTexto(args.fornecedor) ?? atual?.fornecedor,
    localizador: campoTexto(args.localizador) ?? atual?.localizador,
    origem: campoTexto(args.origem) ?? atual?.origem,
    destino: campoTexto(args.destino) ?? atual?.destino,
    dataIda: args.dataIda !== undefined ? campoTexto(args.dataIda) : dia(atual?.dataIda),
    dataVolta: args.dataVolta !== undefined ? campoTexto(args.dataVolta) : dia(atual?.dataVolta),
    passageiros: campoInteiro(args.passageiros) ?? (atual?.passageiros ? String(atual.passageiros) : undefined),
    observacao: campoTexto(args.observacao) ?? atual?.observacao,
  })
  const r = await gravarSaida(USUARIO_CLAUDE, id, dados)
  if ('erro' in r) throw new ErroFerramenta(r.erro)
  return verLancamento('saida', r.id)
}

async function salvarTransferencia(args: Args) {
  const nomes = await carregarNomes()
  const id = texto(args.id) ?? null
  const atual = id ? await db.transferencia.findUnique({ where: { id } }) : null
  if (id && !atual) throw new ErroFerramenta('Transferência não encontrada.')
  // Ao mudar pontos ou bônus sem informar o que chegou, o sistema recalcula a chegada.
  const recalcular = args.pontosDestino === undefined && (args.pontos !== undefined || args.bonusPercentual !== undefined)
  const dados = formulario({
    data: texto(args.data) ?? dia(atual?.data),
    titularId: args.pessoa !== undefined ? achar(nomes.titulares, args.pessoa, 'Pessoa').id : atual?.titularId,
    origemId: args.origem !== undefined ? achar(nomes.programas, args.origem, 'Programa de origem').id : atual?.origemId,
    destinoId: args.destino !== undefined ? achar(nomes.programas, args.destino, 'Programa de destino').id : atual?.destinoId,
    pontos: campoInteiro(args.pontos) ?? (atual ? String(atual.pontos) : undefined),
    bonusPercentual:
      args.bonusPercentual !== undefined ? String(args.bonusPercentual).replace('.', ',') : atual ? String(atual.bonusPercentual).replace('.', ',') : undefined,
    pontosDestino: campoInteiro(args.pontosDestino) ?? (atual && !recalcular ? String(atual.pontosDestino) : undefined),
    imediata: (args.imediata !== undefined ? !!args.imediata : !!atual?.compraId) ? 'sim' : undefined,
    observacao: campoTexto(args.observacao) ?? atual?.observacao,
  })
  const r = await gravarTransferencia(USUARIO_CLAUDE, id, dados)
  if ('erro' in r) throw new ErroFerramenta(r.erro)
  return verLancamento('transferencia', r.id)
}

async function excluirLancamento(args: Args) {
  const tipo = texto(args.tipo)
  const id = texto(args.id) ?? ''
  const antes = await verLancamento(tipo ?? '', id)
  const r =
    tipo === 'entrada'
      ? await removerEntrada(USUARIO_CLAUDE, id)
      : tipo === 'saida'
        ? await removerSaida(USUARIO_CLAUDE, id)
        : await removerTransferencia(USUARIO_CLAUDE, id)
  if ('erro' in r) throw new ErroFerramenta(r.erro)
  return { excluido: antes, comoDesfazer: 'No Trip: Histórico → botão "Relançar" desta exclusão.' }
}

// ---------------------------------------------------------------- catálogo

const PESSOA = { type: 'string', description: 'Nome ou id da pessoa (titular/CPF).' }
const PROGRAMA = { type: 'string', description: 'Nome ou id do programa.' }
const DATA = { type: 'string', description: 'Data no formato AAAA-MM-DD.' }
const ID_OPCIONAL = { type: 'string', description: 'Id do lançamento para alterar. Sem id, cria um novo. Ao alterar, só os campos informados mudam.' }

export const FERRAMENTAS: Ferramenta[] = [
  {
    name: 'ver_cadastros',
    description: 'Pessoas, programas (com o custo atribuído padrão de parceiros), cartões e os códigos aceitos de categoria, forma de pagamento e tipo de saída.',
    inputSchema: { type: 'object', properties: {} },
    executar: async () => {
      const [nomes, cartoes] = await Promise.all([carregarNomes(), db.cartao.findMany({ orderBy: { nome: 'asc' } })])
      return {
        pessoas: nomes.titulares.map((t) => ({ id: t.id, nome: t.nome })),
        programas: nomes.programas.map((p) => ({ id: p.id, nome: p.nome, custoParceiroMilheiro: reais(p.custoParceiroMilheiro) })),
        cartoes: cartoes.map((c) => ({ id: c.id, nome: c.nome, final: c.final, ativo: c.ativo })),
        categoriasEntrada: CATEGORIAS_ENTRADA,
        formasPagamento: FORMAS_PAGAMENTO,
        tiposSaida: TIPOS_SAIDA,
        metodoDeCusto: 'Custo médio por trimestre (tudo o que entra no trimestre tem a média do trimestre inteiro), com PEPS entre trimestres. Saldo inicial e ajustes ficam fora da média.',
      }
    },
  },
  {
    name: 'ver_saldos',
    description: 'Saldo de pontos, custo total e CMP (custo por milheiro, em reais) de cada pessoa em cada programa.',
    inputSchema: { type: 'object', properties: { pessoa: PESSOA, programa: PROGRAMA } },
    executar: async (args) => {
      const [nomes, carteira] = await Promise.all([carregarNomes(), carregarCarteira()])
      const pessoa = args.pessoa ? achar(nomes.titulares, args.pessoa, 'Pessoa') : null
      const programa = args.programa ? achar(nomes.programas, args.programa, 'Programa') : null
      return [...carteira.posicoes.values()]
        .filter((p) => (!pessoa || p.titularId === pessoa.id) && (!programa || p.programaId === programa.id))
        .map((p) => ({
          pessoa: nomes.titular.get(p.titularId)?.nome, programa: nomes.programa.get(p.programaId)?.nome, pontos: p.pontos,
          custo: reais(p.custo), cmpMilheiro: reais(p.cmp), ficouNegativoEm: dia(p.ficouNegativoEm),
        }))
        .sort((a, b) => `${a.pessoa}${a.programa}`.localeCompare(`${b.pessoa}${b.programa}`))
    },
  },
  {
    name: 'listar_lancamentos',
    description:
      'Lançamentos na ordem do extrato de cada pessoa/programa, com custo, saldo e CMP depois de cada um. ' +
      'Filtros opcionais; "busca" procura em qualquer campo (observação, cliente...).',
    inputSchema: {
      type: 'object',
      properties: {
        pessoa: PESSOA, programa: PROGRAMA, desde: DATA, ate: DATA,
        tipo: { type: 'string', enum: ['entrada', 'saida', 'transferencia'] },
        busca: { type: 'string' },
        limite: { type: 'number', description: 'Máximo de linhas (padrão 300, até 2000).' },
      },
    },
    executar: listarLancamentos,
  },
  {
    name: 'ver_lancamento',
    description: 'Todos os campos de um lançamento e, em saídas e transferências, de quais lotes saíram os pontos e o custo.',
    inputSchema: {
      type: 'object',
      properties: { tipo: { type: 'string', enum: ['entrada', 'saida', 'transferencia'] }, id: { type: 'string' } },
      required: ['tipo', 'id'],
    },
    executar: (args) => verLancamento(String(args.tipo), String(args.id)),
  },
  {
    name: 'ver_lotes',
    description: 'Lotes de pontos de uma pessoa num programa (trimestre, custo próprio, CMP médio do trimestre, pontos restantes).',
    inputSchema: {
      type: 'object',
      properties: { pessoa: PESSOA, programa: PROGRAMA, incluirEsgotados: { type: 'boolean' } },
      required: ['pessoa', 'programa'],
    },
    executar: async (args) => {
      const [nomes, carteira] = await Promise.all([carregarNomes(), carregarCarteira()])
      const t = achar(nomes.titulares, args.pessoa, 'Pessoa')
      const p = achar(nomes.programas, args.programa, 'Programa')
      return (carteira.lotes.get(chavePosicao(t.id, p.id)) ?? [])
        .filter((l) => args.incluirEsgotados || l.restantes > 0)
        .map((l) => ({
          id: l.id, origem: l.origem, data: dia(l.data), trimestre: l.naMedia ? rotuloTrimestre(l.trimestre) : 'fora da média',
          pontos: l.pontos, restantes: l.restantes, custoProprio: reais(l.custoProprio), cmpMilheiro: reais(l.cmp),
        }))
    },
  },
  {
    name: 'listar_pendencias',
    description: 'Problemas que o sistema aponta: saldos negativos, vendas sem valor, transferências que saíram sem saldo na origem.',
    inputSchema: { type: 'object', properties: {} },
    executar: async () => listarPendencias(),
  },
  {
    name: 'ver_historico',
    description: 'Últimos registros do histórico (quem lançou, alterou ou excluiu o quê).',
    inputSchema: { type: 'object', properties: { busca: { type: 'string' }, limite: { type: 'number', description: 'Padrão 50, até 500.' } } },
    executar: async (args) => {
      const registros = await db.auditoria.findMany({
        where: args.busca ? { resumo: { contains: String(args.busca), mode: 'insensitive' } } : {},
        orderBy: { criadoEm: 'desc' },
        take: Math.min(Math.max(Number(args.limite) || 50, 1), 500),
      })
      return registros.map((r) => ({ quando: r.criadoEm, quem: r.usuarioNome, acao: r.acao, entidade: r.entidade, entidadeId: r.entidadeId, resumo: r.resumo }))
    },
  },
  {
    name: 'salvar_entrada',
    edicao: true,
    description:
      'Cria ou altera uma entrada de pontos. Categorias: COMPRA, ACUMULO (cartão/voo, custo zero), PARCEIRO (custo atribuído), BONUS, SALDO_INICIAL, AJUSTE. ' +
      'Valor pago em reais; com valor > 0 (exceto PARCEIRO) informe formaPagamento (PIX, CARTAO, BOLETO, DINHEIRO, OUTRO).',
    inputSchema: {
      type: 'object',
      properties: {
        id: ID_OPCIONAL, data: DATA, pessoa: PESSOA, programa: PROGRAMA,
        categoria: { type: 'string', enum: Object.keys(CATEGORIAS_ENTRADA) },
        pontos: { type: 'number' }, valor: { type: 'number', description: 'Reais.' },
        formaPagamento: { type: 'string', enum: Object.keys(FORMAS_PAGAMENTO) },
        parcelas: { type: 'number' }, cartao: { type: 'string', description: 'Nome ou id do cartão (pagamento CARTAO).' },
        observacao: { type: 'string' },
      },
    },
    executar: salvarEntrada,
  },
  {
    name: 'salvar_saida',
    edicao: true,
    description: 'Cria ou altera uma emissão/venda (tipos VENDA, USO_PESSOAL, OUTRO). Valores em reais.',
    inputSchema: {
      type: 'object',
      properties: {
        id: ID_OPCIONAL, data: DATA, pessoa: PESSOA, programa: PROGRAMA,
        tipo: { type: 'string', enum: Object.keys(TIPOS_SAIDA) },
        pontos: { type: 'number' }, valorVenda: { type: 'number' }, taxaEmbarque: { type: 'number' },
        formaRecebimento: { type: 'string', enum: Object.keys(FORMAS_PAGAMENTO).filter((f) => f !== 'SEM_DESEMBOLSO') },
        parcelas: { type: 'number' }, dataRecebimento: DATA, cliente: { type: 'string' }, fornecedor: { type: 'string' },
        localizador: { type: 'string' }, origem: { type: 'string' }, destino: { type: 'string' }, dataIda: DATA, dataVolta: DATA,
        passageiros: { type: 'number' }, observacao: { type: 'string' },
      },
    },
    executar: salvarSaida,
  },
  {
    name: 'salvar_transferencia',
    edicao: true,
    description:
      'Cria ou altera uma transferência entre programas da mesma pessoa. Sem pontosDestino, o sistema calcula pelos pontos e pelo bônus. ' +
      'imediata=true liga à compra de pontos feita na hora na origem.',
    inputSchema: {
      type: 'object',
      properties: {
        id: ID_OPCIONAL, data: DATA, pessoa: PESSOA,
        origem: { type: 'string', description: 'Programa de origem (nome ou id).' },
        destino: { type: 'string', description: 'Programa de destino (nome ou id).' },
        pontos: { type: 'number' }, bonusPercentual: { type: 'number' }, pontosDestino: { type: 'number' },
        imediata: { type: 'boolean' }, observacao: { type: 'string' },
      },
    },
    executar: salvarTransferencia,
  },
  {
    name: 'excluir_lancamento',
    edicao: true,
    description: 'Exclui um lançamento. Fica no histórico e pode ser desfeito pelo botão "Relançar".',
    inputSchema: {
      type: 'object',
      properties: { tipo: { type: 'string', enum: ['entrada', 'saida', 'transferencia'] }, id: { type: 'string' } },
      required: ['tipo', 'id'],
    },
    executar: excluirLancamento,
  },
]

/** Executa uma ferramenta e devolve o resultado no formato do MCP. */
export async function chamarFerramenta(nome: string, args: Args, edicao: boolean) {
  const f = FERRAMENTAS.find((x) => x.name === nome)
  const erro = (texto: string) => ({ content: [{ type: 'text', text: texto }], isError: true })
  if (!f) return erro(`Ferramenta desconhecida: ${nome}`)
  if (f.edicao && !edicao) return erro('A edição está desligada no Trip (Ligação com o Claude). Só a leitura está liberada.')
  try {
    const resultado = await f.executar(args ?? {})
    if (f.edicao) revalidatePath('/', 'layout')
    return { content: [{ type: 'text', text: JSON.stringify(resultado, null, 1) }] }
  } catch (e) {
    if (e instanceof ErroFerramenta || e instanceof ErroFormulario) return erro(e.message)
    if (e && typeof e === 'object' && 'code' in e && (e as { code: string }).code === 'P2025') return erro('Lançamento não encontrado.')
    console.error(e)
    return erro('Erro inesperado no Trip. Tente de novo; se continuar, veja o log da Vercel.')
  }
}
