import Link from '@/components/link'

export default function SemPermissao() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="cartao max-w-md p-6 text-center">
        <h1 className="text-lg font-semibold text-slate-900">Sem permissão</h1>
        <p className="mt-2 text-sm text-slate-600">Esta tela é só para administradores.</p>
        <Link href="/painel" className="btn-primario mt-4">
          Voltar ao painel
        </Link>
      </div>
    </main>
  )
}
