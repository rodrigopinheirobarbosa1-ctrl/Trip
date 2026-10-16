import Link from '@/components/link'
import { db } from '@/lib/db'
import { Cabecalho, Cartao, Dinheiro, Etiqueta, Tabela, Td, Th, Vazio } from '@/components/ui'
import { BotaoEnviar, Formulario } from '@/components/form'
import { Texto } from '@/components/campos'
import { criarTitular } from './actions'

export default async function Titulares() {
  const titulares = await db.titular.findMany({
    orderBy: [{ ativo: 'desc' }, { nome: 'asc' }],
    include: { _count: { select: { contas: true } } },
  })

  return (
    <>
      <Cabecalho
        titulo="Pessoas (CPFs)"
        descricao="As pessoas donas das contas nos programas de fidelidade. Na planilha, cada uma era um “CPF”."
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <Cartao titulo="Cadastradas" className="lg:col-span-2">
          {titulares.length === 0 ? (
            <Vazio texto="Nenhuma pessoa cadastrada ainda." />
          ) : (
            <Tabela>
              <thead>
                <tr>
                  <Th>Nome</Th>
                  <Th>CPF</Th>
                  <Th alinhar="direita">Logins</Th>
                  <Th alinhar="direita">Saldo inicial do caixa</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {titulares.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50">
                    <Td>
                      <Link href={`/titulares/${t.id}`} className="font-medium text-marca-700 hover:underline">
                        {t.nome}
                      </Link>
                    </Td>
                    <Td>{t.cpf ?? '-'}</Td>
                    <Td alinhar="direita">{t._count.contas}</Td>
                    <Td alinhar="direita">
                      <Dinheiro centavos={t.saldoInicialCaixa} />
                    </Td>
                    <Td>{!t.ativo && <Etiqueta>Inativa</Etiqueta>}</Td>
                  </tr>
                ))}
              </tbody>
            </Tabela>
          )}
        </Cartao>

        <Cartao titulo="Nova pessoa">
          <Formulario action={criarTitular} className="space-y-4">
            <Texto rotulo="Nome" nome="nome" obrigatorio placeholder="Ex.: Rodrigo" />
            <Texto rotulo="CPF (opcional)" nome="cpf" placeholder="000.000.000-00" />
            <Texto
              rotulo="Saldo inicial do caixa (R$)"
              nome="saldoInicialCaixa"
              modo="decimal"
              placeholder="0,00"
              dica="Dinheiro que a pessoa já tinha em caixa quando o controle começou."
            />
            <BotaoEnviar>Cadastrar</BotaoEnviar>
          </Formulario>
        </Cartao>
      </div>
    </>
  )
}
