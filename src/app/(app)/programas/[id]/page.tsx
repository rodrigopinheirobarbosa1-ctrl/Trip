import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { centavosParaCampo } from '@/lib/formatos'
import { opcoes, TIPOS_PROGRAMA } from '@/lib/rotulos'
import { Cabecalho, Cartao } from '@/components/ui'
import { BotaoEnviar, Formulario } from '@/components/form'
import { Caixa, Selecao, Texto } from '@/components/campos'
import { salvarPrograma } from '../actions'

export default async function EditarPrograma({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const p = await db.programa.findUnique({ where: { id } })
  if (!p) notFound()

  return (
    <>
      <Cabecalho titulo={p.nome} descricao="Alterar o cadastro do programa." />
      <Cartao className="max-w-lg">
        <Formulario action={salvarPrograma.bind(null, p.id)} className="space-y-4">
          <Texto rotulo="Nome" nome="nome" obrigatorio valor={p.nome} />
          <Selecao rotulo="Tipo" nome="tipo" obrigatorio valor={p.tipo} opcoes={opcoes(TIPOS_PROGRAMA)} />
          <Texto
            rotulo="Preço de venda do milheiro (R$, opcional)"
            nome="valorMilheiro"
            modo="decimal"
            valor={p.valorMilheiro !== null ? centavosParaCampo(p.valorMilheiro) : ''}
          />
          <Texto
            rotulo="Custo atribuído aos pontos de parceiros (R$ por milheiro, opcional)"
            nome="custoParceiroMilheiro"
            modo="decimal"
            placeholder="Ex.: 31,00"
            valor={p.custoParceiroMilheiro !== null ? centavosParaCampo(p.custoParceiroMilheiro) : ''}
            dica="Pontos ganhos em compras de parceiros (Uber, Amazon, Insider...) lançados como “Acúmulo em parceiro” sem valor recebem este custo. Não sai do caixa. Bônus do programa e pontos do cartão continuam sem custo."
          />
          <Caixa rotulo="Ativo (aparece nas listas de lançamento)" nome="ativo" marcado={p.ativo} />
          <BotaoEnviar>Salvar</BotaoEnviar>
        </Formulario>
      </Cartao>
    </>
  )
}
