import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  calcularCarteira,
  calcularCmpRecente,
  calcularPontosDestino,
  chavePosicao,
  conferirSaldos,
  previaPeps,
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

test('CMP da posição é a média dos lotes que ainda têm pontos', () => {
  const m = vazio()
  m.entradas.push({ id: 'e1', data: d('2026-01-01'), titularId: 't', programaId: 'p', pontos: 100000, valor: 300000 }) // 30,00
  m.entradas.push({ id: 'e2', data: d('2026-01-02'), titularId: 't', programaId: 'p', pontos: 100000, valor: 200000 }) // 20,00
  const p = calcularCarteira(m).posicoes.get(chavePosicao('t', 'p'))!
  assert.equal(p.pontos, 200000)
  assert.equal(p.cmp, 2500)
})

test('PEPS: a venda consome primeiro o lote mais antigo', () => {
  const m = vazio()
  // Compra cara em janeiro, promoção barata em fevereiro.
  m.entradas.push({ id: 'cara', data: d('2026-01-10'), titularId: 't', programaId: 'p', pontos: 100000, valor: 220000 }) // R$ 22
  m.entradas.push({ id: 'promo', data: d('2026-02-10'), titularId: 't', programaId: 'p', pontos: 100000, valor: 120000 }) // R$ 12
  m.saidas.push({ id: 'v1', data: d('2026-03-10'), titularId: 't', programaId: 'p', pontos: 150000 })
  const c = calcularCarteira(m)
  const venda = c.custoSaidas.get('v1')!
  // 100 mil a R$ 22 + 50 mil a R$ 12 = R$ 2.800 (R$ 18,67 o milheiro)
  assert.equal(venda.custo, 280000)
  assert.equal(Math.round(venda.cmp), 1867)
  assert.deepEqual(venda.lotes.map((l) => [l.loteId, l.pontos]), [['cara', 100000], ['promo', 50000]])
  // Sobram só os pontos da promoção, a R$ 12.
  const p = c.posicoes.get(chavePosicao('t', 'p'))!
  assert.equal(p.pontos, 50000)
  assert.equal(p.cmp, 1200)
  const lotes = c.lotes.get(chavePosicao('t', 'p'))!
  assert.deepEqual(lotes.map((l) => l.restantes), [0, 50000])
})

test('PEPS: compra cara antiga não contamina o custo depois de consumida', () => {
  const m = vazio()
  m.entradas.push({ id: 'cara', data: d('2026-01-01'), titularId: 't', programaId: 'p', pontos: 100000, valor: 220000 })
  m.saidas.push({ id: 'v1', data: d('2026-01-05'), titularId: 't', programaId: 'p', pontos: 100000 })
  m.entradas.push({ id: 'normal', data: d('2026-02-01'), titularId: 't', programaId: 'p', pontos: 100000, valor: 160000 })
  m.saidas.push({ id: 'v2', data: d('2026-02-05'), titularId: 't', programaId: 'p', pontos: 40000 })
  const c = calcularCarteira(m)
  assert.equal(c.custoSaidas.get('v2')!.cmp, 1600)
  assert.equal(c.posicoes.get(chavePosicao('t', 'p'))!.cmp, 1600)
})

test('saída dentro de um lote só usa o custo daquele lote', () => {
  const m = vazio()
  m.entradas.push({ id: 'e1', data: d('2026-01-01'), titularId: 't', programaId: 'p', pontos: 100000, valor: 300000 })
  m.saidas.push({ id: 's1', data: d('2026-01-05'), titularId: 't', programaId: 'p', pontos: 40000 })
  const c = calcularCarteira(m)
  const p = c.posicoes.get(chavePosicao('t', 'p'))!
  assert.equal(p.pontos, 60000)
  assert.equal(p.cmp, 3000)
  assert.equal(c.custoSaidas.get('s1')!.custo, 120000) // 40 milheiros x R$ 30
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

test('transferência vira um lote no destino com o custo dos lotes da origem', () => {
  const m = vazio()
  m.entradas.push({ id: 'l1', data: d('2026-01-01'), titularId: 't', programaId: 'livelo', pontos: 100000, valor: 300000 }) // R$ 30
  m.entradas.push({ id: 'l2', data: d('2026-01-02'), titularId: 't', programaId: 'livelo', pontos: 100000, valor: 250000 }) // R$ 25
  m.transferencias.push({
    id: 't1', data: d('2026-01-10'), titularId: 't', origemId: 'livelo', destinoId: 'smiles', pontos: 150000, pontosDestino: 300000,
  })
  const c = calcularCarteira(m)
  // 100 mil a R$ 30 + 50 mil a R$ 25 = R$ 4.250 levados para 300 mil Smiles (R$ 14,17)
  const lote = c.lotes.get(chavePosicao('t', 'smiles'))![0]
  assert.equal(lote.origem, 'TRANSFERENCIA')
  assert.equal(lote.custo, 425000)
  assert.equal(Math.round(lote.cmp), 1417)
  assert.equal(c.posicoes.get(chavePosicao('t', 'livelo'))!.cmp, 2500)
})

test('falta de saldo: a próxima entrada cobre primeiro o déficit', () => {
  const m = vazio()
  m.entradas.push({ id: 'e1', data: d('2026-01-01'), titularId: 't', programaId: 'p', pontos: 10000, valor: 30000 })
  m.saidas.push({ id: 's1', data: d('2026-01-02'), titularId: 't', programaId: 'p', pontos: 15000 })
  m.entradas.push({ id: 'e2', data: d('2026-01-03'), titularId: 't', programaId: 'p', pontos: 20000, valor: 40000 })
  const c = calcularCarteira(m)
  const s1 = c.custoSaidas.get('s1')!
  assert.equal(s1.semLote, 5000)
  assert.equal(s1.custo, 45000) // 10 mil do lote + 5 mil pelo último CMP (R$ 30)
  const p = c.posicoes.get(chavePosicao('t', 'p'))!
  assert.equal(p.pontos, 15000)
  const e2 = c.lotes.get(chavePosicao('t', 'p'))![1]
  assert.equal(e2.cobriuDeficit, 5000)
  assert.equal(e2.restantes, 15000)
})

test('prévia PEPS nos formulários', () => {
  assert.deepEqual(previaPeps([[100000, 2200], [100000, 1200]], 150000), { custo: 280000, cmp: (280000 / 150000) * 1000 })
  assert.equal(previaPeps([[1000, 2000]], 5000), null)
})

test('CMP recente: só o que entrou no período, sem saldo inicial', () => {
  const m = vazio()
  m.entradas.push({ id: 'si', data: d('2026-01-01'), titularId: 't', programaId: 'p', pontos: 500000, valor: 1500000, categoria: 'SALDO_INICIAL' })
  m.entradas.push({ id: 'velha', data: d('2026-02-01'), titularId: 't', programaId: 'p', pontos: 100000, valor: 300000, categoria: 'COMPRA' })
  m.entradas.push({ id: 'promo', data: d('2026-09-01'), titularId: 't', programaId: 'p', pontos: 100000, valor: 110000, categoria: 'COMPRA' })
  m.entradas.push({ id: 'bonus', data: d('2026-09-02'), titularId: 't', programaId: 'p', pontos: 10000, valor: 0, categoria: 'BONUS' })
  const c = calcularCarteira(m)
  const r = calcularCmpRecente(m, c, d('2026-07-18'), d('2026-10-16')).get(chavePosicao('t', 'p'))!
  assert.equal(r.pontos, 110000)
  assert.equal(r.custo, 110000)
  assert.equal(r.cmp, 1000)
})
