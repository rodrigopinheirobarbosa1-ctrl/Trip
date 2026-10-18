import { test } from 'node:test'
import assert from 'node:assert/strict'
import { celula, montarCsv, reaisCsv } from '../src/lib/exportacao'

test('CSV no formato brasileiro, com aspas só quando precisa', () => {
  assert.equal(celula('Livelo'), 'Livelo')
  assert.equal(celula('a; b'), '"a; b"')
  assert.equal(celula('diz "oi"'), '"diz ""oi"""')
  assert.equal(celula(12.5), '12,5')
  assert.equal(reaisCsv(424512), '4245,12')
  assert.equal(reaisCsv(null), '')
  assert.equal(montarCsv(['A', 'B'], [[1, 'x;y']]), '﻿A;B\r\n1;"x;y"\r\n')
})
