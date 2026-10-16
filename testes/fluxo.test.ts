import { test } from 'node:test'
import assert from 'node:assert/strict'
import { calcularFluxo, dividirEmParcelas, mesesDoAno } from '../src/lib/fluxo'

const d = (s: string) => new Date(`${s}T00:00:00Z`)

test('parcelas somam exatamente o total', () => {
  assert.deepEqual(dividirEmParcelas(1000, 3), [334, 333, 333])
  assert.deepEqual(dividirEmParcelas(950065, 12).reduce((a, b) => a + b, 0), 950065)
  assert.deepEqual(dividirEmParcelas(500, 0), [500])
})

test('compra em 12x aparece nos 12 meses a partir do mês da compra', () => {
  // Leo: R$ 9.500,65 em 12x no cartão (planilha: R$ 791,72 por mês de jan a dez)
  const fluxo = calcularFluxo(
    [{ data: d('2026-01-01'), valor: 950065, parcelas: 12, sentido: 'SAIDA' }],
    mesesDoAno(2026),
    0,
  )
  assert.equal(fluxo.length, 12)
  assert.ok(fluxo.every((m) => m.saidas === 79172 || m.saidas === 79173))
  assert.equal(fluxo[11].acumulado, -950065)
})

test('venda entra no mês do recebimento e acumulado considera o saldo inicial', () => {
  const fluxo = calcularFluxo(
    [
      { data: d('2026-01-03'), valor: 68355, parcelas: 1, sentido: 'ENTRADA' },
      { data: d('2026-02-10'), valor: 10000, parcelas: 1, sentido: 'SAIDA' },
    ],
    mesesDoAno(2026),
    50000,
  )
  assert.equal(fluxo[0].entradas, 68355)
  assert.equal(fluxo[0].acumulado, 118355)
  assert.equal(fluxo[1].saldo, -10000)
  assert.equal(fluxo[1].acumulado, 108355)
  assert.equal(fluxo[11].acumulado, 108355)
})

test('o que aconteceu antes do ano entra no acumulado de janeiro', () => {
  const fluxo = calcularFluxo(
    // Compra em nov/2025 em 4x: nov e dez/2025 antes do ano, jan e fev/2026 dentro.
    [{ data: d('2025-11-20'), valor: 40000, parcelas: 4, sentido: 'SAIDA' }],
    mesesDoAno(2026),
    0,
  )
  assert.equal(fluxo[0].saidas, 10000)
  assert.equal(fluxo[0].acumulado, -30000)
  assert.equal(fluxo[1].acumulado, -40000)
})
