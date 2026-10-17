import Link from '@/components/link'
import { db } from '@/lib/db'
import { anosDisponiveis, carregarCarteira, carregarNomes } from '@/lib/dados'
import { intervaloDatas, lerFiltros } from '@/lib/filtros'
import { formatarCmp, formatarData, formatarPercentual, formatarPontos } from '@/lib/formatos'
import { BarraFiltros } from '@/components/filtros'
import { Aviso, Cabecalho, Cartao, Dinheiro, LinkBotao, Tabela, Td, Th, Vazio } from '@/components/ui'

export default async function Transferencias({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const busca = await searchParams
  const anos = await anosDisponiveis()
  const filtros = lerFiltros(busca, anos[0] ?? null)
  const [nomes, carteira] = await Promise.all([carregarNomes(), carregarCarteira()])

  const programa = filtros.programa
  const lista = await db.transferencia.findMany({
    where: {
      titularId: filtros.titular ?? undefined,
      data: intervaloDatas(filtros),
      ...(programa ? { OR: [{ origemId: programa }, { destinoId: programa }] } : {}),
    },
    include: { titular: true, origem: true, destino: true },
    orderBy: [{ data: 'desc' }, { criadoEm: 'desc' }],
  })

  const semSaldo = lista.filter((t) => (carteira.custoTransferencias.get(t.id)?.semLote ?? 0) > 0).length

  return (
    <>
      <Cabecalho
        titulo="Transferências"
        descricao="Pontos levados de um programa para outro, com bônus. O custo vai junto. (Planilha: Lança Transf Ptos)"
        acoes={<LinkBotao href="/transferencias/nova" variante="primario">+ Nova transferência</LinkBotao>}
      />
      <BarraFiltros filtros={filtros} titulares={nomes.titulares} programas={nomes.programas} anos={anos} />
      {semSaldo > 0 && (
        <div className="mb-4">
          <Aviso tom="vermelho">
            <strong>{semSaldo} transferência(s)</strong> abaixo saíram com <strong>mais pontos do que a origem tinha</strong> na data
            (linhas em vermelho). Os pontos que faltaram foram custeados pelo último custo conhecido, então o custo levado e o CMP no
            destino ficam abaixo do real. Lance, com data anterior, as entradas que faltam na origem (ou importe o extrato dela). Veja
            também{' '}
            <Link href="/pendencias" className="font-semibold underline">
              Pendências
            </Link>
            .
          </Aviso>
        </div>
      )}
      <Cartao>
        {lista.length === 0 ? (
          <Vazio texto="Nenhuma transferência encontrada com estes filtros." />
        ) : (
          <Tabela>
            <thead>
              <tr>
                <Th>Data</Th>
                <Th>Pessoa</Th>
                <Th>De</Th>
                <Th alinhar="direita">Saem</Th>
                <Th>Para</Th>
                <Th alinhar="direita">Bônus</Th>
                <Th alinhar="direita">Chegam</Th>
                <Th alinhar="direita">CMP na origem</Th>
                <Th alinhar="direita">Custo levado</Th>
                <Th alinhar="direita">CMP no destino</Th>
              </tr>
            </thead>
            <tbody>
              {lista.map((t) => {
                const c = carteira.custoTransferencias.get(t.id)
                const faltou = c && c.semLote > 0 ? c.semLote : 0
                return (
                  <tr key={t.id} className={faltou ? 'bg-red-50/60 hover:bg-red-50' : 'hover:bg-slate-50'}>
                    <Td>
                      <Link href={`/transferencias/${t.id}`} className="font-medium text-marca-700 hover:underline">
                        {formatarData(t.data)}
                      </Link>
                    </Td>
                    <Td>{t.titular.nome}</Td>
                    <Td>{t.origem.nome}</Td>
                    <Td alinhar="direita">{formatarPontos(t.pontos)}</Td>
                    <Td>{t.destino.nome}</Td>
                    <Td alinhar="direita">{formatarPercentual(t.bonusPercentual)}</Td>
                    <Td alinhar="direita">{formatarPontos(t.pontosDestino)}</Td>
                    <Td alinhar="direita">{c ? formatarCmp(c.cmp) : '-'}</Td>
                    <Td alinhar="direita">
                      {c ? <Dinheiro centavos={c.custo} /> : '-'}
                      {faltou > 0 && (
                        <span className="block text-xs font-medium text-red-700" title="A origem não tinha esses pontos na data: o custo deles é um palpite.">
                          faltaram {formatarPontos(faltou)} na origem
                        </span>
                      )}
                    </Td>
                    <Td alinhar="direita">
                      {c && t.pontosDestino > 0 ? formatarCmp((c.custo / t.pontosDestino) * 1000) : '-'}
                      {faltou > 0 && <span className="block text-xs text-red-700">não confiável</span>}
                    </Td>
                  </tr>
                )
              })}
            </tbody>
          </Tabela>
        )}
      </Cartao>
    </>
  )
}
