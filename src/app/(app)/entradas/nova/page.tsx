import { listasLancamento } from '@/lib/dados'
import { dataParaCampo, hoje } from '@/lib/formatos'
import { Aviso, Cabecalho, Cartao } from '@/components/ui'
import { FormularioEntrada } from '../formulario'
import { salvarEntrada } from '../actions'

export default async function NovaEntrada({ searchParams }: { searchParams: Promise<{ ok?: string }> }) {
  const { ok } = await searchParams
  const listas = await listasLancamento()

  return (
    <>
      <Cabecalho titulo="Nova entrada de pontos" />
      {ok && (
        <div className="mb-4 max-w-3xl">
          <Aviso tom="verde">Entrada salva. Pode lançar a próxima.</Aviso>
        </div>
      )}
      <Cartao className="max-w-3xl">
        <FormularioEntrada
          key={ok ?? 'novo'}
          acao={salvarEntrada.bind(null, null)}
          novo
          {...listas}
          valores={{
            data: dataParaCampo(hoje()),
            titularId: '',
            programaId: '',
            categoria: 'COMPRA',
            pontos: '',
            valor: '',
            formaPagamento: 'PIX',
            parcelas: '1',
            cartaoId: '',
            observacao: '',
          }}
        />
      </Cartao>
    </>
  )
}
