import Link from '@/components/link'
import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { centavosParaCampo } from '@/lib/formatos'
import { Aviso, Cabecalho, Cartao, Tabela, Td, Th, Vazio } from '@/components/ui'
import { BotaoAcao, BotaoEnviar, Formulario } from '@/components/form'
import { AreaTexto, Caixa, Selecao, Texto } from '@/components/campos'
import { excluirConta, salvarConta, salvarTitular } from '../actions'

export default async function EditarTitular({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const titular = await db.titular.findUnique({
    where: { id },
    include: { contas: { include: { programa: true }, orderBy: { programa: { nome: 'asc' } } } },
  })
  if (!titular) notFound()
  const programas = await db.programa.findMany({ where: { ativo: true }, orderBy: { nome: 'asc' } })

  return (
    <>
      <Cabecalho
        titulo={titular.nome}
        descricao="Dados da pessoa e logins nos programas."
        acoes={
          <Link href={`/extrato?titular=${titular.id}`} className="btn-secundario">
            Ver extrato
          </Link>
        }
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Cartao titulo="Cadastro">
          <Formulario action={salvarTitular.bind(null, titular.id)} className="space-y-4">
            <Texto rotulo="Nome" nome="nome" obrigatorio valor={titular.nome} />
            <Texto rotulo="CPF (opcional)" nome="cpf" valor={titular.cpf} />
            <Texto
              rotulo="Saldo inicial do caixa (R$)"
              nome="saldoInicialCaixa"
              modo="decimal"
              valor={centavosParaCampo(titular.saldoInicialCaixa)}
            />
            <AreaTexto rotulo="Observação" nome="observacao" valor={titular.observacao} />
            <Caixa rotulo="Ativa (aparece nas listas de lançamento)" nome="ativo" marcado={titular.ativo} />
            <BotaoEnviar>Salvar</BotaoEnviar>
          </Formulario>
        </Cartao>

        <Cartao titulo="Logins nos programas">
          <div className="mb-4">
            <Aviso tom="amarelo">
              Por segurança, o sistema <strong>não guarda senhas</strong>. Guarde-as num gerenciador de senhas
              (Bitwarden, 1Password ou o do navegador).
            </Aviso>
          </div>
          {titular.contas.length === 0 ? (
            <Vazio texto="Nenhum login cadastrado." />
          ) : (
            <Tabela className="mb-6">
              <thead>
                <tr>
                  <Th>Programa</Th>
                  <Th>Login</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {titular.contas.map((c) => (
                  <tr key={c.id}>
                    <Td>{c.programa.nome}</Td>
                    <Td>
                      {c.login}
                      {c.observacao && <span className="block text-xs text-slate-400">{c.observacao}</span>}
                    </Td>
                    <Td alinhar="direita">
                      <form action={excluirConta.bind(null, c.id)}>
                        <BotaoAcao variante="perigo" confirmar={`Remover o login do ${c.programa.nome}?`}>
                          Remover
                        </BotaoAcao>
                      </form>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Tabela>
          )}
          <Formulario action={salvarConta.bind(null, titular.id)} className="grid gap-3 sm:grid-cols-2">
            <Selecao
              rotulo="Programa"
              nome="programaId"
              obrigatorio
              vazio="Selecione"
              opcoes={programas.map((p) => ({ valor: p.id, texto: p.nome }))}
            />
            <Texto rotulo="Login (CPF, e-mail ou número)" nome="login" obrigatorio />
            <Texto rotulo="Observação" nome="observacao" className="sm:col-span-2" />
            <div className="sm:col-span-2">
              <BotaoEnviar variante="secundario">Adicionar / atualizar login</BotaoEnviar>
            </div>
          </Formulario>
        </Cartao>
      </div>
    </>
  )
}
