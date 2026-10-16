import { db } from '@/lib/db'
import { exigirAdmin } from '@/lib/auth'
import { Aviso, Cabecalho, Cartao } from '@/components/ui'
import { Importador } from './importador'

export default async function Importar() {
  await exigirAdmin()
  const existentes =
    (await db.entrada.count()) + (await db.transferencia.count()) + (await db.saida.count()) + (await db.movimentoFinanceiro.count())

  return (
    <>
      <Cabecalho titulo="Importar planilha" descricao="Traz os dados da planilha de milhas (.xlsx) para o sistema." />
      <div className="grid gap-6 lg:grid-cols-3">
        <Cartao className="lg:col-span-2">
          <Importador lancamentosExistentes={existentes} />
        </Cartao>
        <div className="space-y-4">
          <Aviso>
            <p className="font-semibold">Como funciona</p>
            <ol className="mt-2 list-decimal space-y-1 pl-5">
              <li>Escolha o arquivo. Ele é lido aqui no seu navegador.</li>
              <li>Confira o resumo e os avisos.</li>
              <li>Clique em “Confirmar importação”. Se der qualquer erro, nada é gravado.</li>
            </ol>
          </Aviso>
          <Aviso tom="amarelo">
            <p className="font-semibold">O que é importado</p>
            <p className="mt-1">
              Cadastros (pessoas, programas, logins e cartões), Lança Entrada Ptos, Lança Transf Ptos, Controle de Venda,
              Lança Saída Ptos e E|S Financeiras.
            </p>
            <p className="mt-2">
              <strong>Senhas não são importadas.</strong> CMP, custos e lucro são recalculados pelo sistema. O Dashboard, o Resumo
              e o Fluxo de Caixa da planilha não são necessários: o sistema monta os seus.
            </p>
          </Aviso>
        </div>
      </div>
    </>
  )
}
