import { AvisoRelancar } from '@/components/aviso-relancar'
import { relancarTransferencia } from '@/lib/relancar-servidor'
import { listasLancamento, saldosParaFormulario } from '@/lib/dados'
import { dataParaCampo, hoje } from '@/lib/formatos'
import { Aviso, Cabecalho, Cartao } from '@/components/ui'
import { FormularioTransferencia } from '../formulario'
import { salvarTransferencia } from '../actions'

export default async function NovaTransferencia({ searchParams }: { searchParams: Promise<{ ok?: string; relancar?: string }> }) {
  const { ok, relancar } = await searchParams
  const relancamento = ok ? null : await relancarTransferencia(relancar)
  const v = relancamento?.valores
  const [listas, saldos] = await Promise.all([
    listasLancamento(v ? { titulares: [v.titularId ?? ''], programas: [v.origemId ?? '', v.destinoId ?? ''] } : {}),
    saldosParaFormulario(),
  ])

  return (
    <>
      <Cabecalho titulo="Nova transferência" />
      <AvisoRelancar r={relancamento} />
      {ok && (
        <div className="mb-4 max-w-3xl">
          <Aviso tom="verde">Transferência salva. Pode lançar a próxima.</Aviso>
        </div>
      )}
      <Cartao className="max-w-3xl">
        <FormularioTransferencia
          key={ok ?? relancar ?? 'novo'}
          acao={salvarTransferencia.bind(null, null)}
          novo
          titulares={listas.titulares}
          programas={listas.programas}
          saldos={saldos}
          valores={{
            data: dataParaCampo(hoje()),
            titularId: '',
            origemId: '',
            destinoId: '',
            pontos: '',
            bonusPercentual: '0',
            pontosDestino: '',
            observacao: '',
            imediata: false,
            ...relancamento?.valores,
          }}
        />
      </Cartao>
    </>
  )
}
