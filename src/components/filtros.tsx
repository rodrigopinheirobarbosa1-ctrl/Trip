import { FiltrosAutomaticos } from './form'
import type { Filtros } from '@/lib/filtros'

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

/** Barra de filtros: aplica assim que a pessoa troca uma opção. */
export function BarraFiltros({
  filtros,
  titulares,
  programas,
  anos,
  mostrarMes = true,
  mostrarPrograma = true,
  permitirTodosAnos = true,
}: {
  filtros: Filtros
  titulares: { id: string; nome: string }[]
  programas?: { id: string; nome: string }[]
  anos: number[]
  mostrarMes?: boolean
  mostrarPrograma?: boolean
  permitirTodosAnos?: boolean
}) {
  return (
    <FiltrosAutomaticos className="cartao mb-4 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4 nao-imprimir">
      <label className="block">
        <span className="rotulo">Pessoa</span>
        <select name="titular" defaultValue={filtros.titular ?? ''} className="campo">
          <option value="">Todas</option>
          {titulares.map((t) => (
            <option key={t.id} value={t.id}>
              {t.nome}
            </option>
          ))}
        </select>
      </label>
      {mostrarPrograma && programas && (
        <label className="block">
          <span className="rotulo">Programa</span>
          <select name="programa" defaultValue={filtros.programa ?? ''} className="campo">
            <option value="">Todos</option>
            {programas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="block">
        <span className="rotulo">Ano</span>
        <select name="ano" defaultValue={filtros.ano ? String(filtros.ano) : 'todos'} className="campo">
          {permitirTodosAnos && <option value="todos">Todos</option>}
          {anos.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </label>
      {mostrarMes && (
        <label className="block">
          <span className="rotulo">Mês</span>
          <select name="mes" defaultValue={filtros.mes ? String(filtros.mes) : ''} className="campo">
            <option value="">Todos</option>
            {MESES.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
        </label>
      )}
    </FiltrosAutomaticos>
  )
}
