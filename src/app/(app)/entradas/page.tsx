import Link from '@/components/link'
import { db } from '@/lib/db'
import { anosDisponiveis, carregarNomes } from '@/lib/dados'
import { intervaloDatas, lerFiltros } from '@/lib/filtros'
import { formatarCmp, formatarData, formatarPontos } from '@/lib/formatos'
import { CATEGORIAS_ENTRADA, FORMAS_PAGAMENTO, rotulo } from '@/lib/rotulos'
import { BarraFiltros } from '@/components/filtros'
import { Cabecalho, Cartao, Dinheiro, LinkBotao, Tabela, Td, Th, Vazio } from '@/components/ui'

export default async function Entradas({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const busca = await searchParams
  const anos = await anosDisponiveis()
  const filtros = lerFiltros(busca, anos[0] ?? null)
  const nomes = await carregarNomes()

  const entradas = await db.entrada.findMany({
    where: {
      titularId: filtros.titular ?? undefined,
      programaId: filtros.programa ?? undefined,
      data: intervaloDatas(filtros),
    },
    include: { titular: true, programa: true, cartao: true },
    orderBy: [{ data: 'desc' }, { criadoEm: 'desc' }],
  })
  const totalPontos = entradas.reduce((s, e) => s + e.pontos, 0)
  const totalValor = entradas.reduce((s, e) => s + e.valor, 0)

  return (
    <>
      <Cabecalho
        titulo="Entradas de pontos"
        descricao="Compras, acúmulos, bônus e saldos iniciais. (Planilha: Lança Entrada Ptos)"
        acoes={<LinkBotao href="/entradas/nova" variante="primario">+ Nova entrada</LinkBotao>}
      />
      <BarraFiltros filtros={filtros} titulares={nomes.titulares} programas={nomes.programas} anos={anos} />
      <Cartao>
        {entradas.length === 0 ? (
          <Vazio texto="Nenhuma entrada encontrada com estes filtros." acao={<LinkBotao href="/entradas/nova">Lançar entrada</LinkBotao>} />
        ) : (
          <Tabela>
            <thead>
              <tr>
                <Th>Data</Th>
                <Th>Pessoa</Th>
                <Th>Programa</Th>
                <Th>Tipo</Th>
                <Th alinhar="direita">Pontos</Th>
                <Th alinhar="direita">Valor</Th>
                <Th alinhar="direita">CMP</Th>
                <Th>Pagamento</Th>
                <Th>Observação</Th>
              </tr>
            </thead>
            <tbody>
              {entradas.map((e) => (
                <tr key={e.id} className="hover:bg-slate-50">
                  <Td>
                    <Link href={`/entradas/${e.id}`} className="font-medium text-marca-700 hover:underline">
                      {formatarData(e.data)}
                    </Link>
                  </Td>
                  <Td>{e.titular.nome}</Td>
                  <Td>{e.programa.nome}</Td>
                  <Td>{rotulo(CATEGORIAS_ENTRADA, e.categoria)}</Td>
                  <Td alinhar="direita" className={e.pontos < 0 ? 'text-red-700' : ''}>
                    {formatarPontos(e.pontos)}
                  </Td>
                  <Td alinhar="direita">
                    <Dinheiro centavos={e.valor} />
                  </Td>
                  <Td alinhar="direita">{e.pontos > 0 && e.valor > 0 ? formatarCmp((e.valor / e.pontos) * 1000) : '-'}</Td>
                  <Td>
                    {e.formaPagamento === 'SEM_DESEMBOLSO' ? (
                      <span className="text-slate-400">-</span>
                    ) : (
                      <>
                        {rotulo(FORMAS_PAGAMENTO, e.formaPagamento)}
                        {e.parcelas > 1 && ` ${e.parcelas}x`}
                        {e.cartao && <span className="block text-xs text-slate-400">{e.cartao.nome}</span>}
                      </>
                    )}
                  </Td>
                  <Td className="max-w-[16rem] truncate text-slate-500">{e.observacao}</Td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-semibold">
                <Td>Total</Td>
                <Td>{entradas.length} lançamento(s)</Td>
                <Td />
                <Td />
                <Td alinhar="direita">{formatarPontos(totalPontos)}</Td>
                <Td alinhar="direita">
                  <Dinheiro centavos={totalValor} />
                </Td>
                <Td alinhar="direita">{totalPontos > 0 && totalValor > 0 ? formatarCmp((totalValor / totalPontos) * 1000) : '-'}</Td>
                <Td />
                <Td />
              </tr>
            </tfoot>
          </Tabela>
        )}
      </Cartao>
    </>
  )
}
