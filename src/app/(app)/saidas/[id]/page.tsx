import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { carregarCarteira, listasLancamento, saldosParaFormulario } from '@/lib/dados'
import { centavosParaCampo, dataParaCampo, formatarPontos } from '@/lib/formatos'
import { Cabecalho, Cartao } from '@/components/ui'
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
      <div className="mt-6 max-w-4xl">
        <BotaoExcluir acao={excluirSaida.bind(null, s.id)} pergunta="Excluir esta emissão? Os pontos voltam para o saldo." />
      </div>
    </>
  )
}
