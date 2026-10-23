import Link from '@/components/link'
import { db } from '@/lib/db'
import { anosDisponiveis, carregarCarteira, carregarNomes } from '@/lib/dados'
import { intervaloDatas, lerFiltros } from '@/lib/filtros'
import { formatarCmp, formatarData, formatarPontos } from '@/lib/formatos'
import { rotulo, TIPOS_SAIDA } from '@/lib/rotulos'
import { BarraFiltros } from '@/components/filtros'
import { Cabecalho, Cartao, Dinheiro, Etiqueta, Indicador, LinkBotao, Tabela, Td, Th, Vazio } from '@/components/ui'

export default async function Saidas({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const busca = await searchParams
  const anos = await anosDisponiveis()
  const filtros = lerFiltros(busca, anos[0] ?? null)
  const tipo = typeof busca.tipo === 'string' && busca.tipo in TIPOS_SAIDA ? (busca.tipo as keyof typeof TIPOS_SAIDA) : undefined
  const [nomes, carteira] = await Promise.all([carregarNomes(), carregarCarteira()])

  const lista = await db.saida.findMany({
    where: {
      titularId: filtros.titular ?? undefined,
      programaId: filtros.programa ?? undefined,
      data: intervaloDatas(filtros),
      tipo,
    },
    include: { titular: true, programa: true },
    orderBy: [{ data: 'desc' }, { criadoEm: 'desc' }],
  })

  const linhas = lista.map((s) => {
    const c = carteira.custoSaidas.get(s.id)
    const custo = (c?.custo ?? 0) + s.taxaEmbarque
    const lucro = s.valorVenda - custo
    return { s, cmp: c?.cmp ?? null, custo, lucro, provisorio: c?.provisorio ?? false }
  })
  const vendas = linhas.filter((l) => l.s.tipo === 'VENDA')
  const lucroVendas = vendas.reduce((t, l) => t + l.lucro, 0)
  const faturamento = vendas.reduce((t, l) => t + l.s.valorVenda, 0)
  const custoPessoal = linhas.filter((l) => l.s.tipo === 'USO_PESSOAL').reduce((t, l) => t + l.custo, 0)
  const pontosVendidos = vendas.reduce((t, l) => t + l.s.pontos, 0)

  const linkTipo = (t?: string) => {
    const p = new URLSearchParams()
    for (const [k, v] of Object.entries(busca)) if (typeof v === 'string' && k !== 'tipo') p.set(k, v)
    if (t) p.set('tipo', t)
    return `/saidas?${p.toString()}`
  }

  return (
    <>
      <Cabecalho
        titulo="Emissões e vendas"
        descricao="Toda saída de pontos: vendas, uso pessoal e outras. (Planilha: Lança Saída Ptos + Controle de Venda)"
        acoes={<LinkBotao href="/saidas/nova" variante="primario">+ Nova emissão</LinkBotao>}
      />
      <BarraFiltros filtros={filtros} titulares={nomes.titulares} programas={nomes.programas} anos={anos} />

      <div className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Indicador titulo="Faturamento das vendas" valorCentavos={faturamento} />
        <Indicador titulo="Lucro das vendas" valorCentavos={lucroVendas} tom="auto" />
        <Indicador
          titulo="Preço médio de venda"
          texto={pontosVendidos ? formatarCmp((faturamento / pontosVendidos) * 1000) : '-'}
          detalhe="por milheiro vendido"
        />
        <Indicador titulo="Custo do uso pessoal" valorCentavos={custoPessoal} detalhe="pontos + taxas usados pela família" />
      </div>

      <div className="mb-3 flex flex-wrap gap-2 text-sm nao-imprimir">
        {[undefined, ...Object.keys(TIPOS_SAIDA)].map((t) => (
          <Link
            key={t ?? 'todos'}
            href={linkTipo(t)}
            className={`rounded-full border px-3 py-1 ${tipo === t ? 'border-marca-600 bg-marca-600 text-white' : 'border-slate-300 bg-white text-slate-600'}`}
          >
            {t ? TIPOS_SAIDA[t as keyof typeof TIPOS_SAIDA] : 'Todas'}
          </Link>
        ))}
      </div>

      <Cartao>
        {linhas.length === 0 ? (
          <Vazio texto="Nenhuma emissão encontrada com estes filtros." />
        ) : (
          <Tabela>
            <thead>
              <tr>
                <Th>Data</Th>
                <Th>Pessoa</Th>
                <Th>Programa</Th>
                <Th>Tipo</Th>
                <Th>Cliente / trecho</Th>
                <Th alinhar="direita">Pontos</Th>
                <Th alinhar="direita">CMP</Th>
                <Th alinhar="direita">Custo</Th>
                <Th alinhar="direita">Venda</Th>
                <Th alinhar="direita">Lucro</Th>
              </tr>
            </thead>
            <tbody>
              {linhas.map(({ s, cmp, custo, lucro, provisorio }) => (
                <tr key={s.id} className="hover:bg-slate-50">
                  <Td>
                    <Link href={`/saidas/${s.id}`} className="font-medium text-marca-700 hover:underline">
                      {formatarData(s.data)}
                    </Link>
                  </Td>
                  <Td>{s.titular.nome}</Td>
                  <Td>{s.programa.nome}</Td>
                  <Td>
                    <Etiqueta tom={s.tipo === 'VENDA' ? 'verde' : s.tipo === 'USO_PESSOAL' ? 'roxo' : 'cinza'}>
                      {rotulo(TIPOS_SAIDA, s.tipo)}
                    </Etiqueta>
                  </Td>
                  <Td>
                    {s.cliente ?? s.observacao ?? '-'}
                    {(s.origem || s.destino) && (
                      <span className="block text-xs text-slate-400">
                        {s.origem ?? '?'} → {s.destino ?? '?'}
                        {s.localizador && ` · ${s.localizador}`}
                      </span>
                    )}
                  </Td>
                  <Td alinhar="direita">{formatarPontos(s.pontos)}</Td>
                  <Td alinhar="direita">
                    {formatarCmp(cmp)}
                    {provisorio && (
                      <span className="block text-xs text-amber-700" title="Usa pontos de um trimestre que ainda não fechou">
                        provisório
                      </span>
                    )}
                  </Td>
                  <Td alinhar="direita">
                    <Dinheiro centavos={custo} />
                  </Td>
                  <Td alinhar="direita">{s.tipo === 'VENDA' ? <Dinheiro centavos={s.valorVenda} /> : '-'}</Td>
                  <Td alinhar="direita">{s.tipo === 'VENDA' ? <Dinheiro centavos={lucro} colorir /> : '-'}</Td>
                </tr>
              ))}
            </tbody>
          </Tabela>
        )}
      </Cartao>
    </>
  )
}
