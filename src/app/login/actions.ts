'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { entrar, limparSessoesVencidas } from '@/lib/auth'
import { auditar } from '@/lib/audit'
import { limparTentativas, minutosDeBloqueio, registrarErro } from '@/lib/limite-tentativas'
import type { EstadoForm } from '@/components/form'

export async function acaoEntrar(_estado: EstadoForm, dados: FormData): Promise<EstadoForm> {
  const email = String(dados.get('email') ?? '').trim()
  const senha = String(dados.get('senha') ?? '')

  if (!email || !senha) return { erro: 'Informe o e-mail e a senha.' }

  // Trava tentativas repetidas vindas do mesmo endereço para o mesmo e-mail.
  const cabecalhos = await headers()
  const origem = cabecalhos.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local'
  const chave = `${origem}|${email.toLowerCase()}`

  const espera = minutosDeBloqueio(chave)
  if (espera > 0) {
    return { erro: `Muitas tentativas seguidas. Aguarde ${espera} minuto(s) e tente novamente.` }
  }

  const usuario = await entrar(email, senha)
  if (!usuario) {
    registrarErro(chave)
    return { erro: 'E-mail ou senha incorretos.' }
  }
  limparTentativas(chave)
  await limparSessoesVencidas()

  await auditar({ usuario, acao: 'LOGIN', entidade: 'Usuario', entidadeId: usuario.id, resumo: `${usuario.nome} entrou no sistema` })

  redirect('/painel')
}
