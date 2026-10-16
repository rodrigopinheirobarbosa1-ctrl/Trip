import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { listasLancamento } from '@/lib/dados'
import { centavosParaCampo, dataParaCampo, formatarPontos } from '@/lib/formatos'
import { Cabecalho, Cartao } from '@/components/ui'
import { BotaoExcluir } from '@/components/excluir'
import { FormularioEntrada } from '../formulario'
import { excluirEntrada, salvarEntrada } from '../actions'

export default async function EditarEntrada({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const e = await db.entrada.findUnique({ where: { id } })
  if (!e) notFound()
  const listas = await listasLancamento({
    titulares: [e.titularId],
    programas: [e.programaId],
    cartoes: e.cartaoId ? [e.cartaoId] : [],
  })

  return (
    <>
      <Cabecalho
        titulo="Alterar entrada"
        descricao={e.criadoPor ? `Lançada por ${e.criadoPor} em ${e.criadoEm.toLocaleDateString('pt-BR')}` : undefined}
      />
      <Cartao className="max-w-3xl">
        <FormularioEntrada
          acao={salvarEntrada.bind(null, e.id)}
          novo={false}
          {...listas}
          valores={{
            data: dataParaCampo(e.data),
            titularId: e.titularId,
            programaId: e.programaId,
            categoria: e.categoria,
            pontos: formatarPontos(e.pontos),
            valor: e.valor ? centavosParaCampo(e.valor) : '',
            formaPagamento: e.formaPagamento,
            parcelas: String(e.parcelas),
            cartaoId: e.cartaoId ?? '',
            observacao: e.observacao ?? '',
          }}
        />
      </Cartao>
      <div className="mt-6 max-w-3xl">
        <BotaoExcluir acao={excluirEntrada.bind(null, e.id)} pergunta="Excluir esta entrada? Os saldos serão recalculados." />
      </div>
    </>
  )
}
