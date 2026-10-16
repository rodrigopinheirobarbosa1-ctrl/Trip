import Link from '@/components/link'
import { db } from '@/lib/db'
import { carregarCarteira, carregarNomes } from '@/lib/dados'
import { chavePosicao } from '@/lib/carteira'
import { formatarCmp, formatarData, formatarPontos } from '@/lib/formatos'
import { CATEGORIAS_ENTRADA, rotulo, TIPOS_SAIDA } from '@/lib/rotulos'
import { FiltrosAutomaticos } from '@/components/form'
import { Aviso, Cabecalho, Cartao, Dinheiro, Tabela, Td, Th, Vazio } from '@/components/ui'

export default async function Extrato({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { titular: titularId, programa: programaId } = await searchParams
  const [nomes, carteira] = await Promise.all([carregarNomes(), carregarCarteira()])

  const filtros = (
    <FiltrosAutomaticos className="cartao mb-4 grid gap-3 p-4 sm:grid-cols-2 nao-imprimir">
      <label className="block">
        <span className="rotulo">Pessoa</span>
        <select name="titular" defaultValue={titularId ?? ''} className="campo">
          <option value="">Selecione</option>
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
          <option value="">Todos (resumo)</option>
          {nomes.programas.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome}
            </option>
          ))}
        </select>
      </label>
    </FiltrosAutomaticos>
  )

  const cabecalho = (
    <Cabecalho titulo="Extrato" descricao="Cada movimento de pontos, com o saldo e o custo médio (CMP) logo depois dele." />
  )

  if (!titularId) {
    return (
      <>
        {cabecalho}
        {filtros}
        <Cartao>
          <Vazio texto="Escolha uma pessoa para ver o extrato." />
        </Cartao>
      </>
    )
  }

  // Só a pessoa: resumo por programa, com link para o extrato de cada um.
  if (!programaId) {
    const posicoes = [...carteira.posicoes.values()]
      .filter((p) => p.titularId === titularId)
      .sort((a, b) => (nomes.programa.get(a.programaId)?.nome ?? '').localeCompare(nomes.programa.get(b.programaId)?.nome ?? ''))
    return (
      <>
        {cabecalho}
        {filtros}
        <Cartao titulo={`Programas de ${nomes.titular.get(titularId)?.nome ?? ''}`}>
          {posicoes.length === 0 ? (
            <Vazio texto="Nenhum lançamento para esta pessoa." />
          ) : (
            <Tabela>
              <thead>
                <tr>
                  <Th>Programa</Th>
                  <Th alinhar="direita">Saldo</Th>
                  <Th alinhar="direita">CMP</Th>
                  <Th alinhar="direita">Custo do saldo</Th>
                </tr>
              </thead>
              <tbody>
                {posicoes.map((p) => (
                  <tr key={p.programaId} className="hover:bg-slate-50">
                    <Td>
                      <Link href={`/extrato?titular=${titularId}&programa=${p.programaId}`} className="font-medium text-marca-700 hover:underline">
                        {nomes.programa.get(p.programaId)?.nome}
                      </Link>
                    </Td>
                    <Td alinhar="direita" className={p.pontos < 0 ? 'text-red-700' : ''}>
                      {formatarPontos(p.pontos)}
                    </Td>
                    <Td alinhar="direita">{formatarCmp(p.cmp)}</Td>
                    <Td alinhar="direita">
                      <Dinheiro centavos={p.custo} />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Tabela>
          )}
        </Cartao>
      </>
    )
  }

  const linhas = carteira.extratos.get(chavePosicao(titularId, programaId)) ?? []
  const posicao = carteira.posicoes.get(chavePosicao(titularId, programaId))

  // Descrição de cada linha, buscada nos lançamentos originais.
  const ids = (tipo: string) => linhas.filter((l) => l.tipo.startsWith(tipo)).map((l) => l.id)
  const [entradas, transferencias, saidas] = await Promise.all([
    db.entrada.findMany({ where: { id: { in: ids('ENTRADA') } } }),
    db.transferencia.findMany({ where: { id: { in: ids('TRANSFERENCIA') } }, include: { origem: true, destino: true } }),
    db.saida.findMany({ where: { id: { in: ids('SAIDA') } } }),
  ])
  const ent = new Map(entradas.map((e) => [e.id, e]))
  const tra = new Map(transferencias.map((t) => [t.id, t]))
  const sai = new Map(saidas.map((s) => [s.id, s]))

  const descrever = (l: (typeof linhas)[number]): { texto: string; link: string } => {
    if (l.tipo === 'ENTRADA') {
      const e = ent.get(l.id)
      return { texto: [rotulo(CATEGORIAS_ENTRADA, e?.categoria), e?.observacao].filter(Boolean).join(' · '), link: `/entradas/${l.id}` }
    }
    if (l.tipo === 'TRANSFERENCIA_ENVIADA') {
      const t = tra.get(l.id)
      return { texto: `Transferência para ${t?.destino.nome}`, link: `/transferencias/${l.id}` }
    }
    if (l.tipo === 'TRANSFERENCIA_RECEBIDA') {
      const t = tra.get(l.id)
      return { texto: `Transferência de ${t?.origem.nome} (bônus ${t?.bonusPercentual}%)`, link: `/transferencias/${l.id}` }
    }
    const s = sai.get(l.id)
    return { texto: [rotulo(TIPOS_SAIDA, s?.tipo), s?.cliente, s?.observacao].filter(Boolean).join(' · '), link: `/saidas/${l.id}` }
  }

  return (
    <>
      {cabecalho}
      {filtros}
      {posicao && posicao.menorSaldo < 0 && (
        <div className="mb-4">
          <Aviso tom="amarelo">
            O saldo ficou negativo em {formatarData(posicao.ficouNegativoEm)}. As linhas em vermelho mostram onde saíram mais
            pontos do que havia. Normalmente falta lançar uma entrada antes dessa data, ou a data de algum lançamento está errada.
          </Aviso>
        </div>
      )}
      <Cartao titulo={`${nomes.programa.get(programaId)?.nome ?? ''} de ${nomes.titular.get(titularId)?.nome ?? ''}`}>
        {linhas.length === 0 ? (
          <Vazio texto="Nenhum movimento." />
        ) : (
          <Tabela>
            <thead>
              <tr>
                <Th>Data</Th>
                <Th>Movimento</Th>
                <Th alinhar="direita">Pontos</Th>
                <Th alinhar="direita">Custo</Th>
                <Th alinhar="direita">Saldo</Th>
                <Th alinhar="direita">CMP depois</Th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l, i) => {
                const d = descrever(l)
                return (
                  <tr key={`${l.id}-${i}`} className={l.saldo < 0 ? 'bg-red-50' : 'hover:bg-slate-50'}>
                    <Td>
                      <Link href={d.link} className="font-medium text-marca-700 hover:underline">
                        {formatarData(l.data)}
                      </Link>
                    </Td>
                    <Td>{d.texto || '-'}</Td>
                    <Td alinhar="direita" className={l.pontos < 0 ? 'text-red-700' : 'text-emerald-700'}>
                      {l.pontos > 0 ? '+' : ''}
                      {formatarPontos(l.pontos)}
                    </Td>
                    <Td alinhar="direita">
                      <Dinheiro centavos={l.custo} />
                    </Td>
                    <Td alinhar="direita" className={`font-semibold ${l.saldo < 0 ? 'text-red-700' : ''}`}>
                      {formatarPontos(l.saldo)}
                    </Td>
                    <Td alinhar="direita">{formatarCmp(l.cmp)}</Td>
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
