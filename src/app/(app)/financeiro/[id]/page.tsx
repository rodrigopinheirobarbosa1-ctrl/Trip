import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { listasLancamento } from '@/lib/dados'
import { centavosParaCampo, dataParaCampo } from '@/lib/formatos'
import { Cabecalho, Cartao } from '@/components/ui'
import { BotaoExcluir } from '@/components/excluir'
import { FormularioMovimento } from '../formulario'
import { excluirMovimento, salvarMovimento } from '../actions'

export default async function EditarMovimento({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const m = await db.movimentoFinanceiro.findUnique({ where: { id } })
  if (!m) notFound()
  const { titulares } = await listasLancamento({ titulares: m.titularId ? [m.titularId] : [] })

  return (
    <>
      <Cabecalho titulo="Alterar lançamento" />
      <Cartao className="max-w-lg">
        <FormularioMovimento
          acao={salvarMovimento.bind(null, m.id)}
          titulares={titulares}
          valores={{
            data: dataParaCampo(m.data),
            tipo: m.tipo,
            titularId: m.titularId ?? '',
            valor: centavosParaCampo(m.valor),
            descricao: m.descricao,
          }}
        />
      </Cartao>
      <div className="mt-6 max-w-lg">
        <BotaoExcluir acao={excluirMovimento.bind(null, m.id)} pergunta="Excluir este lançamento?" />
      </div>
    </>
  )
}
