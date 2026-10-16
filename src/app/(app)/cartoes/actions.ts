'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { exigirUsuarioAction } from '@/lib/auth'
import { auditar } from '@/lib/audit'
import { textoObrigatorio, textoOpcional, tratarErros } from '@/lib/form-dados'
import type { EstadoForm } from '@/components/form'

export async function criarCartao(_e: EstadoForm, dados: FormData): Promise<EstadoForm> {
  return tratarErros(async () => {
    const usuario = await exigirUsuarioAction()
    const c = await db.cartao.create({
      data: { nome: textoObrigatorio(dados, 'nome', 'Nome'), final: textoOpcional(dados, 'final') },
    })
    await auditar({ usuario, acao: 'CRIAR', entidade: 'Cartao', entidadeId: c.id, resumo: `Cadastrou o cartão ${c.nome}` })
    revalidatePath('/cartoes')
    return { ok: `Cartão ${c.nome} cadastrado.` }
  })
}

export async function alternarCartao(id: string): Promise<void> {
  const usuario = await exigirUsuarioAction()
  const atual = await db.cartao.findUniqueOrThrow({ where: { id } })
  const c = await db.cartao.update({ where: { id }, data: { ativo: !atual.ativo } })
  await auditar({
    usuario,
    acao: 'ALTERAR',
    entidade: 'Cartao',
    entidadeId: id,
    resumo: `${c.ativo ? 'Reativou' : 'Desativou'} o cartão ${c.nome}`,
  })
  revalidatePath('/cartoes')
}
