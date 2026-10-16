import { listasLancamento, saldosParaFormulario } from '@/lib/dados'
import { dataParaCampo, hoje } from '@/lib/formatos'
import { Aviso, Cabecalho, Cartao } from '@/components/ui'
import { FormularioTransferencia } from '../formulario'
import { salvarTransferencia } from '../actions'

export default async function NovaTransferencia({ searchParams }: { searchParams: Promise<{ ok?: string }> }) {
  const { ok } = await searchParams
  const [listas, saldos] = await Promise.all([listasLancamento(), saldosParaFormulario()])

  return (
    <>
      <Cabecalho titulo="Nova transferência" />
      {ok && (
        <div className="mb-4 max-w-3xl">
          <Aviso tom="verde">Transferência salva. Pode lançar a próxima.</Aviso>
        </div>
      )}
      <Cartao className="max-w-3xl">
        <FormularioTransferencia
          key={ok ?? 'novo'}
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
          }}
        />
      </Cartao>
    </>
  )
}
