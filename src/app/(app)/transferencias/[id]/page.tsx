import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { listasLancamento, saldosParaFormulario } from '@/lib/dados'
import { calcularPontosDestino } from '@/lib/carteira'
import { dataParaCampo, formatarPontos } from '@/lib/formatos'
import { Cabecalho, Cartao } from '@/components/ui'
import { BotaoExcluir } from '@/components/excluir'
import { FormularioTransferencia } from '../formulario'
import { excluirTransferencia, salvarTransferencia } from '../actions'

export default async function EditarTransferencia({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const t = await db.transferencia.findUnique({ where: { id } })
  if (!t) notFound()
  const [listas, saldos] = await Promise.all([
    listasLancamento({ titulares: [t.titularId], programas: [t.origemId, t.destinoId] }),
    saldosParaFormulario(),
  ])

  return (
    <>
      <Cabecalho
        titulo="Alterar transferência"
        descricao={t.criadoPor ? `Lançada por ${t.criadoPor} em ${t.criadoEm.toLocaleDateString('pt-BR')}` : undefined}
      />
      <Cartao className="max-w-3xl">
        <FormularioTransferencia
          acao={salvarTransferencia.bind(null, t.id)}
          novo={false}
          titulares={listas.titulares}
          programas={listas.programas}
          saldos={saldos}
          valores={{
            data: dataParaCampo(t.data),
            titularId: t.titularId,
            origemId: t.origemId,
            destinoId: t.destinoId,
            pontos: formatarPontos(t.pontos),
            bonusPercentual: String(t.bonusPercentual).replace('.', ','),
            // Vazio quando bate com o cálculo: assim, mudando pontos ou bônus, recalcula sozinho.
            pontosDestino:
              t.pontosDestino === calcularPontosDestino(t.pontos, t.bonusPercentual) ? '' : formatarPontos(t.pontosDestino),
            observacao: t.observacao ?? '',
          }}
        />
      </Cartao>
      <div className="mt-6 max-w-3xl">
        <BotaoExcluir acao={excluirTransferencia.bind(null, t.id)} pergunta="Excluir esta transferência? Os saldos serão recalculados." />
      </div>
    </>
  )
}
