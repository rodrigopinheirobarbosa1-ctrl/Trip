'use server'

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { exigirAdminAction } from '@/lib/auth'
import { auditar } from '@/lib/audit'
import { tratarErros } from '@/lib/form-dados'
import { definirEdicao, desligar, gerarChave } from '@/lib/ligacao-claude'
import type { EstadoForm } from '@/components/form'

export async function gerarEndereco(_e: EstadoForm): Promise<EstadoForm> {
  return tratarErros(async () => {
    const usuario = await exigirAdminAction()
    const chave = await gerarChave()
    const h = await headers()
    const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'SEU-ENDERECO'
    const protocolo = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
    await auditar({ usuario, acao: 'ALTERAR', entidade: 'LigacaoClaude', resumo: 'Gerou um novo endereço da ligação com o Claude' })
    revalidatePath('/ligacao-claude')
    return { ok: `${protocolo}://${host}/api/mcp/${chave}` }
  })
}

export async function desligarLigacao(_e: EstadoForm): Promise<EstadoForm> {
  return tratarErros(async () => {
    const usuario = await exigirAdminAction()
    await desligar()
    await auditar({ usuario, acao: 'ALTERAR', entidade: 'LigacaoClaude', resumo: 'Desligou a ligação com o Claude' })
    revalidatePath('/ligacao-claude')
    return { ok: 'Ligação desligada. O endereço antigo não funciona mais.' }
  })
}

export async function alterarEdicao(_e: EstadoForm, dados: FormData): Promise<EstadoForm> {
  return tratarErros(async () => {
    const usuario = await exigirAdminAction()
    const permitir = dados.get('edicao') === 'on'
    await definirEdicao(permitir)
    await auditar({
      usuario,
      acao: 'ALTERAR',
      entidade: 'LigacaoClaude',
      resumo: permitir ? 'Liberou o Claude para alterar lançamentos' : 'Deixou o Claude só com leitura',
    })
    revalidatePath('/ligacao-claude')
    return { ok: permitir ? 'O Claude pode ler e alterar.' : 'O Claude agora só lê.' }
  })
}
