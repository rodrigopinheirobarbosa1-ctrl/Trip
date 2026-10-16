// Campos de formulário reaproveitados em várias telas.
import type { ReactNode } from 'react'
import { Campo } from './ui'

type Opcao = { valor: string; texto: string }

export function Selecao({
  rotulo,
  nome,
  opcoes,
  valor,
  vazio,
  obrigatorio = false,
  dica,
  className = '',
}: {
  rotulo: string
  nome: string
  opcoes: Opcao[]
  valor?: string | null
  /** Texto da opção vazia (ex.: "Selecione"). Sem ele não há opção vazia. */
  vazio?: string
  obrigatorio?: boolean
  dica?: string
  className?: string
}) {
  return (
    <Campo rotulo={rotulo} dica={dica} className={className}>
      <select name={nome} defaultValue={valor ?? ''} required={obrigatorio} className="campo">
        {vazio !== undefined && <option value="">{vazio}</option>}
        {opcoes.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.texto}
          </option>
        ))}
      </select>
    </Campo>
  )
}

export function Texto({
  rotulo,
  nome,
  valor,
  obrigatorio = false,
  dica,
  placeholder,
  tipo = 'text',
  modo,
  className = '',
  maximo,
}: {
  rotulo: string
  nome: string
  valor?: string | number | null
  obrigatorio?: boolean
  dica?: ReactNode & string
  placeholder?: string
  tipo?: 'text' | 'date' | 'email' | 'password' | 'number'
  /** Teclado no celular: "decimal" para valores, "numeric" para pontos. */
  modo?: 'decimal' | 'numeric' | 'text'
  className?: string
  maximo?: number
}) {
  return (
    <Campo rotulo={rotulo} dica={dica} className={className}>
      <input
        type={tipo}
        name={nome}
        defaultValue={valor ?? ''}
        required={obrigatorio}
        placeholder={placeholder}
        inputMode={modo}
        maxLength={maximo}
        className="campo"
      />
    </Campo>
  )
}

export function AreaTexto({ rotulo, nome, valor }: { rotulo: string; nome: string; valor?: string | null }) {
  return (
    <Campo rotulo={rotulo}>
      <textarea name={nome} defaultValue={valor ?? ''} rows={2} className="campo" />
    </Campo>
  )
}

export function Caixa({ rotulo, nome, marcado }: { rotulo: string; nome: string; marcado?: boolean }) {
  return (
    <label className="flex items-center gap-2 text-sm text-slate-700">
      <input type="checkbox" name={nome} defaultChecked={marcado} className="h-4 w-4 rounded border-slate-300" />
      {rotulo}
    </label>
  )
}
