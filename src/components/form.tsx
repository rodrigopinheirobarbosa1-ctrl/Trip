'use client'

import { createContext, startTransition, useActionState, useContext, useEffect, useRef, type ReactNode } from 'react'
import { useFormStatus } from 'react-dom'

// "Enviando?" do Formulario abaixo, para os botões saberem quando esperar.
const EnviandoContexto = createContext(false)

export type EstadoForm = { erro?: string; ok?: string } | null

/**
 * Formulario ligado a uma server action. Mostra a mensagem de erro devolvida
 * pela action sem perder o que o usuario ja havia digitado.
 *
 * O envio passa pelo onSubmit (e não direto pelo action do <form>) de
 * propósito: o React limpa os campos depois de uma action de formulário, e
 * com isso um erro de validação apagaria tudo o que a pessoa digitou.
 */
export function Formulario({
  action,
  children,
  className = '',
  limparAoSalvar = false,
}: {
  action: (estado: EstadoForm, dados: FormData) => Promise<EstadoForm>
  children: ReactNode
  className?: string
  /** Esvazia os campos depois de salvar com sucesso (formulários de "novo"). */
  limparAoSalvar?: boolean
}) {
  const [estado, executar, enviando] = useActionState(action, null)
  const formulario = useRef<HTMLFormElement>(null)
  useEffect(() => {
    if (estado?.ok && limparAoSalvar) formulario.current?.reset()
  }, [estado, limparAoSalvar])
  return (
    <form
      ref={formulario}
      className={className}
      onSubmit={(e) => {
        e.preventDefault()
        // Inclui o botão clicado (ex.: "Salvar e lançar outra").
        const dados = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter)
        startTransition(() => executar(dados))
      }}
    >
      <EnviandoContexto.Provider value={enviando}>
      {estado?.erro && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {estado.erro}
        </div>
      )}
      {estado?.ok && (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {estado.ok}
        </div>
      )}
      {children}
      </EnviandoContexto.Provider>
    </form>
  )
}

export function BotaoEnviar({
  children = 'Salvar',
  variante = 'primario',
  confirmar,
}: {
  children?: ReactNode
  variante?: 'primario' | 'secundario' | 'perigo'
  confirmar?: string
}) {
  const { pending: pendenteForm } = useFormStatus()
  const pending = useContext(EnviandoContexto) || pendenteForm
  return (
    <button
      type="submit"
      disabled={pending}
      className={`btn-${variante}`}
      onClick={(e) => {
        if (confirmar && !window.confirm(confirmar)) e.preventDefault()
      }}
    >
      {pending ? 'Aguarde...' : children}
    </button>
  )
}

/** Botao simples dentro de formularios de acao rapida (conciliar, conferir...). */
export function BotaoAcao({
  children,
  variante = 'secundario',
  confirmar,
  className = '',
}: {
  children: ReactNode
  variante?: 'primario' | 'secundario' | 'perigo'
  confirmar?: string
  className?: string
}) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className={`${className} inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-medium transition disabled:opacity-50 ${
        variante === 'primario'
          ? 'border-marca-600 bg-marca-600 text-white hover:bg-marca-700'
          : variante === 'perigo'
            ? 'border-red-300 bg-white text-red-700 hover:bg-red-50'
            : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
      }`}
      onClick={(e) => {
        if (confirmar && !window.confirm(confirmar)) e.preventDefault()
      }}
    >
      {pending ? '...' : children}
    </button>
  )
}

/** Aplica os filtros da tela assim que o usuario muda um campo. */
export function FiltrosAutomaticos({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <form
      className={className}
      onChange={(e) => {
        const form = e.currentTarget
        // Campos de texto so' disparam ao sair do campo / pressionar Enter.
        const alvo = e.target as unknown as HTMLInputElement
        if (alvo.type === 'text' || alvo.type === 'search') return
        form.requestSubmit()
      }}
    >
      {children}
    </form>
  )
}
