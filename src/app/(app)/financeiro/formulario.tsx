import { BotaoEnviar, Formulario, type EstadoForm } from '@/components/form'
import { Selecao, Texto } from '@/components/campos'

export function FormularioMovimento({
  acao,
  titulares,
  valores,
}: {
  acao: (estado: EstadoForm, dados: FormData) => Promise<EstadoForm>
  titulares: { id: string; nome: string }[]
  valores: { data: string; tipo: string; titularId: string; valor: string; descricao: string }
}) {
  return (
    <Formulario action={acao} className="space-y-4">
      <Texto rotulo="Data" nome="data" tipo="date" obrigatorio valor={valores.data} />
      <Selecao
        rotulo="Entrada ou saída"
        nome="tipo"
        valor={valores.tipo}
        opcoes={[
          { valor: 'ENTRADA', texto: 'Entrada de dinheiro' },
          { valor: 'SAIDA', texto: 'Saída de dinheiro' },
        ]}
      />
      <Selecao
        rotulo="Pessoa (opcional)"
        nome="titularId"
        valor={valores.titularId}
        vazio="Geral (sem pessoa)"
        opcoes={titulares.map((t) => ({ valor: t.id, texto: t.nome }))}
      />
      <Texto rotulo="Valor (R$)" nome="valor" modo="decimal" obrigatorio valor={valores.valor} />
      <Texto rotulo="Descrição" nome="descricao" obrigatorio valor={valores.descricao} placeholder="Ex.: Aporte, retirada, tarifa" />
      <BotaoEnviar>Salvar</BotaoEnviar>
    </Formulario>
  )
}
