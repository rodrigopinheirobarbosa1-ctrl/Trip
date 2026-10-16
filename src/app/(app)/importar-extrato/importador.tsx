'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from '@/components/link'
import { Aviso } from '@/components/ui'
import { calcularPontosDestino } from '@/lib/carteira'
import { formatarCmp, formatarData, formatarPontos, lerCentavos, lerData, lerNumero, lerPontos } from '@/lib/formatos'
import { ACOES, ACOES_ENTRADA, ACOES_SAIDA, type Acao, type LinhaLida, type Sugestao } from '@/lib/extrato/sugestao'
import { prepararArquivos } from './arquivos'
import { gravarExtrato, lerPagina, montarConferencia, type Conferencia, type ItemConfirmado } from './actions'

type Item = { id: string; nome: string }

type Linha = {
  s: Sugestao
  incluir: boolean
  acao: Acao
  outroProgramaId: string
  valor: string
  formaPagamento: ItemConfirmado['formaPagamento']
  parcelas: string
  bonus: string
  pontosOutro: string
  valorVenda: string
}

const FORMAS: { valor: ItemConfirmado['formaPagamento']; texto: string }[] = [
  { valor: 'CARTAO', texto: 'Cartão' },
  { valor: 'PIX', texto: 'PIX' },
  { valor: 'BOLETO', texto: 'Boleto' },
  { valor: 'DINHEIRO', texto: 'Dinheiro' },
  { valor: 'OUTRO', texto: 'Outro' },
]

const centavosParaTexto = (c: number) => `${Math.floor(c / 100)},${String(c % 100).padStart(2, '0')}`

function linhaInicial(s: Sugestao): Linha {
  const pts = Math.abs(s.linha.pontos)
  return {
    s,
    incluir: !s.jaLancado && s.acao !== 'IGNORAR',
    acao: s.acao,
    outroProgramaId: s.outroProgramaId ?? '',
    valor: s.acao === 'COMPRA' && s.valorMilheiro ? centavosParaTexto(Math.round((s.valorMilheiro * pts) / 1000)) : '',
    formaPagamento: 'CARTAO',
    parcelas: '1',
    bonus: s.bonusPercentual !== null ? String(s.bonusPercentual).replace('.', ',') : '0',
    pontosOutro: '',
    valorVenda: '',
  }
}

export function ImportadorExtrato({
  titulares,
  programas,
  iaConfigurada,
}: {
  titulares: Item[]
  programas: Item[]
  iaConfigurada: boolean
}) {
  const [titularId, setTitularId] = useState('')
  const [programaId, setProgramaId] = useState('')
  const [progresso, setProgresso] = useState<{ feitas: number; total: number } | null>(null)
  const [erros, setErros] = useState<string[]>([])
  const [conferencia, setConferencia] = useState<Conferencia | null>(null)
  const [saldoExtrato, setSaldoExtrato] = useState<number | null>(null)
  const [linhas, setLinhas] = useState<Linha[]>([])
  const [resultado, setResultado] = useState<{ erro?: string; ok?: string } | null>(null)
  const [saldoInicial, setSaldoInicial] = useState({ lancar: false, pontos: '', valor: '' })
  /** Lançamentos do sistema, no período, que não aparecem no extrato e serão apagados. */
  const [excluir, setExcluir] = useState<Set<string>>(new Set())
  const [gravando, iniciar] = useTransition()

  const lendo = progresso !== null && progresso.feitas < progresso.total
  const nomeTitular = titulares.find((t) => t.id === titularId)?.nome
  const nomePrograma = programas.find((p) => p.id === programaId)?.nome

  async function ler(arquivos: File[]) {
    setErros([])
    setResultado(null)
    setConferencia(null)
    setLinhas([])
    setSaldoExtrato(null)
    let paginas
    try {
      paginas = await prepararArquivos(arquivos)
    } catch (e) {
      setErros([e instanceof Error ? e.message : 'Não consegui abrir os arquivos.'])
      return
    }
    if (paginas.length === 0) return
    setProgresso({ feitas: 0, total: paginas.length })

    // Lê duas páginas por vez: mais rápido, sem sobrecarregar o servidor.
    const lidas: LinhaLida[][] = new Array(paginas.length).fill(null).map(() => [])
    const saldos: (number | null)[] = new Array(paginas.length).fill(null)
    const falhas: string[] = []
    let proxima = 0
    const trabalhar = async () => {
      while (proxima < paginas.length) {
        const n = proxima++
        try {
          const r = await lerPagina({ programaId, pagina: n + 1, dados: paginas[n].dados, tipo: paginas[n].tipo })
          if (r.ok) {
            lidas[n] = r.linhas
            saldos[n] = r.saldoExibido
          } else falhas.push(`${paginas[n].nome}: ${r.erro}`)
        } catch {
          falhas.push(`${paginas[n].nome}: falha de conexão ao ler.`)
        }
        setProgresso((p) => (p ? { ...p, feitas: p.feitas + 1 } : p))
      }
    }
    await Promise.all([trabalhar(), trabalhar()])
    setErros(falhas)
    setSaldoExtrato(saldos.find((s) => s !== null) ?? null)

    const c = await montarConferencia({ titularId, programaId, paginas: lidas })
    setConferencia(c)
    setLinhas(c.sugestoes.map(linhaInicial))
    // O extrato é a referência. Com o saldo final dele dá para saber quanto havia antes do
    // período: saldo final - tudo o que o extrato movimentou. O que o sistema já tinha antes
    // do período é descontado, e a diferença vira saldo inicial (ou ajuste, se negativa).
    const saldoFinal = saldos.find((s) => s !== null) ?? null
    const ajuste =
      saldoFinal !== null ? saldoFinal - c.sugestoes.reduce((s, x) => s + x.linha.pontos, 0) - c.saldoAntesDoPeriodo : null
    setSaldoInicial({
      lancar: ajuste !== null && ajuste !== 0,
      pontos: ajuste !== null && ajuste !== 0 ? formatarPontos(ajuste) : '',
      valor: '',
    })
    // Com o saldo do extrato conhecido, o que não aparece nele vem marcado para excluir.
    // Transferências não: mexem também no outro programa e podem ter saído de outra pessoa.
    setExcluir(new Set(saldoFinal !== null ? c.foraDoExtrato.filter((f) => f.tipo !== 'TRANSFERENCIA').map((f) => f.id) : []))
    setProgresso(null)
  }

  const alterar = (i: number, mudanca: Partial<Linha>) =>
    setLinhas((ls) => ls.map((l, n) => (n === i ? { ...l, ...mudanca } : l)))

  const marcadas = linhas.filter((l) => l.incluir && l.acao !== 'IGNORAR')
  const pontosSaldoInicial = saldoInicial.lancar ? (lerPontos(saldoInicial.pontos) ?? 0) : 0
  const foraDoExtrato = conferencia?.foraDoExtrato ?? []
  const efeitoExcluidos = foraDoExtrato.filter((f) => excluir.has(f.id)).reduce((s, f) => s + f.pontos, 0)
  const mantidosForaDoExtrato = foraDoExtrato.filter((f) => !excluir.has(f.id)).reduce((s, f) => s + f.pontos, 0)
  const saldoDepois =
    (conferencia?.saldoSistema ?? 0) - efeitoExcluidos + pontosSaldoInicial + marcadas.reduce((s, l) => s + l.s.linha.pontos, 0)
  const primeiraData = linhas[0]?.s.linha.data
  const diaAntes = primeiraData ? new Date(new Date(`${primeiraData}T00:00:00Z`).getTime() - 86400000).toISOString().slice(0, 10) : null
  const comprasSemValor = marcadas.filter((l) => l.acao === 'COMPRA' && !lerCentavos(l.valor)).length
  const transfSemPrograma = marcadas.filter((l) => l.acao.startsWith('TRANSF') && !l.outroProgramaId).length

  const resumoPorAcao = useMemo(() => {
    const m = new Map<Acao, number>()
    for (const l of marcadas) m.set(l.acao, (m.get(l.acao) ?? 0) + 1)
    return [...m.entries()]
  }, [marcadas])

  function gravar() {
    const itens: ItemConfirmado[] = marcadas.map((l) => ({
      linha: l.s.linha,
      chave: l.s.chave,
      acao: l.acao,
      outroProgramaId: l.outroProgramaId || null,
      valor: lerCentavos(l.valor) ?? 0,
      formaPagamento: l.formaPagamento,
      parcelas: Math.min(48, Math.max(1, Math.round(lerNumero(l.parcelas) ?? 1))),
      pontosOutro: lerPontos(l.pontosOutro) || null,
      bonusPercentual: lerNumero(l.bonus) ?? 0,
      valorVenda: lerCentavos(l.valorVenda) ?? 0,
    }))
    const pontosIniciais = lerPontos(saldoInicial.pontos)
    iniciar(async () => {
      const r = await gravarExtrato({
        titularId,
        programaId,
        itens,
        saldoInicial:
          saldoInicial.lancar && pontosIniciais && diaAntes
            ? { data: diaAntes, pontos: pontosIniciais, valor: pontosIniciais > 0 ? (lerCentavos(saldoInicial.valor) ?? 0) : 0 }
            : null,
        excluir: foraDoExtrato.filter((f) => excluir.has(f.id)).map((f) => ({ tipo: f.tipo, id: f.id })),
      })
      setResultado(r)
      if (r.ok) {
        setConferencia(null)
        setLinhas([])
      }
    })
  }

  if (!iaConfigurada) {
    return (
      <Aviso tom="amarelo">
        A leitura automática ainda não está ligada. O administrador precisa cadastrar a chave da IA
        (<strong>ANTHROPIC_API_KEY</strong>) nas configurações da Vercel — o passo a passo está no README do projeto.
      </Aviso>
    )
  }

  return (
    <div className="space-y-4">
      {!conferencia && (
        <div className="cartao space-y-4 p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="rotulo">De quem é o extrato</span>
              <select value={titularId} onChange={(e) => setTitularId(e.target.value)} className="campo" disabled={lendo}>
                <option value="">Selecione</option>
                {titulares.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nome}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="rotulo">Programa do extrato</span>
              <select value={programaId} onChange={(e) => setProgramaId(e.target.value)} className="campo" disabled={lendo}>
                <option value="">Selecione</option>
                {programas.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="block">
            <span className="rotulo">Prints, PDF ou Word com os prints</span>
            <input
              type="file"
              multiple
              accept="image/*,.pdf,.docx"
              disabled={!titularId || !programaId || lendo}
              onChange={(e) => {
                const fs = Array.from(e.target.files ?? [])
                if (fs.length) ler(fs)
                e.target.value = ''
              }}
              className="block w-full text-sm text-slate-600 file:mr-4 file:rounded-lg file:border-0 file:bg-marca-600 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-marca-700 disabled:opacity-50"
            />
            {(!titularId || !programaId) && <span className="mt-1 block text-xs text-slate-400">Escolha a pessoa e o programa primeiro.</span>}
          </label>
          {progresso && (
            <div>
              <p className="mb-1 text-sm text-slate-600">
                Lendo página {Math.min(progresso.feitas + 1, progresso.total)} de {progresso.total}… (cada uma leva alguns segundos)
              </p>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full bg-marca-600 transition-all" style={{ width: `${(progresso.feitas / progresso.total) * 100}%` }} />
              </div>
            </div>
          )}
        </div>
      )}

      {erros.length > 0 && (
        <Aviso tom="vermelho">
          <p className="font-semibold">Algumas páginas não foram lidas:</p>
          <ul className="mt-1 list-disc pl-5">
            {erros.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </Aviso>
      )}
      {resultado?.erro && <Aviso tom="vermelho">{resultado.erro}</Aviso>}
      {resultado?.ok && (
        <Aviso tom="verde">
          {resultado.ok}{' '}
          <Link href={`/extrato?titular=${titularId}&programa=${programaId}`} className="font-semibold underline">
            Ver extrato de {nomePrograma}
          </Link>
        </Aviso>
      )}

      {conferencia && (
        <>
          <div className="cartao grid gap-3 p-4 text-sm sm:grid-cols-4">
            <div>
              <p className="text-xs text-slate-500">Extrato</p>
              <p className="font-semibold">
                {nomePrograma} de {nomeTitular}
              </p>
              <p className="text-xs text-slate-500">{linhas.length} linha(s) lida(s)</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Saldo hoje no sistema</p>
              <p className="font-semibold">{formatarPontos(conferencia.saldoSistema)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Saldo no sistema depois de gravar</p>
              <p className="font-semibold">{formatarPontos(saldoDepois)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Saldo mostrado no extrato</p>
              <p className="font-semibold">{saldoExtrato !== null ? formatarPontos(saldoExtrato) : 'não aparece nos prints'}</p>
              {saldoExtrato !== null && saldoExtrato !== saldoDepois && (
                <p className="text-xs text-amber-700">
                  Diferença de {formatarPontos(saldoDepois - saldoExtrato)}.{' '}
                  {mantidosForaDoExtrato !== 0
                    ? `Os lançamentos fora do extrato que você vai manter somam ${formatarPontos(mantidosForaDoExtrato)} pontos: confira-os abaixo.`
                    : 'Confira as linhas desmarcadas e o acerto do saldo anterior.'}
                </p>
              )}
              {saldoExtrato !== null && saldoExtrato === saldoDepois && <p className="text-xs text-emerald-700">Bate com o extrato ✓</p>}
            </div>
          </div>

          {foraDoExtrato.length > 0 && (
            <div className="cartao space-y-3 p-4 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">
                    {foraDoExtrato.length} lançamento(s) do sistema neste período não aparecem no extrato
                  </p>
                  <p className="text-xs text-slate-500">
                    Normalmente são lançamentos antigos (da planilha) duplicados ou com valor diferente. Os marcados serão{' '}
                    <strong>excluídos</strong> ao gravar, para o sistema ficar igual ao extrato. Transferências vêm desmarcadas:
                    confira antes, porque mexem também no outro programa. Clique num item para abrir o lançamento. Todos os
                    detalhes de cada excluído (valor pago, cartão, bônus...) ficam guardados no <strong>Histórico</strong>, para
                    lançar de novo no CPF certo se aparecer no extrato de outra pessoa.
                  </p>
                </div>
                <div className="flex gap-2 text-xs">
                  <button type="button" className="underline" onClick={() => setExcluir(new Set(foraDoExtrato.map((f) => f.id)))}>
                    Marcar todos
                  </button>
                  <button type="button" className="underline" onClick={() => setExcluir(new Set())}>
                    Manter todos
                  </button>
                </div>
              </div>
              <ul className="max-h-64 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
                {foraDoExtrato.map((f) => (
                  <li key={f.id} className="flex items-center gap-3 px-3 py-2">
                    <input
                      type="checkbox"
                      aria-label="Excluir"
                      checked={excluir.has(f.id)}
                      onChange={(e) =>
                        setExcluir((atual) => {
                          const novo = new Set(atual)
                          if (e.target.checked) novo.add(f.id)
                          else novo.delete(f.id)
                          return novo
                        })
                      }
                    />
                    <span className="w-24 shrink-0 text-slate-500">{formatarData(lerData(f.data))}</span>
                    <span className="flex-1">
                      <Link
                        href={f.tipo === 'ENTRADA' ? `/entradas/${f.id}` : f.tipo === 'SAIDA' ? `/saidas/${f.id}` : `/transferencias/${f.id}`}
                        target="_blank"
                        className="hover:underline"
                      >
                        {f.descricao}
                      </Link>
                      {f.outroLado && (
                        <span className="block text-xs text-amber-700">
                          Atenção: {f.outroLado}. Se ela saiu da conta de outra pessoa, abra e corrija a pessoa em vez de excluir.
                        </span>
                      )}
                    </span>
                    <span className={`font-semibold tabular-nums ${f.pontos < 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                      {f.pontos > 0 ? '+' : ''}
                      {formatarPontos(f.pontos)}
                    </span>
                    <span className={`w-20 text-right text-xs ${excluir.has(f.id) ? 'text-red-700' : 'text-slate-400'}`}>
                      {excluir.has(f.id) ? 'excluir' : 'manter'}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {diaAntes && (
            <div className="cartao space-y-2 p-4 text-sm">
              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4"
                  checked={saldoInicial.lancar}
                  onChange={(e) => setSaldoInicial((s) => ({ ...s, lancar: e.target.checked }))}
                />
                <span>
                  <strong>Acertar o saldo anterior a {formatarData(lerData(primeiraData!))}</strong> (lançado em{' '}
                  {formatarData(lerData(diaAntes))}).
                  <span className="block text-xs text-slate-500">
                    Antes do período o sistema tem {formatarPontos(conferencia.saldoAntesDoPeriodo)} pontos.
                    {saldoExtrato !== null
                      ? ' O valor sugerido faz o saldo final ficar igual ao do extrato. Positivo = pontos que já existiam; negativo = pontos que o sistema tinha a mais.'
                      : ' O saldo total não aparece nos prints: informe o saldo anterior se souber.'}
                  </span>
                </span>
              </label>
              {saldoInicial.lancar && (
                <div className="flex flex-wrap items-center gap-2 pl-6">
                  <input
                    value={saldoInicial.pontos}
                    onChange={(e) => setSaldoInicial((s) => ({ ...s, pontos: e.target.value }))}
                    placeholder="Pontos"
                    inputMode="numeric"
                    className="campo w-36 py-1 text-xs"
                  />
                  {(lerPontos(saldoInicial.pontos) ?? 0) > 0 ? (
                    <>
                      <span className="text-xs text-slate-500">pontos, que custaram</span>
                      <input
                        value={saldoInicial.valor}
                        onChange={(e) => setSaldoInicial((s) => ({ ...s, valor: e.target.value }))}
                        placeholder="R$ (opcional)"
                        inputMode="decimal"
                        className="campo w-32 py-1 text-xs"
                      />
                      {lerCentavos(saldoInicial.valor) && lerPontos(saldoInicial.pontos) ? (
                        <span className="text-xs text-slate-500">
                          CMP {formatarCmp(((lerCentavos(saldoInicial.valor) ?? 0) / (lerPontos(saldoInicial.pontos) ?? 1)) * 1000)}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-500">sem valor: entram com custo zero</span>
                      )}
                    </>
                  ) : (
                    <span className="text-xs text-slate-500">pontos de ajuste (saem do saldo anterior ao período)</span>
                  )}
                </div>
              )}
            </div>
          )}

          <Aviso>
            Confira cada linha. As que <strong>já estão lançadas</strong> no sistema vêm desmarcadas. Em compras, informe o{' '}
            <strong>valor pago</strong> (o extrato não mostra). Em transferências, confira o programa e o bônus. O sistema lembra as
            suas escolhas para a próxima importação.
          </Aviso>

          <div className="cartao overflow-x-auto">
            <table className="w-full min-w-[60rem] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2">
                    <input
                      type="checkbox"
                      aria-label="Marcar todas"
                      checked={linhas.length > 0 && linhas.every((l) => l.incluir)}
                      onChange={(e) => setLinhas((ls) => ls.map((l) => ({ ...l, incluir: e.target.checked })))}
                    />
                  </th>
                  <th className="px-3 py-2">Data</th>
                  <th className="px-3 py-2">No extrato</th>
                  <th className="px-3 py-2 text-right">Pontos</th>
                  <th className="px-3 py-2">Lançar como</th>
                  <th className="px-3 py-2">Detalhes</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l, i) => {
                  const pts = Math.abs(l.s.linha.pontos)
                  const opcoes = l.s.linha.pontos >= 0 ? ACOES_ENTRADA : ACOES_SAIDA
                  const valor = lerCentavos(l.valor)
                  const bonus = lerNumero(l.bonus) ?? 0
                  return (
                    <tr key={i} className={`border-b border-slate-100 align-top ${l.incluir ? '' : 'bg-slate-50 text-slate-400'}`}>
                      <td className="px-3 py-2">
                        <input type="checkbox" checked={l.incluir} onChange={(e) => alterar(i, { incluir: e.target.checked })} aria-label="Incluir" />
                      </td>
                      <td className="whitespace-nowrap px-3 py-2">{formatarData(lerData(l.s.linha.data))}</td>
                      <td className="px-3 py-2">
                        <span className="font-medium">{l.s.linha.descricao}</span>
                        <span className="block text-xs text-slate-500">
                          {l.s.linha.operacao}
                          {l.s.linha.observacao && ` · ${l.s.linha.observacao}`}
                        </span>
                        {l.s.jaLancado ? (
                          <span className="mt-1 inline-block rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">
                            Já lançado em {formatarData(lerData(l.s.jaLancado.data))}
                          </span>
                        ) : (
                          <span className="mt-1 block text-xs text-slate-400">Sugestão: {l.s.motivo}</span>
                        )}
                      </td>
                      <td className={`whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums ${l.s.linha.pontos < 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                        {l.s.linha.pontos > 0 ? '+' : ''}
                        {formatarPontos(l.s.linha.pontos)}
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={l.acao}
                          onChange={(e) => alterar(i, { acao: e.target.value as Acao, incluir: e.target.value !== 'IGNORAR' })}
                          className="campo py-1 text-xs"
                          disabled={!l.incluir}
                        >
                          {opcoes.map((a) => (
                            <option key={a} value={a}>
                              {ACOES[a]}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        {l.incluir && l.acao === 'COMPRA' && (
                          <div className="flex flex-wrap items-center gap-2">
                            <input
                              value={l.valor}
                              onChange={(e) => alterar(i, { valor: e.target.value })}
                              placeholder="Valor pago R$"
                              inputMode="decimal"
                              className="campo w-32 py-1 text-xs"
                            />
                            <select value={l.formaPagamento} onChange={(e) => alterar(i, { formaPagamento: e.target.value as Linha['formaPagamento'] })} className="campo w-28 py-1 text-xs">
                              {FORMAS.map((f) => (
                                <option key={f.valor} value={f.valor}>
                                  {f.texto}
                                </option>
                              ))}
                            </select>
                            <input value={l.parcelas} onChange={(e) => alterar(i, { parcelas: e.target.value })} inputMode="numeric" className="campo w-14 py-1 text-xs" aria-label="Parcelas" />
                            <span className="text-xs text-slate-500">x</span>
                            <span className="w-full text-xs text-slate-500">
                              {valor ? `CMP ${formatarCmp((valor / pts) * 1000)}` : 'Sem valor: os pontos entram com custo zero.'}
                            </span>
                          </div>
                        )}
                        {l.incluir && l.acao.startsWith('TRANSF') && (
                          <div className="flex flex-wrap items-center gap-2">
                            <select value={l.outroProgramaId} onChange={(e) => alterar(i, { outroProgramaId: e.target.value })} className="campo w-36 py-1 text-xs">
                              <option value="">{l.acao === 'TRANSF_ENVIADA' ? 'Para qual programa?' : 'De qual programa?'}</option>
                              {conferencia.programas
                                .filter((p) => p.id !== programaId)
                                .map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {p.nome}
                                  </option>
                                ))}
                            </select>
                            <input value={l.bonus} onChange={(e) => alterar(i, { bonus: e.target.value })} inputMode="decimal" className="campo w-16 py-1 text-xs" aria-label="Bônus %" />
                            <span className="text-xs text-slate-500">% bônus</span>
                            <span className="w-full text-xs text-slate-500">
                              {l.acao === 'TRANSF_ENVIADA'
                                ? `Chegam ${formatarPontos(lerPontos(l.pontosOutro) || calcularPontosDestino(pts, bonus))} pontos`
                                : `Saíram ${formatarPontos(lerPontos(l.pontosOutro) || Math.round(pts / (1 + bonus / 100)))} pontos da origem`}
                              {' · '}
                              <input
                                value={l.pontosOutro}
                                onChange={(e) => alterar(i, { pontosOutro: e.target.value })}
                                placeholder="corrigir"
                                inputMode="numeric"
                                className="w-20 border-b border-slate-300 bg-transparent text-xs outline-none"
                              />
                            </span>
                          </div>
                        )}
                        {l.incluir && l.acao === 'VENDA' && (
                          <input
                            value={l.valorVenda}
                            onChange={(e) => alterar(i, { valorVenda: e.target.value })}
                            placeholder="Valor da venda R$"
                            inputMode="decimal"
                            className="campo w-36 py-1 text-xs"
                          />
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="cartao flex flex-wrap items-center gap-3 p-4">
            <div className="flex-1 text-sm text-slate-600">
              <strong>{marcadas.length}</strong> lançamento(s) a gravar
              {excluir.size > 0 && <>, <strong>{excluir.size}</strong> a excluir</>}
              {resumoPorAcao.length > 0 && ': ' + resumoPorAcao.map(([a, n]) => `${n} ${ACOES[a].toLowerCase()}`).join(', ')}
              {comprasSemValor > 0 && <span className="block text-amber-700">{comprasSemValor} compra(s) sem valor pago.</span>}
              {transfSemPrograma > 0 && <span className="block text-red-700">{transfSemPrograma} transferência(s) sem o outro programa.</span>}
            </div>
            <button type="button" onClick={() => { setConferencia(null); setLinhas([]) }} className="btn-secundario" disabled={gravando}>
              Cancelar
            </button>
            <button type="button" onClick={gravar} className="btn-primario" disabled={gravando || (marcadas.length === 0 && excluir.size === 0 && !saldoInicial.lancar) || transfSemPrograma > 0}>
              {gravando ? 'Gravando...' : 'Gravar lançamentos'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
