import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { carregarCarteira, listasLancamento, saldosParaFormulario } from '@/lib/dados'
import { calcularPontosDestino } from '@/lib/carteira'
import Link from '@/components/link'
import { dataParaCampo, formatarData, formatarPontos, formatarReais } from '@/lib/formatos'
import { Aviso, Cabecalho, Cartao } from '@/components/ui'
import { BotaoExcluir } from '@/components/excluir'
import { FormularioTransferencia } from '../formulario'
import { excluirTransferencia, salvarTransferencia } from '../actions'

export default async function EditarTransferencia({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const t = await db.transferencia.findUnique({ where: { id }, include: { compra: true } })
  if (!t) notFound()
  const [listas, saldos, carteira, origem] = await Promise.all([
    listasLancamento({ titulares: [t.titularId], programas: [t.origemId, t.destinoId] }),
    saldosParaFormulario(),
    carregarCarteira(),
    db.programa.findUnique({ where: { id: t.origemId } }),
  ])
  const faltou = carteira.custoTransferencias.get(t.id)?.semLote ?? 0
  const provisorio = carteira.custoTransferencias.get(t.id)?.provisorio ?? false

  return (
    <>
      <Cabecalho
        titulo="Alterar transferência"
        descricao={t.criadoPor ? `Lançada por ${t.criadoPor} em ${t.criadoEm.toLocaleDateString('pt-BR')}` : undefined}
      />
      {provisorio && (
        <div className="mb-4 max-w-3xl">
          <Aviso tom="amarelo">
            Custo provisório: parte dos pontos que saíram da {origem?.nome} é de um trimestre que ainda não fechou. O custo
            levado para o destino é a média do trimestre até agora e muda se entrarem mais pontos nele.
          </Aviso>
        </div>
      )}
      {faltou > 0 && (
        <div className="mb-4 max-w-3xl">
          <Aviso tom="vermelho">
            Faltaram <strong>{formatarPontos(faltou)} pontos</strong> na {origem?.nome} nesta data: ela só tinha{' '}
            {formatarPontos(t.pontos - faltou)} dos {formatarPontos(t.pontos)} que saíram. Esses pontos foram custeados pelo último
            custo conhecido, então o custo levado e o CMP no destino ficam abaixo do real. Lance, com data anterior a{' '}
            {formatarData(t.data)}, as entradas que faltam na {origem?.nome} (ou importe o extrato dela).{' '}
            <Link href={`/extrato?titular=${t.titularId}&programa=${t.origemId}`} className="font-semibold underline">
              Ver extrato da origem
            </Link>
          </Aviso>
        </div>
      )}
      {t.compra && (
        <p className="mb-4 max-w-3xl rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
          Transferência imediata, com a compra de{' '}
          <Link href={`/entradas/${t.compra.id}`} className="font-semibold underline">
            {formatarPontos(t.compra.pontos)} pontos em {formatarData(t.compra.data)} por {formatarReais(t.compra.valor)}
          </Link>
          : esses pontos saem primeiro.
        </p>
      )}
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
            imediata: Boolean(t.compraId),
          }}
        />
      </Cartao>
      <div className="mt-6 max-w-3xl">
        <BotaoExcluir acao={excluirTransferencia.bind(null, t.id)} pergunta="Excluir esta transferência? Os saldos serão recalculados." />
      </div>
    </>
  )
}
