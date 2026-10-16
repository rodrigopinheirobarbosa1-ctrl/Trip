import { formatarCmp, formatarPontos } from '@/lib/formatos'

export type SaldosForm = Record<string, { pontos: number; cmp: number | null; lotes: [number, number][] }>

/** Linha de ajuda "Saldo hoje: 200.000 pontos em 2 lotes · CMP médio R$ 28,15". */
export function SaldoDisponivel({ saldos, titularId, programaId }: { saldos: SaldosForm; titularId: string; programaId: string }) {
  if (!titularId || !programaId) return null
  const s = saldos[`${titularId}|${programaId}`]
  const pontos = s?.pontos ?? 0
  const lotes = s?.lotes.length ?? 0
  return (
    <p className={`text-xs ${pontos < 0 ? 'text-red-700' : 'text-slate-500'}`}>
      Saldo hoje: <strong>{formatarPontos(pontos)}</strong> pontos
      {lotes > 1 && ` em ${lotes} lotes`}
      {s?.cmp !== null && s?.cmp !== undefined && <> · CMP médio {formatarCmp(s.cmp)}</>}
    </p>
  )
}
