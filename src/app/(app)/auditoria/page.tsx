import { db } from '@/lib/db'
import { exigirAdmin } from '@/lib/auth'
import { Cabecalho, Cartao, Tabela, Td, Th, Vazio } from '@/components/ui'

export default async function Auditoria({ searchParams }: { searchParams: Promise<{ pagina?: string }> }) {
  await exigirAdmin()
  const pagina = Math.max(1, Number((await searchParams).pagina) || 1)
  const porPagina = 100
  const [lista, total] = await Promise.all([
    db.auditoria.findMany({ orderBy: { criadoEm: 'desc' }, skip: (pagina - 1) * porPagina, take: porPagina }),
    db.auditoria.count(),
  ])
  const paginas = Math.max(1, Math.ceil(total / porPagina))

  return (
    <>
      <Cabecalho titulo="Histórico" descricao="Quem fez o quê e quando. Nada aqui pode ser apagado." />
      <Cartao>
        {lista.length === 0 ? (
          <Vazio texto="Nada registrado ainda." />
        ) : (
          <Tabela>
            <thead>
              <tr>
                <Th>Quando</Th>
                <Th>Quem</Th>
                <Th>O quê</Th>
              </tr>
            </thead>
            <tbody>
              {lista.map((a) => (
                <tr key={a.id}>
                  <Td className="whitespace-nowrap">{a.criadoEm.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</Td>
                  <Td>{a.usuarioNome}</Td>
                  <Td>{a.resumo}</Td>
                </tr>
              ))}
            </tbody>
          </Tabela>
        )}
        {paginas > 1 && (
          <div className="mt-4 flex gap-2 text-sm">
            {pagina > 1 && (
              <a className="btn-secundario" href={`/auditoria?pagina=${pagina - 1}`}>
                ← Mais recentes
              </a>
            )}
            <span className="px-2 py-2 text-slate-500">
              Página {pagina} de {paginas}
            </span>
            {pagina < paginas && (
              <a className="btn-secundario" href={`/auditoria?pagina=${pagina + 1}`}>
                Mais antigos →
              </a>
            )}
          </div>
        )}
      </Cartao>
    </>
  )
}
