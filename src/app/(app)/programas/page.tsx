import Link from '@/components/link'
import { db } from '@/lib/db'
import { formatarReais } from '@/lib/formatos'
import { opcoes, rotulo, TIPOS_PROGRAMA } from '@/lib/rotulos'
import { Cabecalho, Cartao, Etiqueta, Tabela, Td, Th, Vazio } from '@/components/ui'
import { BotaoEnviar, Formulario } from '@/components/form'
import { Selecao, Texto } from '@/components/campos'
import { criarPrograma } from './actions'

export default async function Programas() {
  const programas = await db.programa.findMany({ orderBy: [{ ativo: 'desc' }, { tipo: 'asc' }, { nome: 'asc' }] })

  return (
    <>
      <Cabecalho titulo="Programas" descricao="Programas de fidelidade: bancos/cartões, cias. aéreas, hotéis e postos." />
      <div className="grid gap-6 lg:grid-cols-3">
        <Cartao titulo="Cadastrados" className="lg:col-span-2">
          {programas.length === 0 ? (
            <Vazio texto="Nenhum programa cadastrado ainda." />
          ) : (
            <Tabela>
              <thead>
                <tr>
                  <Th>Programa</Th>
                  <Th>Tipo</Th>
                  <Th alinhar="direita">Preço de venda do milheiro</Th>
                  <Th alinhar="direita">Custo atribuído (parceiros)</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {programas.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <Td>
                      <Link href={`/programas/${p.id}`} className="font-medium text-marca-700 hover:underline">
                        {p.nome}
                      </Link>
                    </Td>
                    <Td>{rotulo(TIPOS_PROGRAMA, p.tipo)}</Td>
                    <Td alinhar="direita">{p.valorMilheiro !== null ? formatarReais(p.valorMilheiro) : '-'}</Td>
                    <Td alinhar="direita">{p.custoParceiroMilheiro !== null ? formatarReais(p.custoParceiroMilheiro) : '-'}</Td>
                    <Td>{!p.ativo && <Etiqueta>Inativo</Etiqueta>}</Td>
                  </tr>
                ))}
              </tbody>
            </Tabela>
          )}
        </Cartao>

        <Cartao titulo="Novo programa">
          <Formulario action={criarPrograma} limparAoSalvar className="space-y-4">
            <Texto rotulo="Nome" nome="nome" obrigatorio placeholder="Ex.: Smiles" />
            <Selecao rotulo="Tipo" nome="tipo" obrigatorio valor="CIA_AEREA" opcoes={opcoes(TIPOS_PROGRAMA)} />
            <Texto
              rotulo="Preço de venda do milheiro (R$, opcional)"
              nome="valorMilheiro"
              modo="decimal"
              placeholder="Ex.: 15,50"
              dica="Quanto se consegue vender 1.000 pontos hoje. Usado para estimar quanto vale o saldo."
            />
            <Texto
              rotulo="Custo atribuído aos pontos de parceiros (R$ por milheiro, opcional)"
              nome="custoParceiroMilheiro"
              modo="decimal"
              placeholder="Ex.: 31,00"
              dica="Custo dos pontos ganhos em compras de parceiros (Uber, Amazon...). Não sai do caixa."
            />
            <BotaoEnviar>Cadastrar</BotaoEnviar>
          </Formulario>
        </Cartao>
      </div>
    </>
  )
}
