import Link from 'next/link'
import { db } from '@/lib/db'
import { anosDisponiveis, listasLancamento } from '@/lib/dados'
import { intervaloDatas, lerFiltros } from '@/lib/filtros'
import { dataParaCampo, formatarData, hoje } from '@/lib/formatos'
import { BarraFiltros } from '@/components/filtros'
import { Cabecalho, Cartao, Dinheiro, Etiqueta, Tabela, Td, Th, Vazio } from '@/components/ui'
import { FormularioMovimento } from './formulario'
import { salvarMovimento } from './actions'

export default async function Financeiro({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const busca = await searchParams
  const anos = await anosDisponiveis()
  const filtros = lerFiltros(busca, anos[0] ?? null)
  const { titulares } = await listasLancamento()
  const todos = await db.titular.findMany({ orderBy: { nome: 'asc' } })

  const lista = await db.movimentoFinanceiro.findMany({
    where: { titularId: filtros.titular ?? undefined, data: intervaloDatas(filtros) },
    include: { titular: true },
    orderBy: [{ data: 'desc' }, { criadoEm: 'desc' }],
  })
  const saldo = lista.reduce((s, m) => s + (m.tipo === 'ENTRADA' ? m.valor : -m.valor), 0)

  return (
    <>
      <Cabecalho
        titulo="Entradas e saídas avulsas"
        descricao="Dinheiro que entra ou sai do caixa sem ser compra ou venda de pontos: aportes, retiradas, tarifas. (Planilha: E|S Financeiras)"
      />
      <BarraFiltros filtros={filtros} titulares={todos} anos={anos} mostrarPrograma={false} />
      <div className="grid gap-6 lg:grid-cols-3">
        <Cartao titulo="Lançamentos" className="lg:col-span-2">
          {lista.length === 0 ? (
            <Vazio texto="Nenhum lançamento com estes filtros." />
          ) : (
            <Tabela>
              <thead>
                <tr>
                  <Th>Data</Th>
                  <Th>Descrição</Th>
                  <Th>Pessoa</Th>
                  <Th alinhar="direita">Valor</Th>
                </tr>
              </thead>
              <tbody>
                {lista.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-50">
                    <Td>
                      <Link href={`/financeiro/${m.id}`} className="font-medium text-marca-700 hover:underline">
                        {formatarData(m.data)}
                      </Link>
                    </Td>
                    <Td>
                      <Etiqueta tom={m.tipo === 'ENTRADA' ? 'verde' : 'vermelho'}>{m.tipo === 'ENTRADA' ? 'Entrada' : 'Saída'}</Etiqueta>{' '}
                      {m.descricao}
                    </Td>
                    <Td>{m.titular?.nome ?? 'Geral'}</Td>
                    <Td alinhar="direita">
                      <Dinheiro centavos={m.tipo === 'ENTRADA' ? m.valor : -m.valor} colorir />
                    </Td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-semibold">
                  <Td>Saldo</Td>
                  <Td />
                  <Td />
                  <Td alinhar="direita">
                    <Dinheiro centavos={saldo} colorir />
                  </Td>
                </tr>
              </tfoot>
            </Tabela>
          )}
        </Cartao>
        <Cartao titulo="Novo lançamento">
          <FormularioMovimento
            key={typeof busca.ok === 'string' ? busca.ok : 'novo'}
            acao={salvarMovimento.bind(null, null)}
            titulares={titulares}
            valores={{ data: dataParaCampo(hoje()), tipo: 'SAIDA', titularId: '', valor: '', descricao: '' }}
          />
        </Cartao>
      </div>
    </>
  )
}
