'use client'

import { useState } from 'react'
import { BotaoEnviar, Formulario, type EstadoForm } from '@/components/form'
import { Campo } from '@/components/ui'
import { lerCentavos, lerPontos, formatarReais } from '@/lib/formatos'
import { CATEGORIAS_ENTRADA, FORMAS_PAGAMENTO, opcoes } from '@/lib/rotulos'

type Item = { id: string; nome: string }
type ItemPrograma = Item & { custoParceiroMilheiro?: number | null }

export type ValoresEntrada = {
  data: string
  titularId: string
  programaId: string
  categoria: string
  pontos: string
  valor: string
  formaPagamento: string
  parcelas: string
  cartaoId: string
  observacao: string
}

export function FormularioEntrada({
  acao,
  valores,
  titulares,
  programas,
  cartoes,
  novo,
}: {
  acao: (estado: EstadoForm, dados: FormData) => Promise<EstadoForm>
  valores: ValoresEntrada
  titulares: Item[]
  programas: ItemPrograma[]
  cartoes: Item[]
  novo: boolean
}) {
  const [categoria, setCategoria] = useState(valores.categoria)
  const [programaId, setProgramaId] = useState(valores.programaId)
  const parceiro = categoria === 'PARCEIRO'
  const saldoInicial = categoria === 'SALDO_INICIAL'
  const padrao = programas.find((x) => x.id === programaId)?.custoParceiroMilheiro ?? null
  const [pontos, setPontos] = useState(valores.pontos)
  const [valor, setValor] = useState(valores.valor)
  const [forma, setForma] = useState(valores.formaPagamento === 'SEM_DESEMBOLSO' ? 'PIX' : valores.formaPagamento)
  const [parcelas, setParcelas] = useState(valores.parcelas)

  // Mostra o custo do milheiro enquanto a pessoa digita (como a coluna CMP da planilha).
  const p = lerPontos(pontos)
  const v = lerCentavos(valor)
  const cmp = p && p > 0 && v !== null ? (v / p) * 1000 : null
  const n = Number(parcelas) || 1
  const semDinheiro = !v || parceiro || saldoInicial
  const custoPadrao = parceiro && !v && padrao && p && p > 0 ? Math.round((p * padrao) / 1000) : null

  return (
    <Formulario action={acao} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Campo rotulo="Data">
          <input type="date" name="data" defaultValue={valores.data} required className="campo" />
        </Campo>
        <Campo rotulo="Pessoa (CPF)">
          <select name="titularId" defaultValue={valores.titularId} required className="campo">
            <option value="">Selecione</option>
            {titulares.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nome}
              </option>
            ))}
          </select>
        </Campo>
        <Campo rotulo="Programa">
          <select name="programaId" value={programaId} onChange={(e) => setProgramaId(e.target.value)} required className="campo">
            <option value="">Selecione</option>
            {programas.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nome}
              </option>
            ))}
          </select>
        </Campo>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Campo rotulo="Tipo de entrada">
          <select name="categoria" value={categoria} onChange={(e) => setCategoria(e.target.value)} className="campo">
            {opcoes(CATEGORIAS_ENTRADA).map((o) => (
              <option key={o.valor} value={o.valor}>
                {o.texto}
              </option>
            ))}
          </select>
        </Campo>
        <Campo rotulo="Quantidade de pontos" dica="Ajuste aceita número negativo.">
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
        <Campo
          rotulo={parceiro ? 'Custo atribuído (R$)' : saldoInicial ? 'Custo dos pontos (R$)' : 'Valor pago (R$)'}
          dica={
            parceiro
              ? cmp !== null
                ? `Custo do milheiro: ${formatarReais(cmp)}. Não sai do caixa.`
                : padrao
                  ? `Vazio: usa o padrão do programa (${formatarReais(padrao)} o milheiro)${custoPadrao !== null ? ` = ${formatarReais(custoPadrao)}` : ''}. Não sai do caixa.`
                  : 'Este programa não tem custo padrão para parceiros (cadastre em Programas) — ou informe o valor aqui.'
              : saldoInicial
                ? `${cmp !== null ? `Custo do milheiro: ${formatarReais(cmp)}. ` : ''}Custo dos pontos que já estavam na conta: não sai do caixa.`
                : cmp !== null
                  ? `Custo do milheiro: ${formatarReais(cmp)}`
                  : 'Deixe vazio se não pagou nada.'
          }
        >
          <input
            name="valor"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            inputMode="decimal"
            placeholder="0,00"
            className="campo"
          />
        </Campo>
      </div>

      {!semDinheiro && (
        <div className="grid gap-4 sm:grid-cols-3">
          <Campo rotulo="Forma de pagamento">
            <select
              name="formaPagamento"
              value={forma}
              onChange={(e) => {
                setForma(e.target.value)
                if (e.target.value === 'PIX') setParcelas('1')
              }}
              className="campo"
            >
              {opcoes(FORMAS_PAGAMENTO)
                .filter((o) => o.valor !== 'SEM_DESEMBOLSO')
                .map((o) => (
                  <option key={o.valor} value={o.valor}>
                    {o.texto}
                  </option>
                ))}
            </select>
          </Campo>
          <Campo
            rotulo="Parcelas"
            dica={v && n > 1 ? `${n}x de ${formatarReais(Math.round(v / n))}, a partir do mês da compra` : undefined}
          >
            <input
              name="parcelas"
              value={parcelas}
              onChange={(e) => setParcelas(e.target.value)}
              inputMode="numeric"
              disabled={forma === 'PIX'}
              className="campo"
            />
          </Campo>
          {forma === 'CARTAO' && (
            <Campo rotulo="Cartão">
              <select name="cartaoId" defaultValue={valores.cartaoId} className="campo">
                <option value="">Não informado</option>
                {cartoes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </Campo>
          )}
        </div>
      )}
      {semDinheiro && <input type="hidden" name="formaPagamento" value="SEM_DESEMBOLSO" />}
      {/* Campo desabilitado não é enviado: no PIX a parcela é sempre 1. */}
      {!semDinheiro && forma === 'PIX' && <input type="hidden" name="parcelas" value="1" />}

      <Campo rotulo="Observação">
        <input name="observacao" defaultValue={valores.observacao} className="campo" placeholder="Ex.: Compra Livelo 50% off" />
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
