import { exigirUsuario } from '@/lib/auth'
import { Menu } from '@/components/menu'
import { contarPendencias } from '@/lib/pendencias'

// Toda tela dentro deste grupo exige usuário autenticado.
export default async function LayoutAplicacao({ children }: { children: React.ReactNode }) {
  const usuario = await exigirUsuario()
  const pendencias = await contarPendencias()

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <Menu usuario={usuario} pendencias={pendencias} />
      <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
    </div>
  )
}
