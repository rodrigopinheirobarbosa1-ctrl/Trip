import { redirect } from 'next/navigation'
import { usuarioAtual } from '@/lib/auth'
import { db } from '@/lib/db'
import { BotaoEnviar, Formulario } from '@/components/form'
import { acaoEntrar } from './actions'

export const dynamic = 'force-dynamic'

export default async function PaginaLogin() {
  if (await usuarioAtual()) redirect('/painel')
  // Banco recém-criado: ninguém cadastrado ainda.
  if ((await db.usuario.count()) === 0) redirect('/primeiro-acesso')

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-marca-700">TRIP</h1>
          <p className="mt-2 text-sm text-slate-500">Controle de milhas e pontos</p>
        </div>

        <div className="cartao p-6">
          <Formulario action={acaoEntrar}>
            <label className="block">
              <span className="rotulo">E-mail</span>
              <input
                type="email"
                name="email"
                required
                autoComplete="username"
                autoFocus
                className="campo"
                placeholder="voce@exemplo.com.br"
              />
            </label>
            <label className="mt-4 block">
              <span className="rotulo">Senha</span>
              <input type="password" name="senha" required autoComplete="current-password" className="campo" />
            </label>
            <div className="mt-6">
              <BotaoEnviar>Entrar</BotaoEnviar>
            </div>
          </Formulario>
        </div>

        <p className="mt-6 text-center text-xs text-slate-400">
          Acesso individual. Esqueceu a senha? Peça ao administrador para criar uma nova.
        </p>
      </div>
    </main>
  )
}
