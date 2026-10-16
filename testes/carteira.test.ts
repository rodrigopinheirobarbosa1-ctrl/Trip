import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  calcularCarteira,
  calcularPontosDestino,
  chavePosicao,
  conferirSaldos,
  type Movimentos,
} from '../src/lib/carteira'

const d = (s: string) => new Date(`${s}T00:00:00Z`)
const vazio = (): Movimentos => ({ entradas: [], transferencias: [], saidas: [] })

test('CMP de uma compra simples', () => {
  const m = vazio()
  // 254.805 pontos Livelo por R$ 7.725,69 -> R$ 30,32 o milheiro
  m.entradas.push({ id: 'e1', data: d('2026-01-01'), titularId: 'alex', programaId: 'livelo', pontos: 254805, valor: 772569 })
  const c = calcularCarteira(m)
  const p = c.posicoes.get(chavePosicao('alex', 'livelo'))!
  assert.equal(p.pontos, 254805)
  assert.equal(Math.round(p.cmp!), 3032)
})

test('média ponderada entre duas compras', () => {
  const m = vazio()
  m.entradas.push({ id: 'e1', data: d('2026-01-01'), titularId: 't', programaId: 'p', pontos: 100000, valor: 300000 }) // 30,00
  m.entradas.push({ id: 'e2', data: d('2026-01-02'), titularId: 't', programaId: 'p', pontos: 100000, valor: 200000 }) // 20,00
  const p = calcularCarteira(m).posicoes.get(chavePosicao('t', 'p'))!
  assert.equal(p.pontos, 200000)
  assert.equal(p.cmp, 2500)
})

test('saída retira pelo CMP do momento e não muda o CMP do que sobra', () => {
  const m = vazio()
  m.entradas.push({ id: 'e1', data: d('2026-01-01'), titularId: 't', programaId: 'p', pontos: 100000, valor: 300000 })
  m.saidas.push({ id: 's1', data: d('2026-01-05'), titularId: 't', programaId: 'p', pontos: 40000 })
  const c = calcularCarteira(m)
  const p = c.posicoes.get(chavePosicao('t', 'p'))!
  assert.equal(p.pontos, 60000)
  assert.equal(p.cmp, 3000)
  assert.equal(c.custoSaidas.get('s1')!.custo, 120000) // 40 milheiros x R$ 30
})

test('compra nova depois de vender tudo usa só o custo novo (diferente da planilha)', () => {
  const m = vazio()
  m.entradas.push({ id: 'e1', data: d('2026-01-01'), titularId: 't', programaId: 'p', pontos: 100000, valor: 300000 })
  m.saidas.push({ id: 's1', data: d('2026-01-02'), titularId: 't', programaId: 'p', pontos: 100000 })
  m.entradas.push({ id: 'e2', data: d('2026-01-03'), titularId: 't', programaId: 'p', pontos: 100000, valor: 200000 })
  const p = calcularCarteira(m).posicoes.get(chavePosicao('t', 'p'))!
  assert.equal(p.cmp, 2000)
})

test('transferência com bônus: 200.000 Livelo + 90% -> 380.000 Smiles, custo vai junto', () => {
  assert.equal(calcularPontosDestino(200000, 90), 380000)
  assert.equal(calcularPontosDestino(268000, 25), 335000)
  assert.equal(calcularPontosDestino(100000, -20), 80000) // deságio

  const m = vazio()
  // Livelo a R$ 28,83
  m.entradas.push({ id: 'e1', data: d('2026-01-01'), titularId: 'leo', programaId: 'livelo', pontos: 200000, valor: 576600 })
  m.transferencias.push({
    id: 't1', data: d('2026-01-15'), titularId: 'leo', origemId: 'livelo', destinoId: 'smiles',
    pontos: 200000, pontosDestino: 380000,
  })
  const c = calcularCarteira(m)
  const livelo = c.posicoes.get(chavePosicao('leo', 'livelo'))!
  const smiles = c.posicoes.get(chavePosicao('leo', 'smiles'))!
  assert.equal(livelo.pontos, 0)
  assert.equal(livelo.custo, 0)
  assert.equal(smiles.pontos, 380000)
  assert.equal(smiles.custo, 576600) // R$ 5.766,00, como na planilha
  assert.equal(Math.round(smiles.cmp!), 1517) // 5766 / 380 = R$ 15,17
  assert.equal(c.custoTransferencias.get('t1')!.cmp, 2883)
})

test('no mesmo dia, entrada vem antes da saída', () => {
  const m = vazio()
  m.saidas.push({ id: 's1', data: d('2026-01-01'), titularId: 't', programaId: 'p', pontos: 1000 })
  m.entradas.push({ id: 'e1', data: d('2026-01-01'), titularId: 't', programaId: 'p', pontos: 1000, valor: 3000 })
  const p = calcularCarteira(m).posicoes.get(chavePosicao('t', 'p'))!
  assert.equal(p.pontos, 0)
  assert.equal(p.menorSaldo, 0)
})

test('saldo negativo é registrado com a data', () => {
  const m = vazio()
  m.entradas.push({ id: 'e1', data: d('2026-01-01'), titularId: 'lea', programaId: 'livelo', pontos: 59700, valor: 0 })
  m.transferencias.push({
    id: 't1', data: d('2026-02-01'), titularId: 'lea', origemId: 'livelo', destinoId: 'smiles', pontos: 375000, pontosDestino: 675000,
  })
  const p = calcularCarteira(m).posicoes.get(chavePosicao('lea', 'livelo'))!
  assert.equal(p.pontos, -315300)
  assert.equal(p.menorSaldo, -315300)
  assert.deepEqual(p.ficouNegativoEm, d('2026-02-01'))
})

test('transferência maior que o saldo leva o último CMP conhecido, não custo zero', () => {
  const m = vazio()
  m.entradas.push({ id: 'e1', data: d('2026-01-01'), titularId: 't', programaId: 'livelo', pontos: 100000, valor: 300000 }) // R$ 30
  m.transferencias.push({
    id: 't1', data: d('2026-01-02'), titularId: 't', origemId: 'livelo', destinoId: 'smiles', pontos: 100000, pontosDestino: 100000,
  })
  // Faltou lançar a compra destes 50 mil: a transferência deixa a Livelo negativa.
  m.transferencias.push({
    id: 't2', data: d('2026-01-03'), titularId: 't', origemId: 'livelo', destinoId: 'smiles', pontos: 50000, pontosDestino: 50000,
  })
  const c = calcularCarteira(m)
  assert.equal(c.posicoes.get(chavePosicao('t', 'livelo'))!.pontos, -50000)
  assert.equal(c.custoTransferencias.get('t2')!.cmp, 3000)
  assert.equal(c.posicoes.get(chavePosicao('t', 'smiles'))!.cmp, 3000)
})

test('ajuste negativo funciona como saída', () => {
  const m = vazio()
  m.entradas.push({ id: 'e1', data: d('2026-01-01'), titularId: 't', programaId: 'p', pontos: 10000, valor: 30000 })
  m.entradas.push({ id: 'e2', data: d('2026-01-02'), titularId: 't', programaId: 'p', pontos: -4000, valor: 0 })
  const p = calcularCarteira(m).posicoes.get(chavePosicao('t', 'p'))!
  assert.equal(p.pontos, 6000)
  assert.equal(p.cmp, 3000)
})

test('extrato mostra o saldo depois de cada movimento', () => {
  const m = vazio()
  m.entradas.push({ id: 'e1', data: d('2026-01-01'), titularId: 't', programaId: 'p', pontos: 10000, valor: 30000 })
  m.saidas.push({ id: 's1', data: d('2026-01-03'), titularId: 't', programaId: 'p', pontos: 2500 })
  const ext = calcularCarteira(m).extratos.get(chavePosicao('t', 'p'))!
  assert.deepEqual(ext.map((l) => l.saldo), [10000, 7500])
  assert.deepEqual(ext.map((l) => l.tipo), ['ENTRADA', 'SAIDA'])
})

test('conferirSaldos bloqueia saída maior que o saldo', () => {
  const antes = vazio()
  antes.entradas.push({ id: 'e1', data: d('2026-01-01'), titularId: 't', programaId: 'p', pontos: 10000, valor: 0 })
  const depois: Movimentos = {
    ...antes,
    saidas: [{ id: 'novo', data: d('2026-01-02'), titularId: 't', programaId: 'p', pontos: 15000 }],
  }
  const r = conferirSaldos(antes, depois, [chavePosicao('t', 'p')])
  assert.ok(r)
  assert.equal(r!.menorSaldo, -5000)
  assert.deepEqual(r!.data, d('2026-01-02'))
})

test('conferirSaldos bloqueia saída com data anterior à entrada', () => {
  const antes = vazio()
  antes.entradas.push({ id: 'e1', data: d('2026-03-01'), titularId: 't', programaId: 'p', pontos: 10000, valor: 0 })
  const depois: Movimentos = {
    ...antes,
    saidas: [{ id: 'novo', data: d('2026-02-01'), titularId: 't', programaId: 'p', pontos: 5000 }],
  }
  assert.ok(conferirSaldos(antes, depois, [chavePosicao('t', 'p')]))
})

test('conferirSaldos não trava quem já estava negativo se a alteração não piora', () => {
  const antes = vazio()
  antes.saidas.push({ id: 's0', data: d('2026-01-01'), titularId: 't', programaId: 'p', pontos: 5000 })
  // Lançar a entrada que faltava melhora o saldo: deve ser aceito.
  const depois: Movimentos = {
    ...antes,
    entradas: [{ id: 'novo', data: d('2026-01-01'), titularId: 't', programaId: 'p', pontos: 3000, valor: 0 }],
  }
  assert.equal(conferirSaldos(antes, depois, [chavePosicao('t', 'p')]), null)
})

test('conferirSaldos bloqueia excluir uma entrada que já foi usada', () => {
  const antes = vazio()
  antes.entradas.push({ id: 'e1', data: d('2026-01-01'), titularId: 't', programaId: 'p', pontos: 10000, valor: 0 })
  antes.saidas.push({ id: 's1', data: d('2026-01-02'), titularId: 't', programaId: 'p', pontos: 8000 })
  const depois: Movimentos = { ...antes, entradas: [] }
  assert.ok(conferirSaldos(antes, depois, [chavePosicao('t', 'p')]))
})
