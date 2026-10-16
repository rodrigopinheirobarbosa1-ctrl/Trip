// Filtros das listas de lançamentos, lidos do endereço da página (?titular=...&ano=2026).

export type Filtros = {
  titular: string | null
  programa: string | null
  ano: number | null
  mes: number | null
}

type Busca = Record<string, string | string[] | undefined>

const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || null

export function lerFiltros(busca: Busca, anoPadrao: number | null): Filtros {
  const ano = Number(um(busca.ano))
  const mes = Number(um(busca.mes))
  return {
    titular: um(busca.titular),
    programa: um(busca.programa),
    // "todos" mostra todos os anos.
    ano: um(busca.ano) === 'todos' ? null : Number.isInteger(ano) && ano > 2000 ? ano : anoPadrao,
    mes: Number.isInteger(mes) && mes >= 1 && mes <= 12 ? mes : null,
  }
}

/** Intervalo de datas do filtro de ano/mês, para usar no "where" do banco. */
export function intervaloDatas(f: Filtros): { gte: Date; lt: Date } | undefined {
  if (!f.ano) return undefined
  if (f.mes) return { gte: new Date(Date.UTC(f.ano, f.mes - 1, 1)), lt: new Date(Date.UTC(f.ano, f.mes, 1)) }
  return { gte: new Date(Date.UTC(f.ano, 0, 1)), lt: new Date(Date.UTC(f.ano + 1, 0, 1)) }
}
