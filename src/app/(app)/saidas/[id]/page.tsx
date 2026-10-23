import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { carregarCarteira, listasLancamento, saldosParaFormulario } from '@/lib/dados'
import { rotuloTrimestre } from '@/lib/carteira'
import { centavosParaCampo, dataParaCampo, formatarCmp, formatarData, formatarPontos } from '@/lib/formatos'
import { Aviso, Cabecalho, Cartao, Dinheiro, Tabela, Td, Th } from '@/components/ui'
import { BotaoExcluir } from '@/components/excluir'
import { FormularioSaida } from '../formulario'
import { excluirSaida, salvarSaida } from '../actions'

export default async function EditarSaida({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const s = await db.saida.findUnique({ where: { id } })
  if (!s) notFound()
  const [listas, saldos, carteira] = await Promise.all([
    listasLancamento({ titulares: [s.titularId], programas: [s.programaId] }),
    saldosParaFormulario(),
    carregarCarteira(),
  ])
  const campoValor = (c: number) => (c ? centavosParaCampo(c) : '')
  const consumo = carteira.custoSaidas.get(s.id)

  return (
    <>
      <Cabecalho
        titulo="Alterar emissão / venda"
        descricao={s.criadoPor ? `Lançada por ${s.criadoPor} em ${s.criadoEm.toLocaleDateString('pt-BR')}` : undefined}
      />
      <Cartao className="max-w-4xl">
        <FormularioSaida
          acao={salvarSaida.bind(null, s.id)}
          novo={false}
          titulares={listas.titulares}
          programas={listas.programas}
          saldos={saldos}
          cmpDaOperacao={carteira.custoSaidas.get(s.id)?.cmp ?? null}
          valores={{
            data: dataParaCampo(s.data),
            titularId: s.titularId,
            programaId: s.programaId,
            tipo: s.tipo,
            pontos: formatarPontos(s.pontos),
            taxaEmbarque: campoValor(s.taxaEmbarque),
            valorVenda: campoValor(s.valorVenda),
            fornecedor: s.fornecedor ?? '',
            cliente: s.cliente ?? '',
            localizador: s.localizador ?? '',
            dataIda: dataParaCampo(s.dataIda),
            dataVolta: dataParaCampo(s.dataVolta),
            passageiros: s.passageiros ? String(s.passageiros) : '',
            origem: s.origem ?? '',
            destino: s.destino ?? '',
            formaRecebimento: s.formaRecebimento ?? 'PIX',
            parcelas: String(s.parcelas),
            dataRecebimento: dataParaCampo(s.dataRecebimento),
            observacao: s.observacao ?? '',
          }}
        />
      </Cartao>
      {consumo && (
        <Cartao titulo="De onde saíram os pontos (lotes mais antigos primeiro)" className="mt-6 max-w-4xl">
          <Tabela>
            <thead>
              <tr>
                <Th>Lote de</Th>
                <Th>Trimestre</Th>
                <Th alinhar="direita">Pontos usados</Th>
                <Th alinhar="direita">CMP do lote</Th>
                <Th alinhar="direita">Custo</Th>
              </tr>
            </thead>
            <tbody>
              {consumo.lotes.map((l, i) => (
                <tr key={i}>
                  <Td>{formatarData(l.data)}</Td>
                  <Td>{l.naMedia ? rotuloTrimestre(l.trimestre) : 'fora da média'}</Td>
                  <Td alinhar="direita">{formatarPontos(l.pontos)}</Td>
                  <Td alinhar="direita">{formatarCmp(l.cmp)}</Td>
                  <Td alinhar="direita">
                    <Dinheiro centavos={l.custo} />
                  </Td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-semibold">
                <Td>Total</Td>
                <Td />
                <Td alinhar="direita">{formatarPontos(s.pontos)}</Td>
                <Td alinhar="direita">{formatarCmp(consumo.cmp)}</Td>
                <Td alinhar="direita">
                  <Dinheiro centavos={consumo.custo} />
                </Td>
              </tr>
            </tfoot>
          </Tabela>
          {consumo.provisorio && (
            <div className="mt-3">
              <Aviso tom="amarelo">
                Custo provisório: parte dos pontos é de um trimestre que ainda não fechou. O CMP do lote é a média do que
                entrou no trimestre até agora e muda se entrarem mais pontos (outra mensalidade, o bônus do clube).
              </Aviso>
            </div>
          )}
          {consumo.semLote > 0 && (
            <div className="mt-3">
              <Aviso tom="amarelo">
                {formatarPontos(consumo.semLote)} pontos saíram sem lote (faltava saldo nessa data) e foram custeados pelo
                último CMP conhecido. Lance a entrada que falta para o custo ficar exato.
              </Aviso>
            </div>
          )}
        </Cartao>
      )}
      <div className="mt-6 max-w-4xl">
        <BotaoExcluir acao={excluirSaida.bind(null, s.id)} pergunta="Excluir esta emissão? Os pontos voltam para o saldo." />
      </div>
    </>
  )
}
