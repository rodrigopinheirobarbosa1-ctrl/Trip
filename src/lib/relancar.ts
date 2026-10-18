/**
 * "Relançar" uma exclusão do histórico.
 *
 * Desde esta versão, cada exclusão guarda uma cópia do lançamento (dados).
 * As exclusões antigas só têm o texto do histórico (o de detalhes-historico.ts):
 * aqui ele é lido de volta, para o formulário abrir já preenchido. A pessoa
 * confere e salva.
 *
 * Código puro, testado em testes/relancar.test.ts.
 */
import { CATEGORIAS_ENTRADA, FORMAS_PAGAMENTO, TIPOS_SAIDA } from './rotulos'

const dia = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null)

/** Cópia de uma entrada, saída ou transferência, guardada na exclusão. */
export type Retrato =
  | {
      tipo: 'ENTRADA'
      data: string
      titularId: string
      programaId: string
      categoria: string
      pontos: number
      valor: number
      formaPagamento: string
      parcelas: number
      cartaoId: string | null
      observacao: string | null
    }
  | {
      tipo: 'SAIDA'
      data: string
      titularId: string
      programaId: string
      tipoSaida: string
      pontos: number
      taxaEmbarque: number
      valorVenda: number
      fornecedor: string | null
      cliente: string | null
      localizador: string | null
      dataIda: string | null
      dataVolta: string | null
      passageiros: number | null
      origem: string | null
      destino: string | null
      formaRecebimento: string | null
      parcelas: number
      dataRecebimento: string | null
      observacao: string | null
    }
  | {
      tipo: 'TRANSFERENCIA'
      data: string
      titularId: string
      origemId: string
      destinoId: string
      pontos: number
      bonusPercentual: number
      pontosDestino: number
      observacao: string | null
    }

export function retratoEntrada(e: {
  data: Date; titularId: string; programaId: string; categoria: string; pontos: number; valor: number
  formaPagamento: string; parcelas: number; cartaoId: string | null; observacao: string | null
}): Retrato {
  return {
    tipo: 'ENTRADA', data: dia(e.data)!, titularId: e.titularId, programaId: e.programaId, categoria: e.categoria,
    pontos: e.pontos, valor: e.valor, formaPagamento: e.formaPagamento, parcelas: e.parcelas, cartaoId: e.cartaoId,
    observacao: e.observacao,
  }
}

export function retratoSaida(s: {
  data: Date; titularId: string; programaId: string; tipo: string; pontos: number; taxaEmbarque: number; valorVenda: number
  fornecedor: string | null; cliente: string | null; localizador: string | null; dataIda: Date | null; dataVolta: Date | null
  passageiros: number | null; origem: string | null; destino: string | null; formaRecebimento: string | null; parcelas: number
  dataRecebimento: Date | null; observacao: string | null
}): Retrato {
  return {
    tipo: 'SAIDA', data: dia(s.data)!, titularId: s.titularId, programaId: s.programaId, tipoSaida: s.tipo, pontos: s.pontos,
    taxaEmbarque: s.taxaEmbarque, valorVenda: s.valorVenda, fornecedor: s.fornecedor, cliente: s.cliente,
    localizador: s.localizador, dataIda: dia(s.dataIda), dataVolta: dia(s.dataVolta), passageiros: s.passageiros,
    origem: s.origem, destino: s.destino, formaRecebimento: s.formaRecebimento, parcelas: s.parcelas,
    dataRecebimento: dia(s.dataRecebimento), observacao: s.observacao,
  }
}

export function retratoTransferencia(t: {
  data: Date; titularId: string; origemId: string; destinoId: string; pontos: number; bonusPercentual: number
  pontosDestino: number; observacao: string | null
}): Retrato {
  return {
    tipo: 'TRANSFERENCIA', data: dia(t.data)!, titularId: t.titularId, origemId: t.origemId, destinoId: t.destinoId,
    pontos: t.pontos, bonusPercentual: t.bonusPercentual, pontosDestino: t.pontosDestino, observacao: t.observacao,
  }
}

/** O que dá para tirar do texto de uma exclusão antiga (nomes, ainda sem ids). */
export type LidoDoTexto =
  | {
      tipo: 'ENTRADA'; data: string; titular: string; programa: string; categoria: string | null; pontos: number
      valor: number; formaPagamento: string | null; parcelas: number; cartao: string | null; observacao: string | null
    }
  | {
      tipo: 'SAIDA'; data: string; titular: string; programa: string; tipoSaida: string | null; pontos: number
      valorVenda: number; taxaEmbarque: number; cliente: string | null; fornecedor: string | null; localizador: string | null
      origem: string | null; destino: string | null; dataIda: string | null; dataVolta: string | null
      passageiros: number | null; formaRecebimento: string | null; parcelas: number; dataRecebimento: string | null
      observacao: string | null
    }
  | {
      tipo: 'TRANSFERENCIA'; data: string; titular: string; origem: string; destino: string; pontos: number
      bonusPercentual: number; pontosDestino: number; observacao: string | null
    }

const paraIso = (t: string | undefined) => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec((t ?? '').trim())
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null
}
const paraPontos = (t: string | undefined) => Number((t ?? '0').replace(/\./g, '')) || 0
const paraCentavos = (t: string | undefined) => {
  const m = /R\$\s*([\d.]+),(\d{2})/.exec(t ?? '')
  return m ? Number(m[1].replace(/\./g, '')) * 100 + Number(m[2]) : 0
}
const chavePeloRotulo = (tabela: Record<string, string>, texto: string | undefined, antigos: Record<string, string> = {}) => {
  const t = (texto ?? '').trim().toLowerCase()
  for (const [chave, rotulo] of Object.entries(tabela)) if (rotulo.toLowerCase() === t) return chave
  return antigos[t] ?? null
}
// Rótulos de versões anteriores do sistema.
const CATEGORIAS_ANTIGAS: Record<string, string> = {
  compra: 'COMPRA', acúmulo: 'ACUMULO', bônus: 'BONUS', 'saldo inicial': 'SALDO_INICIAL', ajuste: 'AJUSTE',
}
const TIPOS_SAIDA_ANTIGOS: Record<string, string> = { venda: 'VENDA', 'uso pessoal': 'USO_PESSOAL', 'outra saída': 'OUTRO' }

/** Partes "chave: valor" do texto; a observação vai até o fim (pode ter "; "). */
function partes(texto: string): { cabeca: string; campos: Map<string, string> } {
  const pedacos = texto.split('; ')
  const campos = new Map<string, string>()
  for (let i = 1; i < pedacos.length; i++) {
    const m = /^([a-zà-ú ]+): (.*)$/i.exec(pedacos[i])
    if (!m) continue
    if (m[1] === 'observação') {
      campos.set('observação', [m[2], ...pedacos.slice(i + 1)].join('; '))
      break
    }
    campos.set(m[1], m[2])
  }
  return { cabeca: pedacos[0], campos }
}

/** Lê o texto de uma exclusão do histórico. Devolve null se não reconhecer. */
export function lerExclusao(resumo: string): LidoDoTexto | null {
  // "Excluiu — <detalhes>" ou "Excluiu ao importar o extrato X (...) — <detalhes>"
  const i = resumo.indexOf(' — ')
  if (i >= 0) {
    const { cabeca, campos } = partes(resumo.slice(i + 3))
    const data = paraIso(campos.get('data'))
    const titular = campos.get('pessoa')
    const observacao = campos.get('observação') ?? null
    if (!data || !titular) return null

    const ent = /^Entrada \((.*)\) de ([\d.]+) pontos (.+)$/.exec(cabeca)
    if (ent) {
      const pag = /^(.+?)(?: em (\d+)x)?$/.exec(campos.get('pagamento') ?? '')
      const cartao = (campos.get('cartão') ?? '').replace(/ final \S+$/, '') || null
      return {
        tipo: 'ENTRADA', data, titular, programa: ent[3], pontos: paraPontos(ent[2]), observacao,
        categoria: chavePeloRotulo(CATEGORIAS_ENTRADA, ent[1], CATEGORIAS_ANTIGAS),
        valor: paraCentavos(campos.get('valor pago')),
        formaPagamento: chavePeloRotulo(FORMAS_PAGAMENTO, pag?.[1]),
        parcelas: Number(pag?.[2] ?? 1),
        cartao,
      }
    }
    const tra = /^Transferência (.+) → (.+)$/.exec(cabeca)
    if (tra) {
      return {
        tipo: 'TRANSFERENCIA', data, titular, origem: tra[1], destino: tra[2], observacao,
        pontos: paraPontos(/saíram ([\d.]+) pontos/.exec(resumo.slice(i))?.[1]),
        pontosDestino: paraPontos(/chegaram ([\d.]+)/.exec(resumo.slice(i))?.[1]),
        bonusPercentual: Number((campos.get('bônus') ?? '0').replace('%', '').replace(/\./g, '').replace(',', '.')) || 0,
      }
    }
    const sai = /^(.+?) de ([\d.]+) pontos (.+)$/.exec(cabeca)
    if (sai) {
      const trecho = /^(.*) → (.*)$/.exec(campos.get('trecho') ?? '')
      const rec = /^(.+?)(?: em (\d+)x)?(?: em (\d{2}\/\d{2}\/\d{4}))?$/.exec(campos.get('recebimento') ?? '')
      return {
        tipo: 'SAIDA', data, titular, programa: sai[3], pontos: paraPontos(sai[2]), observacao,
        tipoSaida: chavePeloRotulo(TIPOS_SAIDA, sai[1], TIPOS_SAIDA_ANTIGOS),
        valorVenda: paraCentavos(campos.get('valor da venda')),
        taxaEmbarque: paraCentavos(campos.get('taxa de embarque')),
        cliente: campos.get('cliente') ?? null,
        fornecedor: campos.get('fornecedor') ?? null,
        localizador: campos.get('localizador') ?? null,
        origem: trecho && trecho[1] !== '?' ? trecho[1] : null,
        destino: trecho && trecho[2] !== '?' ? trecho[2] : null,
        dataIda: paraIso(campos.get('ida')),
        dataVolta: paraIso(campos.get('volta')),
        passageiros: campos.has('passageiros') ? Number(campos.get('passageiros')) : null,
        formaRecebimento: rec?.[1] ? chavePeloRotulo(FORMAS_PAGAMENTO, rec[1]) : null,
        parcelas: Number(rec?.[2] ?? 1),
        dataRecebimento: paraIso(rec?.[3]),
      }
    }
    return null
  }
  // Formato mais antigo, com menos dados: "Excluiu entrada de 1.000 pontos Livelo de Rodrigo (05/03/2026)".
  const antiga = /^Excluiu (entrada|venda|uso pessoal|outra saída) de ([\d.]+) pontos (.+) de (.+) \((\d{2}\/\d{2}\/\d{4})\)$/i.exec(resumo)
  if (antiga) {
    const comum = { data: paraIso(antiga[5])!, titular: antiga[4], programa: antiga[3], pontos: paraPontos(antiga[2]), observacao: null }
    if (antiga[1].toLowerCase() === 'entrada') {
      return { tipo: 'ENTRADA', ...comum, categoria: null, valor: 0, formaPagamento: null, parcelas: 1, cartao: null }
    }
    return {
      tipo: 'SAIDA', ...comum, tipoSaida: TIPOS_SAIDA_ANTIGOS[antiga[1].toLowerCase()] ?? null, valorVenda: 0, taxaEmbarque: 0,
      cliente: null, fornecedor: null, localizador: null, origem: null, destino: null, dataIda: null, dataVolta: null,
      passageiros: null, formaRecebimento: null, parcelas: 1, dataRecebimento: null,
    }
  }
  return null
}
