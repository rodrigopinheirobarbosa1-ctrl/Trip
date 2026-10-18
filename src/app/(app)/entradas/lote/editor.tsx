'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from '@/components/link'
import { Aviso } from '@/components/ui'
import { centavosParaCampo, formatarCmp, formatarPontos, lerCentavos } from '@/lib/formatos'
import { salvarLote, type ItemLote } from './actions'

export type LinhaLote = {
  id: string
  data: string
  pessoa: string
  programa: string
  pontos: number
  observacao: string | null
  categoria: ItemLote['categoria']
  valor: number
  formaPagamento: ItemLote['formaPagamento']
  parcelas: number
  cartaoId: string | null
}

const CATEGORIAS: { valor: ItemLote['categoria']; texto: string }[] = [
  { valor: 'COMPRA', texto: 'Compra' },
  { valor: 'ACUMULO', texto: 'Acúmulo (cartão, voo)' },
  { valor: 'PARCEIRO', texto: 'Parceiro (custo atribuído)' },
  { valor: 'BONUS', texto: 'Bônus do programa' },
  { valor: 'SALDO_INICIAL', texto: 'Saldo inicial' },
]
const FORMAS: { valor: ItemLote['formaPagamento']; texto: string }[] = [
  { valor: 'CARTAO', texto: 'Cartão' },
  { valor: 'PIX', texto: 'PIX' },
  { valor: 'BOLETO', texto: 'Boleto' },
  { valor: 'DINHEIRO', texto: 'Dinheiro' },
  { valor: 'OUTRO', texto: 'Outro' },
]
/** Pagamento só existe quando há valor e a categoria sai do caixa. */
const temPagamento = (categoria: string, valor: number) => valor > 0 && categoria !== 'PARCEIRO' && categoria !== 'SALDO_INICIAL'

type Edicao = { categoria: ItemLote['categoria']; valor: string; formaPagamento: ItemLote['formaPagamento']; parcelas: string; cartaoId: string }

export function EditorLote({ linhas, cartoes }: { linhas: LinhaLote[]; cartoes: { id: string; nome: string }[] }) {
  const inicial = useMemo(
    () =>
      Object.fromEntries(
        linhas.map((l) => [
          l.id,
          {
            categoria: l.categoria,
            valor: l.valor ? centavosParaCampo(l.valor) : '',
            formaPagamento: l.formaPagamento === 'SEM_DESEMBOLSO' ? 'CARTAO' : l.formaPagamento,
            parcelas: String(l.parcelas),
            cartaoId: l.cartaoId ?? '',
          } satisfies Edicao,
        ]),
      ) as Record<string, Edicao>,
    [linhas],
  )
  const [ed, setEd] = useState(inicial)
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set())
  const [todos, setTodos] = useState<Edicao>({ categoria: 'COMPRA', valor: '', formaPagamento: 'CARTAO', parcelas: '1', cartaoId: '' })
  const [aplicar, setAplicar] = useState({ categoria: false, valor: true, pagamento: true })
  const [resultado, setResultado] = useState<{ erro?: string; ok?: string } | null>(null)
  const [salvando, iniciar] = useTransition()
  const router = useRouter()

  const alterar = (id: string, m: Partial<Edicao>) => setEd((x) => ({ ...x, [id]: { ...x[id], ...m } }))
  const mudou = (l: LinhaLote) => JSON.stringify(ed[l.id]) !== JSON.stringify(inicial[l.id])
  const alteradas = linhas.filter(mudou)

  function aplicarNasMarcadas() {
    setEd((x) => {
      const n = { ...x }
      for (const id of marcadas) {
        n[id] = {
          ...n[id],
          ...(aplicar.categoria ? { categoria: todos.categoria } : {}),
          ...(aplicar.valor ? { valor: todos.valor } : {}),
          ...(aplicar.pagamento ? { formaPagamento: todos.formaPagamento, parcelas: todos.parcelas, cartaoId: todos.cartaoId } : {}),
        }
      }
      return n
    })
  }

  function salvar() {
    const itens: ItemLote[] = alteradas.map((l) => {
      const e = ed[l.id]
      return {
        id: l.id,
        categoria: e.categoria,
        valor: lerCentavos(e.valor) ?? 0,
        formaPagamento: e.formaPagamento,
        parcelas: Math.min(48, Math.max(1, Number(e.parcelas) || 1)),
        cartaoId: e.cartaoId || null,
      }
    })
    iniciar(async () => {
      const r = await salvarLote(itens)
      setResultado(r)
      if (r.ok) {
        setMarcadas(new Set())
        // Busca de novo: com "Só sem valor", as que receberam valor saem da lista.
        router.refresh()
      }
    })
  }

  if (linhas.length === 0) return <Aviso>Nenhuma entrada com estes filtros.</Aviso>

  const selecaoCartao = (valor: string, mudar: (v: string) => void) => (
    <select value={valor} onChange={(e) => mudar(e.target.value)} className="campo w-32 py-1 text-xs">
      <option value="">Cartão?</option>
      {cartoes.map((c) => (
        <option key={c.id} value={c.id}>
          {c.nome}
        </option>
      ))}
    </select>
  )

  return (
    <div className="space-y-4">
      {resultado?.erro && <Aviso tom="vermelho">{resultado.erro}</Aviso>}
      {resultado?.ok && <Aviso tom="verde">{resultado.ok}</Aviso>}

      <div className="cartao space-y-3 p-4 text-sm">
        <p className="font-semibold">Preencher as marcadas ({marcadas.size})</p>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={aplicar.categoria} onChange={(e) => setAplicar((a) => ({ ...a, categoria: e.target.checked }))} />
            Tipo
          </label>
          <select value={todos.categoria} onChange={(e) => setTodos((t) => ({ ...t, categoria: e.target.value as Edicao['categoria'] }))} className="campo w-48 py-1 text-xs">
            {CATEGORIAS.map((c) => (
              <option key={c.valor} value={c.valor}>
                {c.texto}
              </option>
            ))}
          </select>
          <label className="ml-2 flex items-center gap-1">
            <input type="checkbox" checked={aplicar.valor} onChange={(e) => setAplicar((a) => ({ ...a, valor: e.target.checked }))} />
            Valor R$
          </label>
          <input value={todos.valor} onChange={(e) => setTodos((t) => ({ ...t, valor: e.target.value }))} inputMode="decimal" placeholder="759,91" className="campo w-28 py-1 text-xs" />
          <label className="ml-2 flex items-center gap-1">
            <input type="checkbox" checked={aplicar.pagamento} onChange={(e) => setAplicar((a) => ({ ...a, pagamento: e.target.checked }))} />
            Pagamento
          </label>
          <select value={todos.formaPagamento} onChange={(e) => setTodos((t) => ({ ...t, formaPagamento: e.target.value as Edicao['formaPagamento'] }))} className="campo w-28 py-1 text-xs">
            {FORMAS.map((f) => (
              <option key={f.valor} value={f.valor}>
                {f.texto}
              </option>
            ))}
          </select>
          <input value={todos.parcelas} onChange={(e) => setTodos((t) => ({ ...t, parcelas: e.target.value }))} inputMode="numeric" className="campo w-14 py-1 text-xs" aria-label="Parcelas" />
          <span className="text-xs text-slate-500">x</span>
          {selecaoCartao(todos.cartaoId, (v) => setTodos((t) => ({ ...t, cartaoId: v })))}
          <button type="button" onClick={aplicarNasMarcadas} disabled={marcadas.size === 0} className="btn-secundario px-3 py-1 text-xs">
            Aplicar nas marcadas
          </button>
        </div>
        <p className="text-xs text-slate-500">
          Marque as linhas, preencha acima e clique em &quot;Aplicar nas marcadas&quot;. Também dá para editar linha por linha. Nada é
          gravado até clicar em &quot;Salvar alterações&quot;. Os pontos não mudam, então o saldo também não.
        </p>
      </div>

      <div className="cartao overflow-x-auto">
        <table className="w-full min-w-[60rem] text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <th className="px-3 py-2">
                <input
                  type="checkbox"
                  aria-label="Marcar todas"
                  checked={marcadas.size === linhas.length}
                  onChange={(e) => setMarcadas(new Set(e.target.checked ? linhas.map((l) => l.id) : []))}
                />
              </th>
              <th className="px-3 py-2">Data</th>
              <th className="px-3 py-2">Pessoa · Programa</th>
              <th className="px-3 py-2">Observação</th>
              <th className="px-3 py-2 text-right">Pontos</th>
              <th className="px-3 py-2">Tipo</th>
              <th className="px-3 py-2">Valor R$</th>
              <th className="px-3 py-2">Pagamento</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => {
              const e = ed[l.id]
              const v = lerCentavos(e.valor) ?? 0
              return (
                <tr key={l.id} className={`border-b border-slate-100 align-top ${mudou(l) ? 'bg-amber-50' : ''}`}>
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={marcadas.has(l.id)}
                      onChange={(x) =>
                        setMarcadas((m) => {
                          const n = new Set(m)
                          if (x.target.checked) n.add(l.id)
                          else n.delete(l.id)
                          return n
                        })
                      }
                    />
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">
                    <Link href={`/entradas/${l.id}`} className="text-marca-700 hover:underline">
                      {l.data}
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    {l.pessoa} · {l.programa}
                  </td>
                  <td className="max-w-[16rem] truncate px-3 py-2 text-slate-500" title={l.observacao ?? ''}>
                    {l.observacao}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatarPontos(l.pontos)}</td>
                  <td className="px-3 py-2">
                    <select value={e.categoria} onChange={(x) => alterar(l.id, { categoria: x.target.value as Edicao['categoria'] })} className="campo w-44 py-1 text-xs">
                      {CATEGORIAS.map((c) => (
                        <option key={c.valor} value={c.valor}>
                          {c.texto}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <input value={e.valor} onChange={(x) => alterar(l.id, { valor: x.target.value })} inputMode="decimal" placeholder="0,00" className="campo w-24 py-1 text-xs" />
                    {v > 0 && l.pontos > 0 && <span className="block text-xs text-slate-400">{formatarCmp((v / l.pontos) * 1000)} o milheiro</span>}
                  </td>
                  <td className="px-3 py-2">
                    {temPagamento(e.categoria, v) ? (
                      <div className="flex flex-wrap items-center gap-1">
                        <select value={e.formaPagamento} onChange={(x) => alterar(l.id, { formaPagamento: x.target.value as Edicao['formaPagamento'] })} className="campo w-24 py-1 text-xs">
                          {FORMAS.map((f) => (
                            <option key={f.valor} value={f.valor}>
                              {f.texto}
                            </option>
                          ))}
                        </select>
                        <input value={e.parcelas} onChange={(x) => alterar(l.id, { parcelas: x.target.value })} inputMode="numeric" className="campo w-12 py-1 text-xs" aria-label="Parcelas" />
                        <span className="text-xs text-slate-500">x</span>
                        {e.formaPagamento === 'CARTAO' && selecaoCartao(e.cartaoId, (c) => alterar(l.id, { cartaoId: c }))}
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400">sem desembolso</span>
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
          <strong>{alteradas.length}</strong> entrada(s) alterada(s) (em amarelo)
        </div>
        <button type="button" onClick={() => setEd(inicial)} disabled={salvando || alteradas.length === 0} className="btn-secundario">
          Desfazer
        </button>
        <button type="button" onClick={salvar} disabled={salvando || alteradas.length === 0} className="btn-primario">
          {salvando ? 'Salvando...' : 'Salvar alterações'}
        </button>
      </div>
    </div>
  )
}
