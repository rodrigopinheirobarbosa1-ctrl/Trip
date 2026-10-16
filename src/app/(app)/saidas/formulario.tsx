'use client'

import { useState } from 'react'
import { BotaoEnviar, Formulario, type EstadoForm } from '@/components/form'
import { Campo } from '@/components/ui'
import { SaldoDisponivel, type SaldosForm } from '@/components/saldo-disponivel'
import { previaPeps } from '@/lib/carteira'
import { formatarCmp, formatarReais, lerCentavos, lerPontos } from '@/lib/formatos'
import { FORMAS_PAGAMENTO, opcoes, TIPOS_SAIDA } from '@/lib/rotulos'

type Item = { id: string; nome: string }

export type ValoresSaida = {
  data: string
  titularId: string
  programaId: string
  tipo: string
  pontos: string
  taxaEmbarque: string
  valorVenda: string
  fornecedor: string
  cliente: string
  localizador: string
  dataIda: string
  dataVolta: string
  passageiros: string
  origem: string
  destino: string
  formaRecebimento: string
  parcelas: string
  dataRecebimento: string
  observacao: string
}

export function FormularioSaida({
  acao,
  valores,
  titulares,
  programas,
  saldos,
  novo,
  cmpDaOperacao,
}: {
  acao: (estado: EstadoForm, dados: FormData) => Promise<EstadoForm>
  valores: ValoresSaida
  titulares: Item[]
  programas: Item[]
  saldos: SaldosForm
  novo: boolean
  /** Na edição: o CMP que esta saída realmente usou (na data dela). */
  cmpDaOperacao?: number | null
}) {
  const [titularId, setTitularId] = useState(valores.titularId)
  const [programaId, setProgramaId] = useState(valores.programaId)
  const [tipo, setTipo] = useState(valores.tipo)
  const [pontos, setPontos] = useState(valores.pontos)
  const [taxa, setTaxa] = useState(valores.taxaEmbarque)
  const [venda, setVenda] = useState(valores.valorVenda)

  const ehVenda = tipo === 'VENDA'
  const p = lerPontos(pontos)
  // Na edição, enquanto pessoa e programa não mudam, vale o CMP da data da emissão.
  const usaCmpDaOperacao =
    cmpDaOperacao !== undefined && cmpDaOperacao !== null && titularId === valores.titularId && programaId === valores.programaId
  // Lançamento novo: os pontos saem dos lotes mais antigos (PEPS).
  const previa = !usaCmpDaOperacao && p ? previaPeps(saldos[`${titularId}|${programaId}`]?.lotes ?? [], p) : null
  const cmp = usaCmpDaOperacao ? cmpDaOperacao : (previa?.cmp ?? null)
  const custoPontos = cmp !== null && p ? (cmp * p) / 1000 : null
  const custo = custoPontos !== null ? custoPontos + (lerCentavos(taxa) ?? 0) : null
  const valorVenda = lerCentavos(venda) ?? 0
  const lucro = custo !== null ? (ehVenda ? valorVenda : 0) - custo : null
  const precoMilheiro = ehVenda && p && valorVenda ? (valorVenda / p) * 1000 : null

  const selecao = (nome: string, valor: string, mudar: (v: string) => void, itens: Item[]) => (
    <select name={nome} value={valor} onChange={(e) => mudar(e.target.value)} required className="campo">
      <option value="">Selecione</option>
      {itens.map((t) => (
        <option key={t.id} value={t.id}>
          {t.nome}
        </option>
      ))}
    </select>
  )

  return (
    <Formulario action={acao} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-4">
        <Campo rotulo="Data da emissão">
          <input type="date" name="data" defaultValue={valores.data} required className="campo" />
        </Campo>
        <Campo rotulo="Tipo">
          <select name="tipo" value={tipo} onChange={(e) => setTipo(e.target.value)} className="campo">
            {opcoes(TIPOS_SAIDA).map((o) => (
              <option key={o.valor} value={o.valor}>
                {o.texto}
              </option>
            ))}
          </select>
        </Campo>
        <Campo rotulo="Pessoa (CPF)">{selecao('titularId', titularId, setTitularId, titulares)}</Campo>
        <div className="space-y-1">
          <Campo rotulo="Programa">{selecao('programaId', programaId, setProgramaId, programas)}</Campo>
          <SaldoDisponivel saldos={saldos} titularId={titularId} programaId={programaId} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <Campo rotulo="Pontos usados">
          <input
            name="pontos"
            value={pontos}
            onChange={(e) => setPontos(e.target.value)}
            required
            inputMode="numeric"
            placeholder="Ex.: 44.100"
            className="campo"
          />
        </Campo>
        <Campo rotulo="Taxa de embarque (R$)">
          <input name="taxaEmbarque" value={taxa} onChange={(e) => setTaxa(e.target.value)} inputMode="decimal" placeholder="0,00" className="campo" />
        </Campo>
        {ehVenda && (
          <Campo rotulo="Valor da venda (R$)" dica={precoMilheiro ? `Vendido a ${formatarCmp(precoMilheiro)} o milheiro` : undefined}>
            <input name="valorVenda" value={venda} onChange={(e) => setVenda(e.target.value)} inputMode="decimal" placeholder="0,00" className="campo" />
          </Campo>
        )}
      </div>

      {custo !== null && (
        <div className="grid gap-2 rounded-lg bg-slate-50 px-4 py-3 text-sm sm:grid-cols-3">
          <p>
            CMP {usaCmpDaOperacao ? 'na data da emissão' : 'dos lotes mais antigos'}: <strong>{formatarCmp(cmp)}</strong>
          </p>
          <p>
            Custo (pontos + taxa): <strong>{formatarReais(custo)}</strong>
          </p>
          {lucro !== null && (
            <p>
              {ehVenda ? 'Lucro' : 'Custo para você'}:{' '}
              <strong className={lucro < 0 ? 'text-red-700' : 'text-emerald-700'}>{formatarReais(ehVenda ? lucro : -lucro)}</strong>
            </p>
          )}
        </div>
      )}

      <fieldset className="space-y-4 rounded-lg border border-slate-200 p-4">
        <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Viagem</legend>
        <div className="grid gap-4 sm:grid-cols-4">
          <Campo rotulo="Localizador">
            <input name="localizador" defaultValue={valores.localizador} className="campo uppercase" maxLength={12} />
          </Campo>
          <Campo rotulo="Origem (sigla)">
            <input name="origem" defaultValue={valores.origem} className="campo uppercase" maxLength={4} placeholder="BSB" />
          </Campo>
          <Campo rotulo="Destino (sigla)">
            <input name="destino" defaultValue={valores.destino} className="campo uppercase" maxLength={4} placeholder="GRU" />
          </Campo>
          <Campo rotulo="Passageiros">
            <input name="passageiros" defaultValue={valores.passageiros} inputMode="numeric" className="campo" />
          </Campo>
          <Campo rotulo="Data de ida">
            <input type="date" name="dataIda" defaultValue={valores.dataIda} className="campo" />
          </Campo>
          <Campo rotulo="Data de volta">
            <input type="date" name="dataVolta" defaultValue={valores.dataVolta} className="campo" />
          </Campo>
        </div>
      </fieldset>

      {ehVenda && (
        <fieldset className="space-y-4 rounded-lg border border-slate-200 p-4">
          <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Venda</legend>
          <div className="grid gap-4 sm:grid-cols-3">
            <Campo rotulo="Cliente">
              <input name="cliente" defaultValue={valores.cliente} className="campo" />
            </Campo>
            <Campo rotulo="Fornecedor / intermediário">
              <input name="fornecedor" defaultValue={valores.fornecedor} className="campo" />
            </Campo>
            <Campo rotulo="Forma de recebimento">
              <select name="formaRecebimento" defaultValue={valores.formaRecebimento || 'PIX'} className="campo">
                {opcoes(FORMAS_PAGAMENTO)
                  .filter((o) => o.valor !== 'SEM_DESEMBOLSO')
                  .map((o) => (
                    <option key={o.valor} value={o.valor}>
                      {o.texto}
                    </option>
                  ))}
              </select>
            </Campo>
            <Campo rotulo="Parcelas do recebimento">
              <input name="parcelas" defaultValue={valores.parcelas} inputMode="numeric" className="campo" />
            </Campo>
            <Campo rotulo="Data do recebimento" dica="Vazio = mesma data da emissão.">
              <input type="date" name="dataRecebimento" defaultValue={valores.dataRecebimento} className="campo" />
            </Campo>
          </div>
        </fieldset>
      )}

      {!ehVenda && (
        <Campo rotulo="Para quem / motivo">
          <input name="cliente" defaultValue={valores.cliente} className="campo" placeholder="Ex.: Pessoal Erika e Rodrigo" />
        </Campo>
      )}

      <Campo rotulo="Observação">
        <input name="observacao" defaultValue={valores.observacao} className="campo" />
      </Campo>

      <div className="flex flex-wrap gap-2">
        <BotaoEnviar>Salvar</BotaoEnviar>
        {novo && (
          <button type="submit" name="continuar" value="sim" className="btn-secundario">
            Salvar e lançar outra
          </button>
        )}
      </div>
    </Formulario>
  )
}
