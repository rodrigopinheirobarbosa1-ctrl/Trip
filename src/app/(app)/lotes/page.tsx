import Link from '@/components/link'
import { db } from '@/lib/db'
import { carregarCarteira, carregarNomes } from '@/lib/dados'
import { rotuloTrimestre, trimestreDe } from '@/lib/carteira'
import { formatarCmp, formatarData, formatarPercentual, formatarPontos, hoje } from '@/lib/formatos'
import { CATEGORIAS_ENTRADA, rotulo } from '@/lib/rotulos'
import { FiltrosAutomaticos } from '@/components/form'
import { Aviso, Cabecalho, Cartao, Dinheiro, Tabela, Td, Th, Vazio } from '@/components/ui'

export default async function Lotes({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { titular: titularId, programa: programaId, esgotados } = await searchParams
  const mostrarEsgotados = esgotados === 'sim'
  const [nomes, carteira] = await Promise.all([carregarNomes(), carregarCarteira()])

  const linhas = [...carteira.lotes.entries()]
    .flatMap(([chave, lotes]) => {
      const [t, p] = chave.split('|')
      return lotes.map((l) => ({ ...l, titularId: t, programaId: p }))
    })
    .filter((l) => (!titularId || l.titularId === titularId) && (!programaId || l.programaId === programaId))
    .filter((l) => mostrarEsgotados || l.restantes > 0)
    .sort(
      (a, b) =>
        (nomes.programa.get(a.programaId)?.nome ?? '').localeCompare(nomes.programa.get(b.programaId)?.nome ?? '') ||
        (nomes.titular.get(a.titularId)?.nome ?? '').localeCompare(nomes.titular.get(b.titularId)?.nome ?? '') ||
        a.data.getTime() - b.data.getTime(),
    )

  // Descrição de cada lote, a partir do lançamento que o criou.
  const [entradas, transferencias] = await Promise.all([
    db.entrada.findMany({ where: { id: { in: linhas.filter((l) => l.origem === 'ENTRADA').map((l) => l.id) } } }),
    db.transferencia.findMany({
      where: { id: { in: linhas.filter((l) => l.origem === 'TRANSFERENCIA').map((l) => l.id) } },
      include: { origem: true },
    }),
  ])
  const ent = new Map(entradas.map((e) => [e.id, e]))
  const tra = new Map(transferencias.map((t) => [t.id, t]))
  const descrever = (l: (typeof linhas)[number]) => {
    if (l.origem === 'ENTRADA') {
      const e = ent.get(l.id)
      return {
        texto: [rotulo(CATEGORIAS_ENTRADA, e?.categoria), e?.observacao].filter(Boolean).join(' · '),
        link: `/entradas/${l.id}`,
      }
    }
    const t = tra.get(l.id)
    return {
      texto: `Transferência de ${t?.origem.nome ?? '?'}${t ? ` (bônus ${formatarPercentual(t.bonusPercentual)})` : ''}`,
      link: `/transferencias/${l.id}`,
    }
  }

  const disponiveis = linhas.filter((l) => l.restantes > 0)
  const totalPontos = disponiveis.reduce((s, l) => s + l.restantes, 0)
  const totalCusto = disponiveis.reduce((s, l) => s + (l.cmp * l.restantes) / 1000, 0)
  const diaHoje = hoje().getTime()
  const trimestreAtual = trimestreDe(hoje())

  return (
    <>
      <Cabecalho
        titulo="Lotes de pontos"
        descricao="Tudo o que entra num programa no mesmo trimestre (compras, clube, bônus, transferências recebidas) tem o custo médio do trimestre. As saídas usam primeiro os lotes mais antigos (PEPS)."
      />

      <FiltrosAutomaticos className="cartao mb-4 grid gap-3 p-4 sm:grid-cols-3 nao-imprimir">
        <label className="block">
          <span className="rotulo">Pessoa</span>
          <select name="titular" defaultValue={titularId ?? ''} className="campo">
            <option value="">Todas</option>
            {nomes.titulares.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nome}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="rotulo">Programa</span>
          <select name="programa" defaultValue={programaId ?? ''} className="campo">
            <option value="">Todos</option>
            {nomes.programas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="rotulo">Mostrar</span>
          <select name="esgotados" defaultValue={mostrarEsgotados ? 'sim' : ''} className="campo">
            <option value="">Só lotes com pontos</option>
            <option value="sim">Também os já usados</option>
          </select>
        </label>
      </FiltrosAutomaticos>

      <Cartao>
        {linhas.length === 0 ? (
          <Vazio texto="Nenhum lote com estes filtros." />
        ) : (
          <Tabela>
            <thead>
              <tr>
                <Th>Programa</Th>
                <Th>Pessoa</Th>
                <Th>Data</Th>
                <Th>Origem</Th>
                <Th alinhar="direita">Pontos do lote</Th>
                <Th alinhar="direita">Já usados</Th>
                <Th alinhar="direita">Disponíveis</Th>
                <Th>Trimestre</Th>
                <Th alinhar="direita">Custo próprio</Th>
                <Th alinhar="direita">CMP (média do tri)</Th>
                <Th alinhar="direita">Custo disponível</Th>
                <Th alinhar="direita">Idade</Th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l, i) => {
                const d = descrever(l)
                const usados = l.pontos - l.restantes
                const dias = Math.round((diaHoje - l.data.getTime()) / 86400000)
                return (
                  <tr key={`${l.id}-${l.programaId}-${i}`} className={l.restantes === 0 ? 'text-slate-400' : 'hover:bg-slate-50'}>
                    <Td className="font-medium">{nomes.programa.get(l.programaId)?.nome}</Td>
                    <Td>
                      <Link href={`/extrato?titular=${l.titularId}&programa=${l.programaId}`} className="hover:underline">
                        {nomes.titular.get(l.titularId)?.nome}
                      </Link>
                    </Td>
                    <Td>
                      <Link href={d.link} className="font-medium text-marca-700 hover:underline">
                        {formatarData(l.data)}
                      </Link>
                    </Td>
                    <Td className="max-w-[18rem]">
                      {d.texto || '-'}
                      {l.cobriuDeficit > 0 && (
                        <span className="block text-xs text-amber-700">
                          {formatarPontos(l.cobriuDeficit)} pontos cobriram saídas feitas antes deste lote
                        </span>
                      )}
                    </Td>
                    <Td alinhar="direita">{formatarPontos(l.pontos)}</Td>
                    <Td alinhar="direita">{usados ? formatarPontos(usados) : '-'}</Td>
                    <Td alinhar="direita" className="font-semibold">
                      {formatarPontos(l.restantes)}
                    </Td>
                    <Td className="whitespace-nowrap">
                      {l.naMedia ? rotuloTrimestre(l.trimestre) : 'fora da média'}
                      {l.naMedia && l.trimestre >= trimestreAtual && (
                        <span className="block text-xs text-amber-700">aberto: média provisória</span>
                      )}
                    </Td>
                    <Td alinhar="direita">{formatarCmp(l.pontos > 0 ? (l.custoProprio / l.pontos) * 1000 : null)}</Td>
                    <Td alinhar="direita">{formatarCmp(l.cmp)}</Td>
                    <Td alinhar="direita">
                      <Dinheiro centavos={(l.cmp * l.restantes) / 1000} />
                    </Td>
                    <Td alinhar="direita">{dias} dias</Td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="font-semibold">
                <Td>Disponível</Td>
                <Td />
                <Td />
                <Td>{disponiveis.length} lote(s)</Td>
                <Td />
                <Td />
                <Td alinhar="direita">{formatarPontos(totalPontos)}</Td>
                <Td />
                <Td />
                <Td alinhar="direita">{formatarCmp(totalPontos ? (totalCusto / totalPontos) * 1000 : null)}</Td>
                <Td alinhar="direita">
                  <Dinheiro centavos={totalCusto} />
                </Td>
                <Td />
              </tr>
            </tfoot>
          </Tabela>
        )}
      </Cartao>

      <div className="mt-4">
        <Aviso>
          Dentro de cada trimestre, todos os lotes têm o mesmo custo: a média do que entrou no trimestre inteiro (o
          &quot;custo próprio&quot; é o do lançamento, antes da média). Assim o bônus do clube divide o custo com as
          mensalidades. Saldo inicial e ajustes ficam fora da média. Entre trimestres vale o PEPS: a próxima venda ou
          transferência usa primeiro os pontos do trimestre mais antigo. Enquanto o trimestre está aberto, a média é
          provisória e muda quando entram novos pontos.
        </Aviso>
      </div>
    </>
  )
}
