'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { exigirAdminAction, exigirUsuarioAction, conferirSenha, hashSenha } from '@/lib/auth'
import { auditar } from '@/lib/audit'
import { ErroFormulario, opcao, textoObrigatorio, tratarErros } from '@/lib/form-dados'
import type { EstadoForm } from '@/components/form'

function senhaValida(dados: FormData, nome = 'senha'): string {
  const senha = String(dados.get(nome) ?? '')
  if (senha.length < 8) throw new ErroFormulario('A senha precisa ter pelo menos 8 caracteres.')
  return senha
}

export async function criarUsuario(_e: EstadoForm, dados: FormData): Promise<EstadoForm> {
  return tratarErros(async () => {
    const admin = await exigirAdminAction()
    const email = textoObrigatorio(dados, 'email', 'E-mail').toLowerCase()
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new ErroFormulario('E-mail inválido.')
    if (await db.usuario.findUnique({ where: { email } })) throw new ErroFormulario('Já existe um usuário com esse e-mail.')
    const u = await db.usuario.create({
      data: {
        nome: textoObrigatorio(dados, 'nome', 'Nome'),
        email,
        papel: opcao(dados, 'papel', 'Perfil', ['ADMIN', 'OPERADOR'] as const),
        senhaHash: await hashSenha(senhaValida(dados)),
      },
    })
    await auditar({ usuario: admin, acao: 'CRIAR', entidade: 'Usuario', entidadeId: u.id, resumo: `Criou o usuário ${u.nome} (${u.email})` })
    revalidatePath('/usuarios')
    return { ok: `Usuário criado. Passe o e-mail e a senha para ${u.nome}.` }
  })
}

export async function redefinirSenha(id: string, _e: EstadoForm, dados: FormData): Promise<EstadoForm> {
  return tratarErros(async () => {
    const admin = await exigirAdminAction()
    const u = await db.usuario.update({ where: { id }, data: { senhaHash: await hashSenha(senhaValida(dados)) } })
    // Desconecta quem estiver usando a senha antiga.
    await db.sessao.deleteMany({ where: { usuarioId: id } })
    await auditar({ usuario: admin, acao: 'ALTERAR', entidade: 'Usuario', entidadeId: id, resumo: `Redefiniu a senha de ${u.nome}` })
    return { ok: `Nova senha definida para ${u.nome}.` }
  })
}

export async function alterarUsuario(id: string, _e: EstadoForm, dados: FormData): Promise<EstadoForm> {
  return tratarErros(async () => {
    const admin = await exigirAdminAction()
    const papel = opcao(dados, 'papel', 'Perfil', ['ADMIN', 'OPERADOR'] as const)
    const ativo = dados.get('ativo') === 'on'
    if (id === admin.id && (papel !== 'ADMIN' || !ativo)) {
      throw new ErroFormulario('Você não pode tirar o seu próprio acesso de administrador.')
    }
    const u = await db.usuario.update({ where: { id }, data: { papel, ativo } })
    if (!ativo) await db.sessao.deleteMany({ where: { usuarioId: id } })
    await auditar({
      usuario: admin,
      acao: 'ALTERAR',
      entidade: 'Usuario',
      entidadeId: id,
      resumo: `Alterou ${u.nome}: perfil ${papel === 'ADMIN' ? 'administrador' : 'operador'}, ${ativo ? 'ativo' : 'desativado'}`,
    })
    revalidatePath('/usuarios')
    return { ok: 'Usuário atualizado.' }
  })
}

export async function trocarMinhaSenha(_e: EstadoForm, dados: FormData): Promise<EstadoForm> {
  return tratarErros(async () => {
    const usuario = await exigirUsuarioAction()
    const atual = await db.usuario.findUniqueOrThrow({ where: { id: usuario.id } })
    if (!(await conferirSenha(String(dados.get('atual') ?? ''), atual.senhaHash))) {
      throw new ErroFormulario('A senha atual não confere.')
    }
    const nova = senhaValida(dados, 'nova')
    if (nova !== String(dados.get('confirmacao') ?? '')) throw new ErroFormulario('As duas senhas novas não são iguais.')
    await db.usuario.update({ where: { id: usuario.id }, data: { senhaHash: await hashSenha(nova) } })
    await auditar({ usuario, acao: 'ALTERAR', entidade: 'Usuario', entidadeId: usuario.id, resumo: `${usuario.nome} trocou a própria senha` })
    return { ok: 'Senha alterada.' }
  })
}
