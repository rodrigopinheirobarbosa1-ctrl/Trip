import Link from 'next/link'
import { listarPendencias } from '@/lib/pendencias'
import { Cabecalho, Cartao, Etiqueta, Vazio } from '@/components/ui'

export default async function Pendencias() {
  const lista = await listarPendencias()

  return (
    <>
      <Cabecalho
        titulo="Pendências"
        descricao="Dados que parecem errados e precisam de alguém olhando. Corrija os lançamentos e o item some daqui sozinho."
      />
      <Cartao>
        {lista.length === 0 ? (
          <Vazio texto="Nenhuma pendência. Tudo certo com os saldos!" />
        ) : (
          <ul className="divide-y divide-slate-100">
            {lista.map((p, i) => (
              <li key={i} className="py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Etiqueta tom={p.tipo === 'SALDO_NEGATIVO' ? 'vermelho' : 'amarelo'}>
                    {p.tipo === 'SALDO_NEGATIVO' ? 'Saldo negativo' : 'Venda sem valor'}
                  </Etiqueta>
                  <Link href={p.link} className="font-medium text-marca-700 hover:underline">
                    {p.titulo}
                  </Link>
                </div>
                <p className="mt-1 text-sm text-slate-500">{p.detalhe}</p>
              </li>
            ))}
          </ul>
        )}
      </Cartao>
    </>
  )
}
