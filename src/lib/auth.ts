import 'server-only'
import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { randomBytes } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { db } from './db'

const COOKIE = 'trip_sessao'
const DURACAO_DIAS = 7

export type UsuarioLogado = {
  id: string
  nome: string
  email: string
  papel: 'ADMIN' | 'OPERADOR'
}

export async function hashSenha(senha: string): Promise<string> {
  return bcrypt.hash(senha, 12)
}

export async function conferirSenha(senha: string, hash: string): Promise<boolean> {
  return bcrypt.compare(senha, hash)
}

/** Cria a sessão de um usuário já autenticado e grava o cookie. */
export async function abrirSessao(usuarioId: string): Promise<void> {
  const id = randomBytes(32).toString('hex')
  const expiraEm = new Date(Date.now() + DURACAO_DIAS * 86400000)
  const cabecalhos = await headers()

  await db.sessao.create({
    data: {
      id,
      usuarioId,
      expiraEm,
      ip: cabecalhos.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    },
  })
  await db.usuario.update({ where: { id: usuarioId }, data: { ultimoAcesso: new Date() } })

  const jarra = await cookies()
  jarra.set(COOKIE, id, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: expiraEm,
  })
}

/**
 * Autentica e cria a sessão. Devolve null quando as credenciais não conferem
 * (mensagem genérica de propósito: não revela se o e-mail existe).
 */
export async function entrar(email: string, senha: string): Promise<UsuarioLogado | null> {
  const usuario = await db.usuario.findUnique({ where: { email: email.toLowerCase().trim() } })
  if (!usuario || !usuario.ativo) {
    // Gasta o mesmo tempo de um hash real para não revelar se o e-mail existe.
    await bcrypt.compare(senha, '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidin')
    return null
  }
  if (!(await conferirSenha(senha, usuario.senhaHash))) return null

  await abrirSessao(usuario.id)
  return { id: usuario.id, nome: usuario.nome, email: usuario.email, papel: usuario.papel }
}

export async function sair(): Promise<void> {
  const jarra = await cookies()
  const id = jarra.get(COOKIE)?.value
  if (id) await db.sessao.deleteMany({ where: { id } })
  jarra.delete(COOKIE)
}

/** Usuário da requisição atual, ou null se não houver sessão válida. */
export async function usuarioAtual(): Promise<UsuarioLogado | null> {
  const jarra = await cookies()
  const id = jarra.get(COOKIE)?.value
  if (!id) return null

  const sessao = await db.sessao.findUnique({ where: { id }, include: { usuario: true } })
  if (!sessao || sessao.expiraEm < new Date() || !sessao.usuario.ativo) {
    if (sessao) await db.sessao.deleteMany({ where: { id } })
    return null
  }
  const u = sessao.usuario
  return { id: u.id, nome: u.nome, email: u.email, papel: u.papel }
}

/** Exige um usuário logado; redireciona para o login caso contrário. */
export async function exigirUsuario(): Promise<UsuarioLogado> {
  const usuario = await usuarioAtual()
  if (!usuario) redirect('/login')
  return usuario
}

/** Exige perfil de administrador. */
export async function exigirAdmin(): Promise<UsuarioLogado> {
  const usuario = await exigirUsuario()
  if (usuario.papel !== 'ADMIN') redirect('/sem-permissao')
  return usuario
}

/** Usado dentro de server actions: lança erro em vez de redirecionar. */
export async function exigirUsuarioAction(): Promise<UsuarioLogado> {
  const usuario = await usuarioAtual()
  if (!usuario) throw new Error('Sessão expirada. Entre novamente.')
  return usuario
}

export async function exigirAdminAction(): Promise<UsuarioLogado> {
  const usuario = await exigirUsuarioAction()
  if (usuario.papel !== 'ADMIN') throw new Error('Seu perfil não tem permissão para esta operação.')
  return usuario
}

/** Remove sessões vencidas (chamado de tempos em tempos pelo painel). */
export async function limparSessoesVencidas(): Promise<void> {
  await db.sessao.deleteMany({ where: { expiraEm: { lt: new Date() } } })
}
