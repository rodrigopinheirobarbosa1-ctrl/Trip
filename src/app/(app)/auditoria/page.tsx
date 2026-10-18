import Link from '@/components/link'
import { db } from '@/lib/db'
import { exigirAdmin } from '@/lib/auth'
import { Cabecalho, Cartao, Tabela, Td, Th, Vazio } from '@/components/ui'

/** Formulário que recria cada tipo de lançamento excluído. */
const RELANCAR: Record<string, string> = {
  Entrada: '/entradas/nova',
  Saida: '/saidas/nova',
  Transferencia: '/transferencias/nova',
}

export default async function Auditoria({
  searchParams,
}: {
  searchParams: Promise<{ pagina?: string; busca?: string; exclusoes?: string }>
}) {
  await exigirAdmin()
  const params = await searchParams
  const pagina = Math.max(1, Number(params.pagina) || 1)
  const busca = (params.busca ?? '').trim()
  const soExclusoes = params.exclusoes === 'sim'
  const porPagina = 100
  const where = {
    ...(busca ? { resumo: { contains: busca, mode: 'insensitive' as const } } : {}),
    ...(soExclusoes ? { acao: 'EXCLUIR' } : {}),
  }
  const [lista, total] = await Promise.all([
    db.auditoria.findMany({ where, orderBy: { criadoEm: 'desc' }, skip: (pagina - 1) * porPagina, take: porPagina }),
    db.auditoria.count({ where }),
  ])
  const paginas = Math.max(1, Math.ceil(total / porPagina))
  const endereco = (p: number) =>
    `/auditoria?${new URLSearchParams({ pagina: String(p), ...(busca ? { busca } : {}), ...(soExclusoes ? { exclusoes: 'sim' } : {}) })}`

  return (
    <>
      <Cabecalho titulo="Histórico" descricao="Quem fez o quê e quando. Nada aqui pode ser apagado." />
      <Cartao>
        <form method="get" action="/auditoria" className="mb-4 flex flex-wrap items-end gap-3">
          <label className="flex-1 text-sm">
            <span className="mb-1 block text-slate-600">Procurar (pessoa, programa, pontos, valor...)</span>
            <input name="busca" defaultValue={busca} className="campo w-full" placeholder="Ex.: 158.400 ou Livelo" />
          </label>
          <label className="flex items-center gap-2 py-2 text-sm">
            <input type="checkbox" name="exclusoes" value="sim" defaultChecked={soExclusoes} />
            Só exclusões
          </label>
          <button className="btn-secundario">Procurar</button>
        </form>
        {lista.length === 0 ? (
          <Vazio texto={busca || soExclusoes ? 'Nada encontrado.' : 'Nada registrado ainda.'} />
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
                  <Td>
                    {a.resumo}
                    {a.acao === 'EXCLUIR' && RELANCAR[a.entidade] && (
                      <Link
                        href={`${RELANCAR[a.entidade]}?relancar=${a.id}`}
                        className="ml-2 whitespace-nowrap text-xs font-semibold text-marca-700 underline"
                      >
                        Relançar
                      </Link>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Tabela>
        )}
        {paginas > 1 && (
          <div className="mt-4 flex gap-2 text-sm">
            {pagina > 1 && (
              <a className="btn-secundario" href={endereco(pagina - 1)}>
                ← Mais recentes
              </a>
            )}
            <span className="px-2 py-2 text-slate-500">
              Página {pagina} de {paginas}
            </span>
            {pagina < paginas && (
              <a className="btn-secundario" href={endereco(pagina + 1)}>
                Mais antigos →
              </a>
            )}
          </div>
        )}
      </Cartao>
    </>
  )
}
