// Leitura dos campos enviados pelos formulários (FormData).
import { unstable_rethrow } from 'next/navigation'
import { lerCentavos, lerData, lerNumero, lerPontos } from './formatos'

export class ErroFormulario extends Error {}

export function textoOpcional(dados: FormData, nome: string): string | null {
  const v = dados.get(nome)
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t === '' ? null : t
}

export function textoObrigatorio(dados: FormData, nome: string, rotulo: string): string {
  const t = textoOpcional(dados, nome)
  if (!t) throw new ErroFormulario(`Preencha o campo "${rotulo}".`)
  return t
}

export function dataObrigatoria(dados: FormData, nome: string, rotulo: string): Date {
  const d = lerData(textoOpcional(dados, nome))
  if (!d) throw new ErroFormulario(`Informe uma data válida em "${rotulo}".`)
  return d
}

export function dataOpcional(dados: FormData, nome: string, rotulo: string): Date | null {
  const t = textoOpcional(dados, nome)
  if (!t) return null
  const d = lerData(t)
  if (!d) throw new ErroFormulario(`Data inválida em "${rotulo}".`)
  return d
}

export function pontosObrigatorio(dados: FormData, nome: string, rotulo: string, permitirNegativo = false): number {
  const p = lerPontos(textoOpcional(dados, nome))
  if (p === null) throw new ErroFormulario(`Informe a quantidade em "${rotulo}".`)
  if (p === 0) throw new ErroFormulario(`A quantidade em "${rotulo}" não pode ser zero.`)
  if (p < 0 && !permitirNegativo) throw new ErroFormulario(`A quantidade em "${rotulo}" não pode ser negativa.`)
  return p
}

export function centavosOpcional(dados: FormData, nome: string, rotulo: string): number {
  const t = textoOpcional(dados, nome)
  if (!t) return 0
  const c = lerCentavos(t)
  if (c === null) throw new ErroFormulario(`Valor inválido em "${rotulo}". Use, por exemplo, 1.234,56.`)
  if (c < 0) throw new ErroFormulario(`O valor em "${rotulo}" não pode ser negativo.`)
  return c
}

export function numeroOpcional(dados: FormData, nome: string, rotulo: string): number | null {
  const t = textoOpcional(dados, nome)
  if (!t) return null
  const n = lerNumero(t)
  if (n === null) throw new ErroFormulario(`Número inválido em "${rotulo}".`)
  return n
}

export function inteiroEntre(dados: FormData, nome: string, rotulo: string, min: number, max: number, padrao: number): number {
  const n = numeroOpcional(dados, nome, rotulo)
  if (n === null) return padrao
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new ErroFormulario(`"${rotulo}" deve ser um número inteiro de ${min} a ${max}.`)
  }
  return n
}

export function opcao<T extends string>(dados: FormData, nome: string, rotulo: string, validas: readonly T[]): T {
  const v = textoOpcional(dados, nome)
  if (!v || !(validas as readonly string[]).includes(v)) throw new ErroFormulario(`Escolha uma opção em "${rotulo}".`)
  return v as T
}

/**
 * Executa uma action de formulário e transforma erros em mensagem para a tela.
 * Erros inesperados aparecem de forma genérica (o detalhe vai para o log).
 */
export async function tratarErros(fn: () => Promise<{ erro?: string; ok?: string } | void>) {
  try {
    return (await fn()) ?? null
  } catch (e) {
    // redirect() do Next funciona lançando um erro especial: deixa passar.
    unstable_rethrow(e)
    if (e instanceof ErroFormulario) return { erro: e.message }
    if (e instanceof Error && e.message.startsWith('Sessão expirada')) return { erro: e.message }
    if (e instanceof Error && e.message.startsWith('Seu perfil')) return { erro: e.message }
    if (e && typeof e === 'object' && 'code' in e && (e as { code: string }).code === 'P2002') {
      return { erro: 'Já existe um cadastro com esse nome.' }
    }
    console.error(e)
    return { erro: 'Não foi possível salvar. Tente novamente; se continuar, avise o administrador.' }
  }
}
