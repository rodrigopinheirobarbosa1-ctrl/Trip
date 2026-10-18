import { db } from '@/lib/db'
import { usuarioAtual } from '@/lib/auth'
import { carregarMovimentos } from '@/lib/dados'
import { calcularCarteira } from '@/lib/carteira'
import { custoDaEntrada } from '@/lib/custo-atribuido'
import { montarCsv, reaisCsv } from '@/lib/exportacao'
import { CATEGORIAS_ENTRADA, FORMAS_PAGAMENTO, TIPOS_SAIDA, rotulo } from '@/lib/rotulos'

/** Todos os lançamentos, na ordem do extrato de cada pessoa em cada programa. */
export async function GET() {
  const usuario = await usuarioAtual()
  if (!usuario || usuario.papel !== 'ADMIN') return new Response('Sem permissão.', { status: 403 })

  const [movimentos, entradas, saidas, transferencias, titulares, programas] = await Promise.all([
    carregarMovimentos(),
    db.entrada.findMany({ include: { cartao: true, programa: true } }),
    db.saida.findMany(),
    db.transferencia.findMany(),
    db.titular.findMany(),
    db.programa.findMany(),
  ])
  const carteira = calcularCarteira(movimentos)
  const nomeTitular = new Map(titulares.map((t) => [t.id, t.nome]))
  const nomePrograma = new Map(programas.map((p) => [p.id, p.nome]))
  const entradaPorId = new Map(entradas.map((e) => [e.id, e]))
  const saidaPorId = new Map(saidas.map((s) => [s.id, s]))
  const transfPorId = new Map(transferencias.map((t) => [t.id, t]))
  const dia = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10).split('-').reverse().join('/') : '')
  const quando = (d: Date) => d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })

  const linhas: (string | number | null)[][] = []
  const chaves = [...carteira.extratos.keys()].sort((a, b) => {
    const [ta, pa] = a.split('|')
    const [tb, pb] = b.split('|')
    return (nomeTitular.get(ta) ?? '').localeCompare(nomeTitular.get(tb) ?? '') || (nomePrograma.get(pa) ?? '').localeCompare(nomePrograma.get(pb) ?? '')
  })
  for (const chave of chaves) {
    const [titularId, programaId] = chave.split('|')
    for (const l of carteira.extratos.get(chave) ?? []) {
      const base = [nomeTitular.get(titularId) ?? '?', nomePrograma.get(programaId) ?? '?', dia(l.data)]
      const fim = [l.pontos, reaisCsv(l.custo), l.saldo, reaisCsv(l.cmp)]
      if (l.tipo === 'ENTRADA') {
        const e = entradaPorId.get(l.id)
        const c = e ? custoDaEntrada(e, e.programa.custoParceiroMilheiro) : null
        linhas.push([
          ...base, 'Entrada', rotulo(CATEGORIAS_ENTRADA, e?.categoria), '', ...fim,
          reaisCsv(e?.formaPagamento === 'SEM_DESEMBOLSO' ? 0 : e?.valor), c?.atribuido ? 'sim' : '',
          e ? rotulo(FORMAS_PAGAMENTO, e.formaPagamento) + (e.parcelas > 1 ? ` ${e.parcelas}x` : '') : '', e?.cartao?.nome ?? '',
          '', '', '', '', e?.observacao ?? '', e?.criadoPor ?? '', e ? quando(e.criadoEm) : '', l.id,
        ])
      } else if (l.tipo === 'SAIDA') {
        const s = saidaPorId.get(l.id)
        const cm = carteira.custoSaidas.get(l.id)
        linhas.push([
          ...base, 'Saída', rotulo(TIPOS_SAIDA, s?.tipo), '', ...fim, '', '', '', '', '', '',
          s?.valorVenda ? reaisCsv(s.valorVenda) : '', cm?.semLote || '', s?.observacao ?? s?.cliente ?? '',
          s?.criadoPor ?? '', s ? quando(s.criadoEm) : '', l.id,
        ])
      } else {
        const t = transfPorId.get(l.id)
        const cm = carteira.custoTransferencias.get(l.id)
        const enviada = l.tipo === 'TRANSFERENCIA_ENVIADA'
        linhas.push([
          ...base, enviada ? 'Transferência enviada' : 'Transferência recebida', t?.compraId ? 'imediata (com compra)' : '',
          nomePrograma.get((enviada ? t?.destinoId : t?.origemId) ?? '') ?? '', ...fim, '', '', '', '',
          t ? String(t.bonusPercentual).replace('.', ',') : '', t ? (enviada ? t.pontosDestino : t.pontos) : '', '',
          enviada ? cm?.semLote || '' : '', t?.observacao ?? '', t?.criadoPor ?? '', t ? quando(t.criadoEm) : '', l.id,
        ])
      }
    }
  }
  const csv = montarCsv(
    [
      'Pessoa', 'Programa', 'Data', 'Movimento', 'Tipo', 'Outro programa', 'Pontos', 'Custo (R$)', 'Saldo depois', 'CMP depois (R$)',
      'Valor pago (R$)', 'Custo atribuído', 'Pagamento', 'Cartão', 'Bônus (%)', 'Pontos do outro lado', 'Valor da venda (R$)',
      'Faltaram na origem', 'Observação', 'Lançado por', 'Lançado em', 'Id',
    ],
    linhas,
  )
  const hoje = new Date().toISOString().slice(0, 10)
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="trip-lancamentos-${hoje}.csv"`,
    },
  })
}
