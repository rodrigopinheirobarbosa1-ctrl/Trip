import Link from '@/components/link'
import { exigirUsuario } from '@/lib/auth'
import { carregarCarteira, carregarNomes } from '@/lib/dados'
import { chavePosicao } from '@/lib/carteira'
import { carregarConferencias, ROTULO_SITUACAO, situacaoConferencia, type SituacaoConferencia } from '@/lib/conferencias'
import { dataParaCampo, formatarData, formatarPontos, hoje } from '@/lib/formatos'
import { BotaoEnviar, Formulario } from '@/components/form'
import { Aviso, Cabecalho, Cartao, Etiqueta, Tabela, Td, Th, Vazio } from '@/components/ui'
import { marcarConferidaAction } from './actions'

const TOM: Record<SituacaoConferencia, 'verde' | 'amarelo' | 'vermelho' | 'cinza'> = {
  EM_DIA: 'verde',
  MUDOU_DEPOIS: 'amarelo',
  DIFERENTE: 'vermelho',
  NUNCA_CONFERIDA: 'cinza',
}

export default async function Conferencias() {
  await exigirUsuario()
  const [nomes, carteira, conferencias] = await Promise.all([carregarNomes(), carregarCarteira(), carregarConferencias()])

  // Contas com saldo, ou que já foram conferidas alguma vez (ex.: saldo zerado).
  const chaves = new Set<string>([
    ...[...carteira.posicoes.values()].filter((p) => p.pontos !== 0).map((p) => chavePosicao(p.titularId, p.programaId)),
    ...conferencias.keys(),
  ])
  const linhas = [...chaves]
    .map((k) => {
      const [titularId, programaId] = k.split('|')
      const pontos = carteira.posicoes.get(k)?.pontos ?? 0
      const c = conferencias.get(k)
      return {
        k, titularId, programaId, pontos, c,
        situacao: situacaoConferencia(c, pontos),
        pessoa: nomes.titular.get(titularId)?.nome ?? '',
        programa: nomes.programa.get(programaId)?.nome ?? '',
      }
    })
    .sort((a, b) => a.pessoa.localeCompare(b.pessoa) || a.programa.localeCompare(b.programa))

  const conta = (s: SituacaoConferencia) => linhas.filter((l) => l.situacao === s).length
  const dataHoje = dataParaCampo(hoje())

  return (
    <>
      <Cabecalho
        titulo="Conferência de saldos"
        descricao="Quando o saldo de cada conta foi conferido no app do programa. Marque depois de olhar o saldo no app."
      />
      <div className="mb-4 flex flex-wrap gap-2">
        {(Object.keys(ROTULO_SITUACAO) as SituacaoConferencia[]).map((s) => (
          <Etiqueta key={s} tom={TOM[s]}>
            {ROTULO_SITUACAO[s]}: {conta(s)}
          </Etiqueta>
        ))}
      </div>
      <Cartao>
        {linhas.length === 0 ? (
          <Vazio texto="Nenhuma conta com saldo." />
        ) : (
          <Tabela>
            <thead>
              <tr>
                <Th>Pessoa</Th>
                <Th>Programa</Th>
                <Th alinhar="direita">Saldo no Trip</Th>
                <Th>Conferido em</Th>
                <Th alinhar="direita">Saldo no app</Th>
                <Th>Situação</Th>
                <Th>Marcar conferida</Th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={l.k} className="align-top hover:bg-slate-50">
                  <Td>{l.pessoa}</Td>
                  <Td>
                    <Link href={`/extrato?titular=${l.titularId}&programa=${l.programaId}`} className="text-marca-700 hover:underline">
                      {l.programa}
                    </Link>
                  </Td>
                  <Td alinhar="direita">{formatarPontos(l.pontos)}</Td>
                  <Td>
                    {l.c ? formatarData(l.c.conferidoEm) : '—'}
                    {l.c && <div className="text-xs text-slate-500">por {l.c.registradoPor}</div>}
                  </Td>
                  <Td alinhar="direita">{l.c ? formatarPontos(l.c.saldoConferido) : '—'}</Td>
                  <Td>
                    <Etiqueta tom={TOM[l.situacao]}>{ROTULO_SITUACAO[l.situacao]}</Etiqueta>
                    {l.c && l.c.lancamentosDepois > 0 && (
                      <div className="text-xs text-slate-500">
                        {l.c.lancamentosDepois} lançamento{l.c.lancamentosDepois > 1 ? 's' : ''} depois
                      </div>
                    )}
                  </Td>
                  <Td>
                    <Formulario action={marcarConferidaAction} className="flex flex-wrap items-center gap-2">
                      <input type="hidden" name="titularId" value={l.titularId} />
                      <input type="hidden" name="programaId" value={l.programaId} />
                      <input type="date" name="data" defaultValue={dataHoje} max={dataHoje} required className="campo w-36" aria-label="Data da conferência" />
                      <input
                        type="text"
                        name="saldo"
                        inputMode="numeric"
                        defaultValue={formatarPontos(l.pontos)}
                        required
                        className="campo w-28"
                        aria-label="Saldo no app"
                      />
                      <BotaoEnviar variante="secundario">Marcar</BotaoEnviar>
                    </Formulario>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Tabela>
        )}
      </Cartao>
      <div className="mt-4">
        <Aviso>
          <strong>Em dia</strong>: o saldo do Trip é o que o app mostrava e nada foi lançado depois. <strong>Mudou depois</strong>: houve
          lançamentos com data posterior à conferência. <strong>Diferente do app</strong>: o saldo do Trip não bate com o que foi visto no
          app. A data também aparece para o Claude e outras aplicações pela ligação com o Claude.
        </Aviso>
      </div>
    </>
  )
}
