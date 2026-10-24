'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { exigirUsuarioAction } from '@/lib/auth'
import { tratarErros } from '@/lib/form-dados'
import { gravarSaida, removerSaida } from '@/lib/lancamentos'
import type { EstadoForm } from '@/components/form'

export async function salvarSaida(id: string | null, _e: EstadoForm, dados: FormData): Promise<EstadoForm> {
  return tratarErros(async () => {
    const r = await gravarSaida(await exigirUsuarioAction(), id, dados)
    if ('erro' in r) return r
    revalidatePath('/', 'layout')
    redirect(dados.get('continuar') === 'sim' ? `/saidas/nova?ok=${Date.now()}` : '/saidas')
  })
}

export async function excluirSaida(id: string, _e: EstadoForm): Promise<EstadoForm> {
  return tratarErros(async () => {
    const r = await removerSaida(await exigirUsuarioAction(), id)
    if ('erro' in r) return r
    revalidatePath('/', 'layout')
    redirect('/saidas')
  })
}
