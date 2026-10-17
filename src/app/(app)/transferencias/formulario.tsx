'use client'

import { useState } from 'react'
import { BotaoEnviar, Formulario, type EstadoForm } from '@/components/form'
import { Campo } from '@/components/ui'
import { SaldoDisponivel, type SaldosForm } from '@/components/saldo-disponivel'
import { calcularPontosDestino, previaPeps } from '@/lib/carteira'
import { formatarCmp, formatarPontos, formatarReais, lerNumero, lerPontos } from '@/lib/formatos'

type Item = { id: string; nome: string }

export type ValoresTransferencia = {
  data: string
  titularId: string
  origemId: string
  destinoId: string
  pontos: string
  bonusPercentual: string
  pontosDestino: string
  observacao: string
  imediata: boolean
}

export function FormularioTransferencia({
  acao,
  valores,
  titulares,
  programas,
  saldos,
  novo,
}: {
  acao: (estado: EstadoForm, dados: FormData) => Promise<EstadoForm>
  valores: ValoresTransferencia
  titulares: Item[]
  programas: Item[]
  saldos: SaldosForm
  novo: boolean
}) {
  const [titularId, setTitularId] = useState(valores.titularId)
  const [origemId, setOrigemId] = useState(valores.origemId)
  const [destinoId, setDestinoId] = useState(valores.destinoId)
  const [pontos, setPontos] = useState(valores.pontos)
  const [bonus, setBonus] = useState(valores.bonusPercentual)
  const [destinoManual, setDestinoManual] = useState(valores.pontosDestino)
  const [imediata, setImediata] = useState(valores.imediata)

  const p = lerPontos(pontos)
  const b = lerNumero(bonus) ?? 0
  const calculado = p && p > 0 ? calcularPontosDestino(p, b) : null
  const chegam = lerPontos(destinoManual) || calculado

  // Prévia do custo: os pontos saem dos lotes mais antigos da origem (PEPS).
  const previa = p ? previaPeps(saldos[`${titularId}|${origemId}`]?.lotes ?? [], p) : null
  const cmpOrigem = previa?.cmp ?? null
  const custo = previa?.custo ?? null
  const cmpChegada = custo !== null && chegam ? (custo / chegam) * 1000 : null

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
    <Formulario action={acao} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo rotulo="Data">
          <input type="date" name="data" defaultValue={valores.data} required className="campo" />
        </Campo>
        <Campo rotulo="Pessoa (CPF)">{selecao('titularId', titularId, setTitularId, titulares)}</Campo>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <Campo rotulo="Sai do programa">{selecao('origemId', origemId, setOrigemId, programas)}</Campo>
          <SaldoDisponivel saldos={saldos} titularId={titularId} programaId={origemId} />
        </div>
        <div className="space-y-1">
          <Campo rotulo="Vai para o programa">{selecao('destinoId', destinoId, setDestinoId, programas)}</Campo>
          <SaldoDisponivel saldos={saldos} titularId={titularId} programaId={destinoId} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Campo rotulo="Pontos que saem">
          <input
            name="pontos"
            value={pontos}
            onChange={(e) => setPontos(e.target.value)}
            required
            inputMode="numeric"
            placeholder="Ex.: 200.000"
            className="campo"
          />
        </Campo>
        <Campo rotulo="Bônus (%)" dica="Ex.: 90 para 90%. Negativo para deságio.">
          <input name="bonusPercentual" value={bonus} onChange={(e) => setBonus(e.target.value)} inputMode="decimal" className="campo" />
        </Campo>
        <Campo rotulo="Pontos que chegam" dica={calculado ? `Calculado: ${formatarPontos(calculado)}. Corrija se chegou diferente.` : undefined}>
          <input
            name="pontosDestino"
            value={destinoManual}
            onChange={(e) => setDestinoManual(e.target.value)}
            inputMode="numeric"
            placeholder={calculado ? formatarPontos(calculado) : ''}
            className="campo"
          />
        </Campo>
      </div>

      <label className="flex items-start gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
        <input type="checkbox" name="imediata" value="sim" checked={imediata} onChange={(e) => setImediata(e.target.checked)} className="mt-1" />
        <span>
          <strong>Transferência imediata</strong> (comprei pontos na hora para completar a transferência, como no &quot;Pontos +
          Dinheiro&quot; da Livelo)
          <span className="block text-xs text-slate-500">
            Os pontos da compra feita na origem perto desta data saem primeiro, e o destino recebe o custo real da operação. Lance a
            compra antes, em Entradas.
          </span>
        </span>
      </label>

      {imediata ? (
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
          Custo levado para o destino: o da compra feita na hora (e, se faltar, o dos lotes mais antigos da origem).
        </p>
      ) : custo !== null && (
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
          Custo levado para o destino (lotes mais antigos da origem, {formatarCmp(cmpOrigem)} o milheiro): <strong>{formatarReais(custo)}</strong>
          {cmpChegada !== null && (
            <>
              {' '}
              · CMP desses pontos no destino: <strong>{formatarCmp(cmpChegada)}</strong>
            </>
          )}
        </p>
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
