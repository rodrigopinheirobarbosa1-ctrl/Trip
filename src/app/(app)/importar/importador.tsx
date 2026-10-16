'use client'

import { useState, useTransition } from 'react'
import Link from '@/components/link'
import { readSheet } from 'read-excel-file/browser'
import { lerPlanilha, type DadosImportacao, type Linhas } from '@/lib/importacao/planilha'
import { formatarPontos } from '@/lib/formatos'
import { Aviso } from '@/components/ui'
import { importarDados, type ResultadoImportacao } from './actions'

const ABAS = ['Cadastros', 'Lança Entrada Ptos', 'Lança Transf Ptos', 'Lança Saída Ptos', 'Controle de Venda', 'E|S Financeiras']

export function Importador({ lancamentosExistentes }: { lancamentosExistentes: number }) {
  const [lendo, setLendo] = useState(false)
  const [erroLeitura, setErroLeitura] = useState<string | null>(null)
  const [dados, setDados] = useState<DadosImportacao | null>(null)
  const [substituir, setSubstituir] = useState(false)
  const [resultado, setResultado] = useState<ResultadoImportacao>(null)
  const [gravando, iniciar] = useTransition()

  async function lerArquivo(arquivo: File) {
    setLendo(true)
    setErroLeitura(null)
    setDados(null)
    setResultado(null)
    try {
      // Lê só as abas necessárias, uma de cada vez; a que não existir fica de fora.
      const abas = new Map<string, Linhas>()
      for (const aba of ABAS) {
        try {
          abas.set(aba, (await readSheet(arquivo, aba)) as Linhas)
        } catch {
          // aba ausente: lerPlanilha avisa
        }
      }
      if (abas.size === 0) throw new Error('nenhuma das abas esperadas foi encontrada')
      setDados(lerPlanilha((nome) => abas.get(nome) ?? null))
    } catch (e) {
      setErroLeitura(
        `Não consegui ler este arquivo (${e instanceof Error ? e.message : 'erro desconhecido'}). Confira se é a planilha de milhas em formato .xlsx.`,
      )
    } finally {
      setLendo(false)
    }
  }

  function gravar() {
    if (!dados) return
    const { avisos: _avisos, ...resto } = dados
    // As linhas de origem só servem para os avisos: não precisam ir ao servidor.
    const limpar = <T extends { linha?: number; aba?: string }>(xs: T[]) =>
      xs.map(({ linha: _l, aba: _a, ...x }) => x)
    iniciar(async () => {
      const r = await importarDados(
        {
          ...resto,
          entradas: limpar(resto.entradas),
          transferencias: limpar(resto.transferencias),
          saidas: limpar(resto.saidas),
          movimentos: limpar(resto.movimentos),
        } as Omit<DadosImportacao, 'avisos'>,
        substituir,
      )
      setResultado(r)
      if (r?.ok) setDados(null)
    })
  }

  return (
    <div className="space-y-4">
      <label className="block">
        <span className="rotulo">Arquivo da planilha (.xlsx)</span>
        <input
          type="file"
          accept=".xlsx"
          disabled={lendo || gravando}
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) lerArquivo(f)
          }}
          className="block w-full text-sm text-slate-600 file:mr-4 file:rounded-lg file:border-0 file:bg-marca-600 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-marca-700"
        />
      </label>

      {lendo && <Aviso>Lendo a planilha... arquivos grandes podem levar alguns segundos.</Aviso>}
      {erroLeitura && <Aviso tom="vermelho">{erroLeitura}</Aviso>}
      {resultado?.erro && <Aviso tom="vermelho">{resultado.erro}</Aviso>}
      {resultado?.ok && (
        <Aviso tom="verde">
          {resultado.ok}{' '}
          <Link href="/pendencias" className="font-semibold underline">
            Ver pendências
          </Link>{' '}
          ·{' '}
          <Link href="/painel" className="font-semibold underline">
            Ir para o painel
          </Link>
        </Aviso>
      )}

      {dados && (
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-slate-700">O que foi encontrado</h3>
          <dl className="grid gap-3 text-sm sm:grid-cols-4">
            {[
              ['Pessoas', dados.titulares.length],
              ['Programas', dados.programas.length],
              ['Logins (sem senhas)', dados.contas.length],
              ['Cartões', dados.cartoes.length],
              ['Entradas', dados.entradas.length],
              ['Transferências', dados.transferencias.length],
              ['Emissões e vendas', dados.saidas.length],
              ['Entradas/saídas avulsas', dados.movimentos.length],
            ].map(([rotulo, n]) => (
              <div key={rotulo} className="rounded-lg border border-slate-200 px-3 py-2">
                <dt className="text-xs text-slate-500">{rotulo}</dt>
                <dd className="text-lg font-semibold">{formatarPontos(n as number)}</dd>
              </div>
            ))}
          </dl>
          <p className="text-sm text-slate-600">Pessoas: {dados.titulares.map((t) => t.nome).join(', ')}</p>

          {dados.avisos.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-semibold text-slate-700">Avisos ({dados.avisos.length})</h3>
              <ul className="max-h-72 list-disc space-y-1 overflow-y-auto rounded-lg border border-amber-200 bg-amber-50 py-2 pl-8 pr-3 text-sm text-amber-900">
                {dados.avisos.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            </div>
          )}

          {lancamentosExistentes > 0 && (
            <label className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              <input type="checkbox" checked={substituir} onChange={(e) => setSubstituir(e.target.checked)} className="mt-0.5 h-4 w-4" />
              <span>
                O sistema já tem <strong>{lancamentosExistentes}</strong> lançamento(s). Marque para <strong>apagá-los</strong> e
                colocar os da planilha no lugar. Pessoas, programas e cartões cadastrados são mantidos.
              </span>
            </label>
          )}

          <button
            type="button"
            onClick={gravar}
            disabled={gravando || (lancamentosExistentes > 0 && !substituir)}
            className="btn-primario"
          >
            {gravando ? 'Gravando...' : 'Confirmar importação'}
          </button>
        </div>
      )}
    </div>
  )
}
