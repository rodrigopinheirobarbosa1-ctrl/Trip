import { db } from '@/lib/db'
import { anosDisponiveis, carregarItensCaixa } from '@/lib/dados'
import { lerFiltros } from '@/lib/filtros'
import { calcularFluxo, mesesDoAno } from '@/lib/fluxo'
import { chaveMes, formatarMes, hoje } from '@/lib/formatos'
import { BarraFiltros } from '@/components/filtros'
import { Aviso, Cabecalho, Cartao, Dinheiro, Indicador, Tabela, Td, Th } from '@/components/ui'

export default async function FluxoDeCaixa({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const busca = await searchParams
  const anos = await anosDisponiveis()
  const filtros = lerFiltros(busca, new Date().getFullYear())
  const ano = filtros.ano ?? new Date().getFullYear()
  const titulares = await db.titular.findMany({ orderBy: { nome: 'asc' } })

  const { itens, saldoInicial } = await carregarItensCaixa(filtros.titular ?? undefined)
  const meses = calcularFluxo(itens, mesesDoAno(ano), saldoInicial)
  const totalEntradas = meses.reduce((s, m) => s + m.entradas, 0)
  const totalSaidas = meses.reduce((s, m) => s + m.saidas, 0)
  const mesAtual = chaveMes(hoje())
  const atual = meses.find((m) => m.mes === mesAtual)

  return (
    <>
      <Cabecalho
        titulo="Fluxo de caixa"
        descricao="Dinheiro que entra (vendas) e sai (compras de pontos, parcelas de cartão, taxas) mês a mês."
      />
      <BarraFiltros
        filtros={{ ...filtros, ano }}
        titulares={titulares}
        anos={anos.filter((a) => a > 2000)}
        mostrarMes={false}
        mostrarPrograma={false}
        permitirTodosAnos={false}
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Indicador titulo={`Entradas em ${ano}`} valorCentavos={totalEntradas} tom="positivo" />
        <Indicador titulo={`Saídas em ${ano}`} valorCentavos={totalSaidas} tom="negativo" />
        <Indicador
          titulo="Saldo no fim deste mês"
          valorCentavos={atual?.acumulado}
          texto={atual ? undefined : '-'}
          tom="auto"
          detalhe={atual ? formatarMes(atual.mes) : `Escolha ${new Date().getFullYear()} para ver o mês atual`}
        />
        <Indicador titulo={`Saldo em 31/dez/${ano}`} valorCentavos={meses[11].acumulado} tom="auto" detalhe="já com as parcelas futuras" />
      </div>

      <Cartao>
        <Tabela>
          <thead>
            <tr>
              <Th>Mês</Th>
              <Th alinhar="direita">Entradas</Th>
              <Th alinhar="direita">Saídas</Th>
              <Th alinhar="direita">Saldo do mês</Th>
              <Th alinhar="direita">Saldo acumulado</Th>
            </tr>
          </thead>
          <tbody>
            {meses.map((m) => (
              <tr key={m.mes} className={m.mes === mesAtual ? 'bg-marca-50' : ''}>
                <Td className="font-medium">{formatarMes(m.mes)}</Td>
                <Td alinhar="direita">
                  <Dinheiro centavos={m.entradas} />
                </Td>
                <Td alinhar="direita">
                  <Dinheiro centavos={-m.saidas} />
                </Td>
                <Td alinhar="direita">
                  <Dinheiro centavos={m.saldo} colorir />
                </Td>
                <Td alinhar="direita" className="font-semibold">
                  <Dinheiro centavos={m.acumulado} colorir />
                </Td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="font-semibold">
              <Td>Total {ano}</Td>
              <Td alinhar="direita">
                <Dinheiro centavos={totalEntradas} />
              </Td>
              <Td alinhar="direita">
                <Dinheiro centavos={-totalSaidas} />
              </Td>
              <Td alinhar="direita">
                <Dinheiro centavos={totalEntradas - totalSaidas} colorir />
              </Td>
              <Td />
            </tr>
          </tfoot>
        </Tabela>
      </Cartao>

      <div className="mt-4">
        <Aviso>
          O saldo acumulado começa no <strong>saldo inicial do caixa</strong> de cada pessoa (em Pessoas) e já inclui o que
          aconteceu nos anos anteriores. Compras parceladas aparecem uma parcela por mês, a partir do mês da compra.
          Bônus e saldos iniciais de pontos não entram, porque não saiu dinheiro por eles.
        </Aviso>
      </div>
    </>
  )
}
