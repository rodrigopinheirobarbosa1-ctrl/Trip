import { db } from '@/lib/db'
import { Cabecalho, Cartao, Etiqueta, Tabela, Td, Th, Vazio } from '@/components/ui'
import { BotaoAcao, BotaoEnviar, Formulario } from '@/components/form'
import { Texto } from '@/components/campos'
import { alternarCartao, criarCartao } from './actions'

export default async function Cartoes() {
  const cartoes = await db.cartao.findMany({
    orderBy: [{ ativo: 'desc' }, { nome: 'asc' }],
    include: { _count: { select: { entradas: true } } },
  })

  return (
    <>
      <Cabecalho titulo="Cartões" descricao="Cartões usados para pagar as compras de pontos (para saber onde está cada parcela)." />
      <div className="grid gap-6 lg:grid-cols-3">
        <Cartao titulo="Cadastrados" className="lg:col-span-2">
          {cartoes.length === 0 ? (
            <Vazio texto="Nenhum cartão cadastrado ainda." />
          ) : (
            <Tabela>
              <thead>
                <tr>
                  <Th>Cartão</Th>
                  <Th>Final / descrição</Th>
                  <Th alinhar="direita">Compras</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {cartoes.map((c) => (
                  <tr key={c.id}>
                    <Td>
                      <span className="font-medium">{c.nome}</span> {!c.ativo && <Etiqueta>Inativo</Etiqueta>}
                    </Td>
                    <Td>{c.final ?? '-'}</Td>
                    <Td alinhar="direita">{c._count.entradas}</Td>
                    <Td alinhar="direita">
                      <form action={alternarCartao.bind(null, c.id)}>
                        <BotaoAcao>{c.ativo ? 'Desativar' : 'Reativar'}</BotaoAcao>
                      </form>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Tabela>
          )}
        </Cartao>
        <Cartao titulo="Novo cartão">
          <Formulario action={criarCartao} limparAoSalvar className="space-y-4">
            <Texto rotulo="Nome" nome="nome" obrigatorio placeholder="Ex.: Itaú Azul Infinite" />
            <Texto rotulo="Final / descrição (opcional)" nome="final" placeholder="Ex.: 6106" />
            <BotaoEnviar>Cadastrar</BotaoEnviar>
          </Formulario>
        </Cartao>
      </div>
    </>
  )
}
