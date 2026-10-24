'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { exigirUsuarioAction } from '@/lib/auth'
import { tratarErros } from '@/lib/form-dados'
import { gravarEntrada, removerEntrada } from '@/lib/lancamentos'
import type { EstadoForm } from '@/components/form'

export async function salvarEntrada(id: string | null, _e: EstadoForm, dados: FormData): Promise<EstadoForm> {
  return tratarErros(async () => {
    const r = await gravarEntrada(await exigirUsuarioAction(), id, dados)
    if ('erro' in r) return r
    revalidatePath('/', 'layout')
    redirect(dados.get('continuar') === 'sim' ? `/entradas/nova?ok=${Date.now()}` : '/entradas')
  })
}

export async function excluirEntrada(id: string, _e: EstadoForm): Promise<EstadoForm> {
  return tratarErros(async () => {
    const r = await removerEntrada(await exigirUsuarioAction(), id)
    if ('erro' in r) return r
    revalidatePath('/', 'layout')
    redirect('/entradas')
  })
}
