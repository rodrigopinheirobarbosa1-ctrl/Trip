import { listasLancamento } from '@/lib/dados'
import { iaConfigurada } from '@/lib/extrato/ler-com-ia'
import { Aviso, Cabecalho } from '@/components/ui'
import { ImportadorExtrato } from './importador'

// A leitura de cada página pela IA leva alguns segundos.
export const maxDuration = 300

export default async function ImportarExtrato() {
  const { titulares, programas } = await listasLancamento()

  return (
    <>
      <Cabecalho
        titulo="Importar extrato"
        descricao="Envie os prints (ou PDF/Word) do extrato de um programa. A IA lê as movimentações e você confere antes de gravar."
      />
      <div className="mb-4">
        <Aviso>
          <strong>Dica:</strong> no site do programa, filtre o período desejado e tire um print de cada página do extrato. Pode
          juntar todos num Word, como você já faz. Prints repetidos ou sobrepostos não duplicam lançamentos.
        </Aviso>
      </div>
      <ImportadorExtrato titulares={titulares} programas={programas} iaConfigurada={iaConfigurada()} />
    </>
  )
}
