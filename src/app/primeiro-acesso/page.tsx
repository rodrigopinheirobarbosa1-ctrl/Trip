import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { BotaoEnviar, Formulario } from '@/components/form'
import { Texto } from '@/components/campos'
import { criarPrimeiroAdmin } from './actions'

export const dynamic = 'force-dynamic'

export default async function PrimeiroAcesso() {
  if ((await db.usuario.count()) > 0) redirect('/login')

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-marca-700">TRIP</h1>
          <p className="mt-2 text-sm text-slate-500">Bem-vindo! Crie o acesso do administrador.</p>
        </div>
        <div className="cartao p-6">
          <p className="mb-4 text-sm text-slate-600">
            Esta tela só aparece uma vez, enquanto o sistema não tem nenhum usuário. O administrador depois
            cadastra as outras pessoas da equipe.
          </p>
          <Formulario action={criarPrimeiroAdmin} className="space-y-4">
            <Texto rotulo="Seu nome" nome="nome" obrigatorio />
            <Texto rotulo="E-mail" nome="email" tipo="email" obrigatorio />
            <Texto rotulo="Senha" nome="senha" tipo="password" obrigatorio dica="Pelo menos 8 caracteres." />
            <Texto rotulo="Repita a senha" nome="confirmacao" tipo="password" obrigatorio />
            <BotaoEnviar>Criar acesso</BotaoEnviar>
          </Formulario>
        </div>
      </div>
    </main>
  )
}
