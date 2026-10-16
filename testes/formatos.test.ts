import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatarReais, lerCentavos, lerData, lerNumero, lerPontos, somarMeses } from '../src/lib/formatos'

test('lê valores em reais em vários formatos', () => {
  assert.equal(lerCentavos('3.120,50'), 312050)
  assert.equal(lerCentavos('3120,50'), 312050)
  assert.equal(lerCentavos('3120.50'), 312050)
  assert.equal(lerCentavos('R$ 1.500'), 150000)
  assert.equal(lerCentavos('7725.6876'), 772569)
  assert.equal(lerCentavos(''), null)
  assert.equal(lerCentavos('abc'), null)
})

test('lê pontos com separador de milhar', () => {
  assert.equal(lerPontos('200.000'), 200000)
  assert.equal(lerPontos('1.389.249'), 1389249)
  assert.equal(lerPontos('200000'), 200000)
  assert.equal(lerPontos('-40.667'), -40667)
  assert.equal(lerPontos('12,5'), 125) // pontos não têm decimais
  assert.equal(lerPontos('dez'), null)
})

test('lê percentuais', () => {
  assert.equal(lerNumero('90'), 90)
  assert.equal(lerNumero('12,5%'), 12.5)
  assert.equal(lerNumero('-20'), -20)
})

test('lê datas', () => {
  assert.deepEqual(lerData('2026-01-15'), new Date('2026-01-15T00:00:00Z'))
  assert.deepEqual(lerData('15/01/2026'), new Date('2026-01-15T00:00:00Z'))
  assert.equal(lerData('31/02/2026'), null)
})

test('formata dinheiro e meses', () => {
  assert.equal(formatarReais(-285860), '-R$ 2.858,60')
  assert.equal(somarMeses('2026-11', 3), '2027-02')
})
