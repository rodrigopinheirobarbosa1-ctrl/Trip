'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { exigirUsuarioAction } from '@/lib/auth'
import { tratarErros } from '@/lib/form-dados'
import { gravarTransferencia, removerTransferencia } from '@/lib/lancamentos'
import type { EstadoForm } from '@/components/form'

export async function salvarTransferencia(id: string | null, _e: EstadoForm, dados: FormData): Promise<EstadoForm> {
  return tratarErros(async () => {
    const r = await gravarTransferencia(await exigirUsuarioAction(), id, dados)
    if ('erro' in r) return r
    revalidatePath('/', 'layout')
    redirect(dados.get('continuar') === 'sim' ? `/transferencias/nova?ok=${Date.now()}` : '/transferencias')
  })
}

export async function excluirTransferencia(id: string, _e: EstadoForm): Promise<EstadoForm> {
  return tratarErros(async () => {
    const r = await removerTransferencia(await exigirUsuarioAction(), id)
    if ('erro' in r) return r
    revalidatePath('/', 'layout')
    redirect('/transferencias')
  })
}
