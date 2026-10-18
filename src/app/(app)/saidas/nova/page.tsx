import { AvisoRelancar } from '@/components/aviso-relancar'
import { relancarSaida } from '@/lib/relancar-servidor'
import { listasLancamento, saldosParaFormulario } from '@/lib/dados'
import { dataParaCampo, hoje } from '@/lib/formatos'
import { Aviso, Cabecalho, Cartao } from '@/components/ui'
import { FormularioSaida } from '../formulario'
import { salvarSaida } from '../actions'

export default async function NovaSaida({ searchParams }: { searchParams: Promise<{ ok?: string; relancar?: string }> }) {
  const { ok, relancar } = await searchParams
  const relancamento = ok ? null : await relancarSaida(relancar)
  const v = relancamento?.valores
  const [listas, saldos] = await Promise.all([
    listasLancamento(v ? { titulares: [v.titularId ?? ''], programas: [v.programaId ?? ''] } : {}),
    saldosParaFormulario(),
  ])

  return (
    <>
      <Cabecalho titulo="Nova emissão / venda" />
      <AvisoRelancar r={relancamento} />
      {ok && (
        <div className="mb-4 max-w-4xl">
          <Aviso tom="verde">Emissão salva. Pode lançar a próxima.</Aviso>
        </div>
      )}
      <Cartao className="max-w-4xl">
        <FormularioSaida
          key={ok ?? relancar ?? 'novo'}
          acao={salvarSaida.bind(null, null)}
          novo
          titulares={listas.titulares}
          programas={listas.programas}
          saldos={saldos}
          valores={{
            data: dataParaCampo(hoje()),
            titularId: '',
            programaId: '',
            tipo: 'VENDA',
            pontos: '',
            taxaEmbarque: '',
            valorVenda: '',
            fornecedor: '',
            cliente: '',
            localizador: '',
            dataIda: '',
            dataVolta: '',
            passageiros: '',
            origem: '',
            destino: '',
            formaRecebimento: 'PIX',
            parcelas: '1',
            dataRecebimento: '',
            observacao: '',
            ...relancamento?.valores,
          }}
        />
      </Cartao>
    </>
  )
}
