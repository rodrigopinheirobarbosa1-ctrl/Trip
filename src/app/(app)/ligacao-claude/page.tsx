import { exigirAdmin } from '@/lib/auth'
import { situacaoLigacao } from '@/lib/ligacao-claude'
import { Aviso, Cabecalho, Cartao, Etiqueta } from '@/components/ui'
import { BotaoEnviar, Formulario } from '@/components/form'
import { Caixa } from '@/components/campos'
import { alterarEdicao, desligarLigacao, gerarEndereco } from './actions'

export default async function LigacaoClaude() {
  await exigirAdmin()
  const s = await situacaoLigacao()

  return (
    <>
      <Cabecalho
        titulo="Ligação com o Claude"
        descricao="Permite que o Claude consulte e corrija os lançamentos direto no Trip, sem exportar planilhas."
      />
      <div className="grid max-w-4xl gap-6">
        <Cartao titulo="Situação">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {s.ligada ? <Etiqueta tom="verde">Ligada</Etiqueta> : <Etiqueta tom="cinza">Desligada</Etiqueta>}
            {s.ligada && <Etiqueta tom={s.edicao ? 'azul' : 'cinza'}>{s.edicao ? 'Lê e altera' : 'Só lê'}</Etiqueta>}
            {s.desde && (
              <span className="text-sm text-slate-500">
                endereço gerado em {s.desde.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
              </span>
            )}
          </div>
          <Formulario action={gerarEndereco} className="space-y-3">
            <p className="text-sm text-slate-600">
              {s.ligada
                ? 'Gerar um novo endereço desliga o anterior (use se achar que alguém viu o endereço).'
                : 'Gere o endereço e copie: ele aparece só uma vez.'}
            </p>
            <BotaoEnviar confirmar={s.ligada ? 'O endereço atual vai parar de funcionar. Continuar?' : undefined}>
              {s.ligada ? 'Gerar novo endereço' : 'Gerar endereço'}
            </BotaoEnviar>
          </Formulario>
          {s.ligada && (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Formulario action={alterarEdicao} className="space-y-3">
                <Caixa rotulo="Permitir que o Claude altere lançamentos" nome="edicao" marcado={s.edicao} />
                <BotaoEnviar variante="secundario">Salvar</BotaoEnviar>
              </Formulario>
              <Formulario action={desligarLigacao} className="space-y-3">
                <p className="text-sm text-slate-600">Corta o acesso do Claude na hora.</p>
                <BotaoEnviar variante="perigo" confirmar="Desligar a ligação com o Claude?">
                  Desligar
                </BotaoEnviar>
              </Formulario>
            </div>
          )}
        </Cartao>

        <Cartao titulo="Como ligar no Claude">
          <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-700">
            <li>Clique em &quot;Gerar endereço&quot; e copie o endereço que aparece.</li>
            <li>
              No Claude (claude.ai), abra <strong>Configurações → Conectores</strong> e clique em{' '}
              <strong>Adicionar conector personalizado</strong>.
            </li>
            <li>Nome: <strong>Trip</strong>. URL: cole o endereço. Salve.</li>
            <li>Comece uma conversa nova: o Claude passa a ver o Trip.</li>
          </ol>
        </Cartao>

        <Aviso tom="amarelo">
          O endereço funciona como uma senha: quem tiver o endereço acessa os dados. Não mande por e-mail ou mensagem. Tudo o
          que o Claude altera fica no Histórico como &quot;Claude (assistente)&quot; e pode ser desfeito com
          &quot;Relançar&quot;.
        </Aviso>
      </div>
    </>
  )
}
