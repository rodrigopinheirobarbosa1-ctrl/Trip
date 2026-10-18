import { AvisoRelancar } from '@/components/aviso-relancar'
import { relancarEntrada } from '@/lib/relancar-servidor'
import { listasLancamento } from '@/lib/dados'
import { dataParaCampo, hoje } from '@/lib/formatos'
import { Aviso, Cabecalho, Cartao } from '@/components/ui'
import { FormularioEntrada } from '../formulario'
import { salvarEntrada } from '../actions'

export default async function NovaEntrada({ searchParams }: { searchParams: Promise<{ ok?: string; relancar?: string }> }) {
  const { ok, relancar } = await searchParams
  const relancamento = ok ? null : await relancarEntrada(relancar)
  const v = relancamento?.valores
  // Mantém nas listas a pessoa, o programa e o cartão do lançamento, mesmo se inativos.
  const listas = await listasLancamento(
    v ? { titulares: [v.titularId ?? ''], programas: [v.programaId ?? ''], cartoes: v.cartaoId ? [v.cartaoId] : [] } : {},
  )

  return (
    <>
      <Cabecalho titulo="Nova entrada de pontos" />
      <AvisoRelancar r={relancamento} />
      {ok && (
        <div className="mb-4 max-w-3xl">
          <Aviso tom="verde">Entrada salva. Pode lançar a próxima.</Aviso>
        </div>
      )}
      <Cartao className="max-w-3xl">
        <FormularioEntrada
          key={ok ?? relancar ?? 'novo'}
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
            ...relancamento?.valores,
          }}
        />
      </Cartao>
    </>
  )
}
