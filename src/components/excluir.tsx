'use client'

import { useActionState } from 'react'
import type { EstadoForm } from './form'

/** Botão de excluir com confirmação e mensagem de erro (ex.: pontos já usados). */
export function BotaoExcluir({
  acao,
  pergunta,
  texto = 'Excluir lançamento',
}: {
  acao: (estado: EstadoForm) => Promise<EstadoForm>
  pergunta: string
  texto?: string
}) {
  const [estado, executar, pendente] = useActionState(acao, null)
  return (
    <form action={executar}>
      {estado?.erro && (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{estado.erro}</div>
      )}
      <button
        type="submit"
        disabled={pendente}
        className="btn-perigo"
        onClick={(e) => {
          if (!window.confirm(pergunta)) e.preventDefault()
        }}
      >
        {pendente ? 'Aguarde...' : texto}
      </button>
    </form>
  )
}
