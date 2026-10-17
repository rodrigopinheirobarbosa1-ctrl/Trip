import { db } from '@/lib/db'
import { exigirUsuario } from '@/lib/auth'
import { custoDaEntrada, TROCAVEIS } from '@/lib/custo-atribuido'
import { formatarCmp, formatarPontos, formatarReais } from '@/lib/formatos'
import { CATEGORIAS_ENTRADA, rotulo } from '@/lib/rotulos'
import { Aviso, Cabecalho, Cartao, Tabela, Td, Th, Vazio } from '@/components/ui'
import Link from '@/components/link'
import { reclassificarGrupo } from './actions'

/**
 * Reclassificar de uma vez os acúmulos e bônus sem valor pago: cada grupo é o
 * mesmo programa, a mesma categoria e a mesma observação (ex.: "Acúmulo · UBER").
 */
export default async function ClassificarEntradas() {
  await exigirUsuario()
  const entradas = await db.entrada.findMany({
    where: { categoria: { in: [...TROCAVEIS] }, formaPagamento: 'SEM_DESEMBOLSO', pontos: { gt: 0 } },
    include: { programa: true },
  })
  const grupos = new Map<string, { programaId: string; programa: string; categoria: string; observacao: string | null; qtd: number; pontos: number; custo: number; custoPadrao: number | null }>()
  for (const e of entradas) {
    const chave = `${e.programaId}|${e.categoria}|${e.observacao ?? ''}`
    const g = grupos.get(chave) ?? {
      programaId: e.programaId, programa: e.programa.nome, categoria: e.categoria, observacao: e.observacao,
      qtd: 0, pontos: 0, custo: 0, custoPadrao: e.programa.custoParceiroMilheiro,
    }
    g.qtd++
    g.pontos += e.pontos
    g.custo += custoDaEntrada(e, e.programa.custoParceiroMilheiro).valor
    grupos.set(chave, g)
  }
  const lista = [...grupos.values()].sort((a, b) => a.programa.localeCompare(b.programa) || b.pontos - a.pontos)

  return (
    <>
      <Cabecalho
        titulo="Classificar acúmulos e bônus"
        descricao="Pontos sem valor pago, agrupados pela descrição. Escolha de onde vieram: o custo do CMP muda; os pontos e o caixa, não."
      />
      <div className="mb-4">
        <Aviso>
          <strong>Cartão / voo</strong> e <strong>bônus do programa</strong> ficam sem custo. <strong>Parceiro</strong> (compras em
          Uber, Amazon, Insider...) recebe o custo atribuído do programa, cadastrado em{' '}
          <Link href="/programas" className="font-semibold underline">
            Programas
          </Link>
          .
        </Aviso>
      </div>
      <Cartao>
        {lista.length === 0 ? (
          <Vazio texto="Nenhum acúmulo ou bônus sem valor pago." />
        ) : (
          <Tabela>
            <thead>
              <tr>
                <Th>Programa</Th>
                <Th>Descrição</Th>
                <Th alinhar="direita">Lançamentos</Th>
                <Th alinhar="direita">Pontos</Th>
                <Th alinhar="direita">Custo</Th>
                <Th>Classificação</Th>
              </tr>
            </thead>
            <tbody>
              {lista.map((g) => (
                <tr key={`${g.programaId}|${g.categoria}|${g.observacao ?? ''}`}>
                  <Td>{g.programa}</Td>
                  <Td className="max-w-[18rem] truncate">{g.observacao ?? <span className="text-slate-400">sem observação</span>}</Td>
                  <Td alinhar="direita">{g.qtd}</Td>
                  <Td alinhar="direita">{formatarPontos(g.pontos)}</Td>
                  <Td alinhar="direita">
                    {formatarReais(g.custo)}
                    {g.categoria === 'PARCEIRO' && !g.custoPadrao && g.custo === 0 && (
                      <span className="block text-xs text-amber-700">programa sem custo padrão</span>
                    )}
                    {g.custo > 0 && <span className="block text-xs text-slate-400">{formatarCmp((g.custo / g.pontos) * 1000)} o milheiro</span>}
                  </Td>
                  <Td>
                    <form action={reclassificarGrupo} className="flex items-center gap-2">
                      <input type="hidden" name="programaId" value={g.programaId} />
                      <input type="hidden" name="de" value={g.categoria} />
                      {g.observacao !== null && <input type="hidden" name="observacao" value={g.observacao} />}
                      <select name="para" defaultValue={g.categoria} className="campo py-1 text-xs">
                        {TROCAVEIS.map((c) => (
                          <option key={c} value={c}>
                            {rotulo(CATEGORIAS_ENTRADA, c)}
                          </option>
                        ))}
                      </select>
                      <button className="btn-secundario px-2 py-1 text-xs">Aplicar</button>
                    </form>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Tabela>
        )}
      </Cartao>
    </>
  )
}
