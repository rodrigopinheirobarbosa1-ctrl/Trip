import { Aviso } from '@/components/ui'

/** Aviso no formulário aberto pelo botão "Relançar" do histórico. */
export function AvisoRelancar({ r }: { r: { origem: string; copia: boolean; duplicado: boolean } | null }) {
  if (!r) return null
  return (
    <div className="mb-4 max-w-4xl space-y-2">
      <Aviso tom="amarelo">
        Relançando um lançamento {r.origem}.{' '}
        {r.copia
          ? 'Os dados são os que ele tinha.'
          : 'Os dados foram lidos do texto do histórico: confira principalmente o tipo, o valor e o cartão.'}{' '}
        Confira e clique em <strong>Salvar</strong>.
      </Aviso>
      {r.duplicado && (
        <Aviso tom="vermelho">
          Já existe um lançamento igual (mesma pessoa, programa, data e pontos). Talvez ele já tenha sido relançado: confira antes
          de salvar, para não duplicar.
        </Aviso>
      )}
    </div>
  )
}
