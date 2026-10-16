'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { exigirUsuarioAction } from '@/lib/auth'
import { auditar } from '@/lib/audit'
import { centavosParaCampo, lerCentavos } from '@/lib/formatos'
import { ErroFormulario, textoObrigatorio, textoOpcional, tratarErros } from '@/lib/form-dados'
import type { EstadoForm } from '@/components/form'

function lerTitular(dados: FormData) {
  const saldoTexto = textoOpcional(dados, 'saldoInicialCaixa')
  const saldo = saldoTexto ? lerCentavos(saldoTexto) : 0
  if (saldo === null) throw new ErroFormulario('Valor inválido em "Saldo inicial do caixa".')
  return {
    nome: textoObrigatorio(dados, 'nome', 'Nome'),
    cpf: textoOpcional(dados, 'cpf'),
    saldoInicialCaixa: saldo,
    observacao: textoOpcional(dados, 'observacao'),
  }
}

export async function criarTitular(_e: EstadoForm, dados: FormData): Promise<EstadoForm> {
  return tratarErros(async () => {
    const usuario = await exigirUsuarioAction()
    const t = await db.titular.create({ data: lerTitular(dados) })
    await auditar({ usuario, acao: 'CRIAR', entidade: 'Titular', entidadeId: t.id, resumo: `Cadastrou a pessoa ${t.nome}` })
    revalidatePath('/titulares')
    redirect(`/titulares/${t.id}`)
  })
}

export async function salvarTitular(id: string, _e: EstadoForm, dados: FormData): Promise<EstadoForm> {
  return tratarErros(async () => {
    const usuario = await exigirUsuarioAction()
    const novo = { ...lerTitular(dados), ativo: dados.get('ativo') === 'on' }
    const t = await db.titular.update({ where: { id }, data: novo })
    await auditar({
      usuario,
      acao: 'ALTERAR',
      entidade: 'Titular',
      entidadeId: id,
      resumo: `Alterou o cadastro de ${t.nome} (saldo inicial do caixa: R$ ${centavosParaCampo(t.saldoInicialCaixa)})`,
    })
    revalidatePath('/titulares')
    return { ok: 'Cadastro salvo.' }
  })
}

export async function salvarConta(titularId: string, _e: EstadoForm, dados: FormData): Promise<EstadoForm> {
  return tratarErros(async () => {
    const usuario = await exigirUsuarioAction()
    const programaId = textoObrigatorio(dados, 'programaId', 'Programa')
    const login = textoObrigatorio(dados, 'login', 'Login')
    const observacao = textoOpcional(dados, 'observacao')
    const conta = await db.contaPrograma.upsert({
      where: { titularId_programaId: { titularId, programaId } },
      create: { titularId, programaId, login, observacao },
      update: { login, observacao },
      include: { titular: true, programa: true },
    })
    await auditar({
      usuario,
      acao: 'ALTERAR',
      entidade: 'ContaPrograma',
      entidadeId: conta.id,
      resumo: `Login de ${conta.titular.nome} no ${conta.programa.nome}: ${login}`,
    })
    revalidatePath(`/titulares/${titularId}`)
    return { ok: 'Login salvo.' }
  })
}

export async function excluirConta(contaId: string): Promise<void> {
  const usuario = await exigirUsuarioAction()
  const conta = await db.contaPrograma.delete({ where: { id: contaId }, include: { titular: true, programa: true } })
  await auditar({
    usuario,
    acao: 'EXCLUIR',
    entidade: 'ContaPrograma',
    entidadeId: contaId,
    resumo: `Removeu o login de ${conta.titular.nome} no ${conta.programa.nome}`,
  })
  revalidatePath(`/titulares/${conta.titularId}`)
}
