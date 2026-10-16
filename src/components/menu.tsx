'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'

type Item = { href: string; texto: string; soAdmin?: boolean }
type Grupo = { titulo: string; itens: Item[] }

const GRUPOS: Grupo[] = [
  { titulo: '', itens: [{ href: '/painel', texto: 'Painel' }] },
  {
    titulo: 'Pontos',
    itens: [
      { href: '/entradas', texto: 'Entradas' },
      { href: '/transferencias', texto: 'Transferências' },
      { href: '/saidas', texto: 'Emissões e vendas' },
      { href: '/lotes', texto: 'Lotes' },
      { href: '/extrato', texto: 'Extrato' },
    ],
  },
  {
    titulo: 'Dinheiro',
    itens: [
      { href: '/fluxo-de-caixa', texto: 'Fluxo de caixa' },
      { href: '/financeiro', texto: 'Entradas e saídas avulsas' },
    ],
  },
  {
    titulo: 'Cadastros',
    itens: [
      { href: '/titulares', texto: 'Pessoas (CPFs)' },
      { href: '/programas', texto: 'Programas' },
      { href: '/cartoes', texto: 'Cartões' },
    ],
  },
  {
    titulo: '',
    itens: [
      { href: '/pendencias', texto: 'Pendências' },
      { href: '/usuarios', texto: 'Usuários', soAdmin: true },
      { href: '/importar', texto: 'Importar planilha', soAdmin: true },
      { href: '/auditoria', texto: 'Histórico', soAdmin: true },
      { href: '/minha-senha', texto: 'Minha senha' },
    ],
  },
]

export function Menu({
  usuario,
  pendencias = 0,
}: {
  usuario: { nome: string; email: string; papel: 'ADMIN' | 'OPERADOR' }
  pendencias?: number
}) {
  const caminho = usePathname()
  const [aberto, setAberto] = useState(false)
  const admin = usuario.papel === 'ADMIN'

  const ativo = (href: string) => caminho === href || caminho.startsWith(href + '/')

  const listagem = (
    <nav className="flex flex-col gap-5">
      {GRUPOS.map((grupo, i) => {
        const itens = grupo.itens.filter((it) => admin || !it.soAdmin)
        if (itens.length === 0) return null
        return (
          <div key={i}>
            {grupo.titulo && (
              <p className="mb-1 px-3 text-xs font-semibold uppercase tracking-wider text-slate-400">{grupo.titulo}</p>
            )}
            <ul className="space-y-0.5">
              {itens.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setAberto(false)}
                    className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm transition ${
                      ativo(item.href) ? 'bg-marca-600 font-semibold text-white' : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {item.texto}
                    {item.href === '/pendencias' && pendencias > 0 && (
                      <span
                        className={`ml-2 rounded-full px-2 py-0.5 text-xs font-semibold ${
                          ativo(item.href) ? 'bg-white text-marca-700' : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {pendencias}
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )
      })}
    </nav>
  )

  return (
    <>
      {/* Barra superior no celular */}
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 lg:hidden nao-imprimir">
        <Link href="/painel" className="text-lg font-bold tracking-tight text-marca-700">
          TRIP
        </Link>
        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700"
          aria-expanded={aberto}
        >
          {aberto ? 'Fechar' : 'Menu'}
        </button>
      </div>

      {aberto && (
        <div className="border-b border-slate-200 bg-white px-4 py-4 lg:hidden nao-imprimir">
          {listagem}
          <FormSair className="mt-4" />
        </div>
      )}

      {/* Menu lateral no computador */}
      <aside className="hidden w-60 shrink-0 border-r border-slate-200 bg-white lg:flex lg:flex-col nao-imprimir">
        <div className="border-b border-slate-200 px-5 py-5">
          <Link href="/painel" className="block text-xl font-bold tracking-tight text-marca-700">
            TRIP
          </Link>
          <p className="mt-1 text-xs text-slate-400">Controle de milhas e pontos</p>
        </div>
        <div className="flex-1 overflow-y-auto px-2 py-4">{listagem}</div>
        <div className="border-t border-slate-200 px-4 py-3">
          <p className="truncate text-sm font-medium text-slate-700">{usuario.nome}</p>
          <p className="truncate text-xs text-slate-400">{admin ? 'Administrador' : 'Operador'}</p>
          <FormSair className="mt-2" />
        </div>
      </aside>
    </>
  )
}

function FormSair({ className = '' }: { className?: string }) {
  return (
    <form action="/api/sair" method="post" className={className}>
      <button type="submit" className="text-xs font-medium text-slate-500 underline hover:text-slate-700">
        Sair do sistema
      </button>
    </form>
  )
}
