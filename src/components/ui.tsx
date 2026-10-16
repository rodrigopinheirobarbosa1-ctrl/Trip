import Link from 'next/link'
import type { ReactNode } from 'react'
import { formatarReais } from '@/lib/formatos'

export function Cabecalho({
  titulo,
  descricao,
  acoes,
}: {
  titulo: string
  descricao?: string
  acoes?: ReactNode
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{titulo}</h1>
        {descricao && <p className="mt-1 text-sm text-slate-500">{descricao}</p>}
      </div>
      {acoes && <div className="flex flex-wrap gap-2 nao-imprimir">{acoes}</div>}
    </div>
  )
}

export function Cartao({
  titulo,
  acao,
  children,
  className = '',
}: {
  titulo?: string
  acao?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={`cartao ${className}`}>
      {(titulo || acao) && (
        <header className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
          {titulo && <h2 className="text-sm font-semibold text-slate-700">{titulo}</h2>}
          {acao}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  )
}

export function Indicador({
  titulo,
  valorCentavos,
  texto,
  detalhe,
  tom = 'neutro',
}: {
  titulo: string
  valorCentavos?: number
  texto?: string
  detalhe?: string
  tom?: 'neutro' | 'positivo' | 'negativo' | 'auto'
}) {
  let cor = 'text-slate-900'
  if (tom === 'positivo') cor = 'text-emerald-700'
  if (tom === 'negativo') cor = 'text-red-700'
  if (tom === 'auto' && valorCentavos !== undefined)
    cor = valorCentavos < 0 ? 'text-red-700' : 'text-emerald-700'

  return (
    <div className="cartao p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{titulo}</p>
      <p className={`mt-2 text-2xl font-bold tabular-nums ${cor}`}>
        {valorCentavos !== undefined ? formatarReais(valorCentavos) : texto}
      </p>
      {detalhe && <p className="mt-1 text-xs text-slate-500">{detalhe}</p>}
    </div>
  )
}

const TONS: Record<string, string> = {
  cinza: 'bg-slate-100 text-slate-700 ring-slate-200',
  verde: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  vermelho: 'bg-red-50 text-red-700 ring-red-200',
  amarelo: 'bg-amber-50 text-amber-800 ring-amber-200',
  azul: 'bg-marca-50 text-marca-700 ring-marca-200',
  roxo: 'bg-violet-50 text-violet-700 ring-violet-200',
}

export function Etiqueta({
  children,
  tom = 'cinza',
}: {
  children: ReactNode
  tom?: keyof typeof TONS
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${TONS[tom]}`}
    >
      {children}
    </span>
  )
}

export function Tabela({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`overflow-x-auto ${className}`}>
      <table className="w-full min-w-full text-sm">{children}</table>
    </div>
  )
}

export function Th({ children, alinhar = 'esquerda' }: { children?: ReactNode; alinhar?: 'esquerda' | 'direita' | 'centro' }) {
  const a = alinhar === 'direita' ? 'text-right' : alinhar === 'centro' ? 'text-center' : 'text-left'
  return (
    <th className={`whitespace-nowrap border-b border-slate-200 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500 ${a}`}>
      {children}
    </th>
  )
}

export function Td({
  children,
  alinhar = 'esquerda',
  className = '',
}: {
  children?: ReactNode
  alinhar?: 'esquerda' | 'direita' | 'centro'
  className?: string
}) {
  const a = alinhar === 'direita' ? 'whitespace-nowrap text-right tabular-nums' : alinhar === 'centro' ? 'text-center' : 'text-left'
  return <td className={`border-b border-slate-100 px-3 py-2 align-top ${a} ${className}`}>{children}</td>
}

export function Vazio({ texto, acao }: { texto: string; acao?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
      <p className="text-sm text-slate-500">{texto}</p>
      {acao}
    </div>
  )
}

export function Campo({
  rotulo: textoRotulo,
  children,
  dica,
  className = '',
}: {
  rotulo: string
  children: ReactNode
  dica?: string
  className?: string
}) {
  return (
    <label className={`block ${className}`}>
      <span className="rotulo">{textoRotulo}</span>
      {children}
      {dica && <span className="mt-1 block text-xs text-slate-400">{dica}</span>}
    </label>
  )
}

export function Aviso({ children, tom = 'azul' }: { children: ReactNode; tom?: 'azul' | 'amarelo' | 'vermelho' | 'verde' }) {
  const cores = {
    azul: 'border-marca-200 bg-marca-50 text-marca-800',
    amarelo: 'border-amber-200 bg-amber-50 text-amber-800',
    vermelho: 'border-red-200 bg-red-50 text-red-800',
    verde: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  }
  return <div className={`rounded-lg border px-4 py-3 text-sm ${cores[tom]}`}>{children}</div>
}

export function LinkBotao({
  href,
  children,
  variante = 'secundario',
}: {
  href: string
  children: ReactNode
  variante?: 'primario' | 'secundario' | 'perigo'
}) {
  return (
    <Link href={href} className={`btn-${variante}`}>
      {children}
    </Link>
  )
}

export function Dinheiro({ centavos, colorir = false }: { centavos: number; colorir?: boolean }) {
  const cor = !colorir ? '' : centavos < 0 ? 'text-red-700' : centavos > 0 ? 'text-emerald-700' : 'text-slate-500'
  return <span className={`tabular-nums ${cor}`}>{formatarReais(centavos)}</span>
}
