import Link from 'next/link'
import { db } from '@/lib/db'
import { exigirUsuario } from '@/lib/auth'
import { anosDisponiveis, carregarCarteira, carregarItensCaixa, carregarNomes } from '@/lib/dados'
import { calcularFluxo, mesesDoAno } from '@/lib/fluxo'
import { lerFiltros } from '@/lib/filtros'
import { chaveMes, formatarCmp, formatarMes, formatarPontos, formatarReais, hoje } from '@/lib/formatos'
import { TIPOS_PROGRAMA } from '@/lib/rotulos'
import { BarraFiltros } from '@/components/filtros'
import { Aviso, Cabecalho, Cartao, Indicador, LinkBotao, Tabela, Td, Th, Vazio } from '@/components/ui'

export default async function Painel({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const usuario = await exigirUsuario()

  const busca = await searchParams
  const anos = await anosDisponiveis()
  const filtros = lerFiltros(busca, new Date().getFullYear())
  const ano = filtros.ano ?? new Date().getFullYear()
  const titularFiltro = filtros.titular

  const [nomes, carteira, caixa] = await Promise.all([
    carregarNomes(),
    carregarCarteira(),
    carregarItensCaixa(titularFiltro ?? undefined),
  ])

  if (nomes.titulares.length === 0) {
    return (
      <>
        <Cabecalho titulo={`Olá, ${usuario.nome.split(' ')[0]}!`} />
        <Cartao>
          <Vazio
            texto="O sistema ainda está vazio. Comece importando a sua planilha ou cadastrando as pessoas e os programas."
            acao={
              <div className="flex flex-wrap justify-center gap-2">
                {usuario.papel === 'ADMIN' && (
                  <LinkBotao href="/importar" variante="primario">
                    Importar planilha
                  </LinkBotao>
                )}
                <LinkBotao href="/titulares">Cadastrar pessoas</LinkBotao>
              </div>
            }
          />
        </Cartao>
      </>
    )
  }

  // ---- Pontos -------------------------------------------------------------
  const posicoes = [...carteira.posicoes.values()].filter((p) => !titularFiltro || p.titularId === titularFiltro)
  const positivas = posicoes.filter((p) => p.pontos > 0)
  const negativas = posicoes.filter((p) => p.pontos < 0)
  const totalPontos = positivas.reduce((s, p) => s + p.pontos, 0)
  const totalCusto = positivas.reduce((s, p) => s + p.custo, 0)
  const valorEstimado = positivas.reduce((s, p) => {
    const v = nomes.programa.get(p.programaId)?.valorMilheiro
    return v ? s + (p.pontos * v) / 1000 : s
  }, 0)
  const temPrecoMercado = positivas.some((p) => nomes.programa.get(p.programaId)?.valorMilheiro)

  const porTipo = Object.keys(TIPOS_PROGRAMA).map((tipo) => {
    const ps = positivas.filter((p) => nomes.programa.get(p.programaId)?.tipo === tipo)
    const pontos = ps.reduce((s, p) => s + p.pontos, 0)
    const custo = ps.reduce((s, p) => s + p.custo, 0)
    return { tipo: tipo as keyof typeof TIPOS_PROGRAMA, pontos, custo, cmp: pontos ? (custo / pontos) * 1000 : null }
  })

  // Matriz programa x pessoa (como a aba Resumo da planilha).
  const titularesNaTabela = nomes.titulares.filter(
    (t) => (!titularFiltro || t.id === titularFiltro) && posicoes.some((p) => p.titularId === t.id && p.pontos !== 0),
  )
  const programasNaTabela = nomes.programas.filter((pr) => posicoes.some((p) => p.programaId === pr.id && p.pontos !== 0))

  // ---- Dinheiro -----------------------------------------------------------
  const inicioAno = new Date(Date.UTC(ano, 0, 1))
  const fimAno = new Date(Date.UTC(ano + 1, 0, 1))
  const vendasAno = await db.saida.findMany({
    where: { tipo: 'VENDA', data: { gte: inicioAno, lt: fimAno }, titularId: titularFiltro ?? undefined },
    select: { id: true, valorVenda: true, taxaEmbarque: true, pontos: true },
  })
  const lucroAno = vendasAno.reduce((s, v) => s + v.valorVenda - v.taxaEmbarque - (carteira.custoSaidas.get(v.id)?.custo ?? 0), 0)
  const faturamentoAno = vendasAno.reduce((s, v) => s + v.valorVenda, 0)

  const fluxo = calcularFluxo(caixa.itens, mesesDoAno(ano), caixa.saldoInicial)
  const mesAtual = fluxo.find((m) => m.mes === chaveMes(hoje()))

  return (
    <>
      <Cabecalho
        titulo="Painel"
        descricao={titularFiltro ? `Mostrando só ${nomes.titular.get(titularFiltro)?.nome}` : 'Todas as pessoas juntas'}
        acoes={
          <>
            <LinkBotao href="/entradas/nova">+ Entrada</LinkBotao>
            <LinkBotao href="/transferencias/nova">+ Transferência</LinkBotao>
            <LinkBotao href="/saidas/nova" variante="primario">
              + Emissão / venda
            </LinkBotao>
          </>
        }
      />
      <BarraFiltros
        filtros={{ ...filtros, ano }}
        titulares={nomes.titulares}
        anos={anos}
        mostrarMes={false}
        mostrarPrograma={false}
        permitirTodosAnos={false}
      />

      {negativas.length > 0 && (
        <div className="mb-4">
          <Aviso tom="amarelo">
            {negativas.length} saldo(s) estão negativos e ficaram fora dos totais.{' '}
            <Link href="/pendencias" className="font-semibold underline">
              Ver pendências
            </Link>
          </Aviso>
        </div>
      )}

      <div className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Indicador titulo="Pontos em carteira" texto={formatarPontos(totalPontos)} detalhe="soma de todos os programas" />
        <Indicador titulo="Custo dos pontos" valorCentavos={totalCusto} detalhe={`CMP médio ${formatarCmp(totalPontos ? (totalCusto / totalPontos) * 1000 : null)}`} />
        <Indicador
          titulo="Valor estimado de venda"
          valorCentavos={temPrecoMercado ? valorEstimado : undefined}
          texto={temPrecoMercado ? undefined : '-'}
          detalhe={temPrecoMercado ? 'pelo preço do milheiro de cada programa' : 'cadastre o preço do milheiro em Programas'}
        />
        <Indicador
          titulo={`Lucro das vendas em ${ano}`}
          valorCentavos={lucroAno}
          tom="auto"
          detalhe={`${vendasAno.length} venda(s) · faturamento ${formatarReais(faturamentoAno)}`}
        />
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Indicador
          titulo="Caixa no fim deste mês"
          valorCentavos={mesAtual?.acumulado}
          texto={mesAtual ? undefined : '-'}
          tom="auto"
          detalhe={mesAtual ? formatarMes(mesAtual.mes) : `mês atual fora de ${ano}`}
        />
        <Indicador titulo={`Caixa em 31/dez/${ano}`} valorCentavos={fluxo[11].acumulado} tom="auto" detalhe="com as parcelas futuras" />
        {porTipo
          .filter((t) => t.pontos > 0)
          .slice(0, 2)
          .map((t) => (
            <Indicador
              key={t.tipo}
              titulo={`Programas ${TIPOS_PROGRAMA[t.tipo].toLowerCase()}`}
              texto={`${formatarPontos(t.pontos)} pts`}
              detalhe={`${formatarReais(t.custo)} · CMP ${formatarCmp(t.cmp)}`}
            />
          ))}
      </div>

      <Cartao titulo="Saldos por programa e pessoa">
        {programasNaTabela.length === 0 ? (
          <Vazio texto="Nenhum saldo ainda." />
        ) : (
          <Tabela>
            <thead>
              <tr>
                <Th>Programa</Th>
                {titularesNaTabela.map((t) => (
                  <Th key={t.id} alinhar="direita">
                    {t.nome}
                  </Th>
                ))}
                <Th alinhar="direita">Total</Th>
                <Th alinhar="direita">CMP</Th>
                <Th alinhar="direita">Custo</Th>
              </tr>
            </thead>
            <tbody>
              {programasNaTabela.map((pr) => {
                const linha = posicoes.filter((p) => p.programaId === pr.id)
                const pos = linha.filter((p) => p.pontos > 0)
                const pontos = pos.reduce((s, p) => s + p.pontos, 0)
                const custo = pos.reduce((s, p) => s + p.custo, 0)
                return (
                  <tr key={pr.id} className="hover:bg-slate-50">
                    <Td className="font-medium">{pr.nome}</Td>
                    {titularesNaTabela.map((t) => {
                      const p = linha.find((x) => x.titularId === t.id)
                      if (!p || p.pontos === 0) return <Td key={t.id} alinhar="direita" className="text-slate-300">-</Td>
                      return (
                        <Td key={t.id} alinhar="direita">
                          <Link
                            href={`/extrato?titular=${t.id}&programa=${pr.id}`}
                            className={p.pontos < 0 ? 'font-semibold text-red-700 underline' : 'hover:underline'}
                            title={p.cmp ? `CMP ${formatarCmp(p.cmp)}` : undefined}
                          >
                            {formatarPontos(p.pontos)}
                          </Link>
                        </Td>
                      )
                    })}
                    <Td alinhar="direita" className="font-semibold">
                      {formatarPontos(pontos)}
                    </Td>
                    <Td alinhar="direita">{formatarCmp(pontos ? (custo / pontos) * 1000 : null)}</Td>
                    <Td alinhar="direita">{formatarReais(custo)}</Td>
                  </tr>
                )
              })}
            </tbody>
          </Tabela>
        )}
        <p className="mt-3 text-xs text-slate-400">Clique num saldo para ver o extrato. Passe o mouse para ver o CMP de cada pessoa.</p>
      </Cartao>
    </>
  )
}
