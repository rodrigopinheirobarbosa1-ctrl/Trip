import { db } from '@/lib/db'
import { exigirUsuario } from '@/lib/auth'
import { anosDisponiveis, carregarNomes } from '@/lib/dados'
import { formatarData } from '@/lib/formatos'
import { Cabecalho } from '@/components/ui'
import { EditorLote, type LinhaLote } from './editor'

type Busca = Record<string, string | string[] | undefined>
const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || ''

/** Editar várias entradas de uma vez (valores em branco, tipo, pagamento). */
export default async function EntradasEmLote({ searchParams }: { searchParams: Promise<Busca> }) {
  await exigirUsuario()
  const b = await searchParams
  const [nomes, anos, cartoes] = await Promise.all([
    carregarNomes(),
    anosDisponiveis(),
    db.cartao.findMany({ where: { ativo: true }, orderBy: { nome: 'asc' }, select: { id: true, nome: true } }),
  ])
  const titular = um(b.titular)
  const programa = um(b.programa)
  const ano = Number(um(b.ano)) || null
  const categoria = um(b.categoria)
  const texto = um(b.texto).trim()
  // Por padrão, só as que estão sem valor: é o que mais se precisa preencher.
  const semValor = um(b.semValor) !== 'nao'

  const entradas = await db.entrada.findMany({
    where: {
      titularId: titular || undefined,
      programaId: programa || undefined,
      categoria: categoria ? (categoria as never) : { not: 'AJUSTE' },
      pontos: { gt: 0 },
      ...(semValor ? { valor: 0 } : {}),
      ...(texto ? { observacao: { contains: texto, mode: 'insensitive' as const } } : {}),
      ...(ano ? { data: { gte: new Date(Date.UTC(ano, 0, 1)), lt: new Date(Date.UTC(ano + 1, 0, 1)) } } : {}),
    },
    include: { titular: true, programa: true },
    orderBy: [{ data: 'asc' }, { criadoEm: 'asc' }],
    take: 500,
  })
  const linhas: LinhaLote[] = entradas.map((e) => ({
    id: e.id,
    data: formatarData(e.data),
    pessoa: e.titular.nome,
    programa: e.programa.nome,
    pontos: e.pontos,
    observacao: e.observacao,
    categoria: e.categoria as LinhaLote['categoria'],
    valor: e.valor,
    formaPagamento: e.formaPagamento,
    parcelas: e.parcelas,
    cartaoId: e.cartaoId,
  }))

  return (
    <>
      <Cabecalho
        titulo="Editar entradas em lote"
        descricao="Filtre, preencha várias de uma vez e salve tudo junto. Ex.: o valor da mensalidade do Clube em todos os meses."
      />
      <form method="get" className="cartao mb-4 grid gap-3 p-4 sm:grid-cols-3 lg:grid-cols-6">
        <label className="block">
          <span className="rotulo">Pessoa</span>
          <select name="titular" defaultValue={titular} className="campo">
            <option value="">Todas</option>
            {nomes.titulares.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nome}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="rotulo">Programa</span>
          <select name="programa" defaultValue={programa} className="campo">
            <option value="">Todos</option>
            {nomes.programas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="rotulo">Ano</span>
          <select name="ano" defaultValue={ano ? String(ano) : ''} className="campo">
            <option value="">Todos</option>
            {anos.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="rotulo">Tipo</span>
          <select name="categoria" defaultValue={categoria} className="campo">
            <option value="">Todos</option>
            <option value="COMPRA">Compra</option>
            <option value="ACUMULO">Acúmulo (cartão, voo)</option>
            <option value="PARCEIRO">Parceiro</option>
            <option value="BONUS">Bônus do programa</option>
            <option value="SALDO_INICIAL">Saldo inicial</option>
          </select>
        </label>
        <label className="block">
          <span className="rotulo">Observação contém</span>
          <input name="texto" defaultValue={texto} placeholder="Ex.: Clube" className="campo" />
        </label>
        <label className="block">
          <span className="rotulo">Valor</span>
          <select name="semValor" defaultValue={semValor ? 'sim' : 'nao'} className="campo">
            <option value="sim">Só sem valor</option>
            <option value="nao">Todas</option>
          </select>
        </label>
        <div className="sm:col-span-3 lg:col-span-6">
          <button className="btn-secundario">Filtrar</button>
          {entradas.length === 500 && <span className="ml-3 text-xs text-amber-700">Mostrando as 500 primeiras: refine o filtro.</span>}
        </div>
      </form>
      <EditorLote key={JSON.stringify(b)} linhas={linhas} cartoes={cartoes} />
    </>
  )
}
