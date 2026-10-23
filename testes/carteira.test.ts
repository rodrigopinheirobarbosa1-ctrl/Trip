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

const PEPS = { metodo: 'PEPS' as const }

const d = (s: string) => new Date(`${s}T00:00:00Z`)
const vazio = (): Movimentos => ({ entradas: [], transferencias: [], saidas: [] })

test('CMP de uma compra simples', () => {
  const m = vazio()
  // 254.805 pontos Livelo por R$ 7.725,69 -> R$ 30,32 o milheiro
  m.entradas.push({ id: 'e1', data: d('2026-01-01'), titularId: 'alex', programaId: 'livelo', pontos: 254805, valor: 772569 })
  const c = calcularCarteira(m, undefined, PEPS)
  const p = c.posicoes.get(chavePosicao('alex', 'livelo'))!
  assert.equal(p.pontos, 254805)
  assert.equal(Math.round(p.cmp!), 3032)
})

test('CMP da posição é a média dos lotes que ainda têm pontos', () => {
  const m = vazio()
  m.entradas.push({ id: 'e1', data: d('2026-01-01'), titularId: 't', programaId: 'p', pontos: 100000, valor: 300000 }) // 30,00
  m.entradas.push({ id: 'e2', data: d('2026-01-02'), titularId: 't', programaId: 'p', pontos: 100000, valor: 200000 }) // 20,00
  const p = calcularCarteira(m, undefined, PEPS).posicoes.get(chavePosicao('t', 'p'))!
  assert.equal(p.pontos, 200000)
  assert.equal(p.cmp, 2500)
})

test('PEPS: a venda consome primeiro o lote mais antigo', () => {
  const m = vazio()
  // Compra cara em janeiro, promoção barata em fevereiro.
  m.entradas.push({ id: 'cara', data: d('2026-01-10'), titularId: 't', programaId: 'p', pontos: 100000, valor: 220000 }) // R$ 22
  m.entradas.push({ id: 'promo', data: d('2026-02-10'), titularId: 't', programaId: 'p', pontos: 100000, valor: 120000 }) // R$ 12
  m.saidas.push({ id: 'v1', data: d('2026-03-10'), titularId: 't', programaId: 'p', pontos: 150000 })
  const c = calcularCarteira(m, undefined, PEPS)
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
  const c = calcularCarteira(m, undefined, PEPS)
  assert.equal(c.custoSaidas.get('v2')!.cmp, 1600)
  assert.equal(c.posicoes.get(chavePosicao('t', 'p'))!.cmp, 1600)
})

test('saída dentro de um lote só usa o custo daquele lote', () => {
  const m = vazio()
  m.entradas.push({ id: 'e1', data: d('2026-01-01'), titularId: 't', programaId: 'p', pontos: 100000, valor: 300000 })
  m.saidas.push({ id: 's1', data: d('2026-01-05'), titularId: 't', programaId: 'p', pontos: 40000 })
  const c = calcularCarteira(m, undefined, PEPS)
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
  const c = calcularCarteira(m, undefined, PEPS)
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
  const p = calcularCarteira(m, undefined, PEPS).posicoes.get(chavePosicao('t', 'p'))!
  assert.equal(p.pontos, 0)
  assert.equal(p.menorSaldo, 0)
})

test('saldo negativo é registrado com a data', () => {
  const m = vazio()
  m.entradas.push({ id: 'e1', data: d('2026-01-01'), titularId: 'lea', programaId: 'livelo', pontos: 59700, valor: 0 })
  m.transferencias.push({
    id: 't1', data: d('2026-02-01'), titularId: 'lea', origemId: 'livelo', destinoId: 'smiles', pontos: 375000, pontosDestino: 675000,
  })
  const p = calcularCarteira(m, undefined, PEPS).posicoes.get(chavePosicao('lea', 'livelo'))!
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
  const c = calcularCarteira(m, undefined, PEPS)
  assert.equal(c.posicoes.get(chavePosicao('t', 'livelo'))!.pontos, -50000)
  assert.equal(c.custoTransferencias.get('t2')!.cmp, 3000)
  assert.equal(c.posicoes.get(chavePosicao('t', 'smiles'))!.cmp, 3000)
})

test('ajuste negativo funciona como saída', () => {
  const m = vazio()
  m.entradas.push({ id: 'e1', data: d('2026-01-01'), titularId: 't', programaId: 'p', pontos: 10000, valor: 30000 })
  m.entradas.push({ id: 'e2', data: d('2026-01-02'), titularId: 't', programaId: 'p', pontos: -4000, valor: 0 })
  const p = calcularCarteira(m, undefined, PEPS).posicoes.get(chavePosicao('t', 'p'))!
  assert.equal(p.pontos, 6000)
  assert.equal(p.cmp, 3000)
})

test('extrato mostra o saldo depois de cada movimento', () => {
  const m = vazio()
  m.entradas.push({ id: 'e1', data: d('2026-01-01'), titularId: 't', programaId: 'p', pontos: 10000, valor: 30000 })
  m.saidas.push({ id: 's1', data: d('2026-01-03'), titularId: 't', programaId: 'p', pontos: 2500 })
  const ext = calcularCarteira(m, undefined, PEPS).extratos.get(chavePosicao('t', 'p'))!
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
  const c = calcularCarteira(m, undefined, PEPS)
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
  const c = calcularCarteira(m, undefined, PEPS)
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
  const c = calcularCarteira(m, undefined, PEPS)
  const r = calcularCmpRecente(m, c, d('2026-07-18'), d('2026-10-16')).get(chavePosicao('t', 'p'))!
  assert.equal(r.pontos, 110000)
  assert.equal(r.custo, 110000)
  assert.equal(r.cmp, 1000)
})

test('transferência imediata usa primeiro o lote da compra feita na hora', () => {
  const m = vazio()
  // Lote antigo caro na Livelo e a compra da transferência imediata (Rodrigo, 03/03/2026).
  m.entradas.push({ id: 'antigo', data: d('2026-01-10'), titularId: 'r', programaId: 'livelo', pontos: 50000, valor: 190000 }) // R$ 38
  m.entradas.push({ id: 'compra', data: d('2026-03-03'), titularId: 'r', programaId: 'livelo', pontos: 158400, valor: 424512 }) // R$ 26,80
  m.transferencias.push({
    id: 't', data: d('2026-03-03'), titularId: 'r', origemId: 'livelo', destinoId: 'azul',
    pontos: 160000, pontosDestino: 340800, compraId: 'compra',
  })
  const c = calcularCarteira(m, undefined, PEPS)
  const custo = c.custoTransferencias.get('t')!
  // 158.400 da compra + 1.600 do lote antigo.
  assert.deepEqual(custo.lotes.map((l) => [l.loteId, l.pontos]), [['compra', 158400], ['antigo', 1600]])
  assert.equal(Math.round(custo.custo), 424512 + 6080)
  // O lote antigo continua quase inteiro na Livelo, com o custo dele.
  const livelo = c.posicoes.get(chavePosicao('r', 'livelo'))!
  assert.equal(livelo.pontos, 48400)
  assert.equal(Math.round(livelo.cmp!), 3800)
  // Na Azul: (R$ 4.245,12 + R$ 60,80) / 340.800 = R$ 12,63 o milheiro.
  assert.equal(Math.round(c.posicoes.get(chavePosicao('r', 'azul'))!.cmp!), 1263)
})

test('sem a compra ligada, a transferência segue o PEPS normal', () => {
  const m = vazio()
  m.entradas.push({ id: 'antigo', data: d('2026-01-10'), titularId: 'r', programaId: 'livelo', pontos: 50000, valor: 190000 })
  m.entradas.push({ id: 'compra', data: d('2026-03-03'), titularId: 'r', programaId: 'livelo', pontos: 158400, valor: 424512 })
  m.transferencias.push({ id: 't', data: d('2026-03-03'), titularId: 'r', origemId: 'livelo', destinoId: 'azul', pontos: 160000, pontosDestino: 340800 })
  const custo = calcularCarteira(m, undefined, PEPS).custoTransferencias.get('t')!
  assert.deepEqual(custo.lotes.map((l) => [l.loteId, l.pontos]), [['antigo', 50000], ['compra', 110000]])
})

test('transferência maior que o saldo da origem: os pontos que faltaram ficam marcados', () => {
  const m = vazio()
  m.entradas.push({ id: 'e', data: d('2026-07-01'), titularId: 'lea', programaId: 'livelo', pontos: 60000, valor: 180000 }) // R$ 30
  m.transferencias.push({ id: 't', data: d('2026-07-28'), titularId: 'lea', origemId: 'livelo', destinoId: 'smiles', pontos: 375000, pontosDestino: 675000 })
  const c = calcularCarteira(m, undefined, PEPS).custoTransferencias.get('t')!
  assert.equal(c.semLote, 315000)
  assert.equal(c.lotes.reduce((s, l) => s + l.pontos, 0), 60000)
})

// ---------- Custo médio por trimestre ----------


test('trimestre: o bônus do clube divide o custo com as mensalidades, mesmo para quem saiu antes dele', () => {
  // Clube de 20.000 por R$ 760 em jul, ago e set; bônus de 17.000 em jul.
  const m: Movimentos = {
    entradas: [
      { id: 'jul', data: d('2026-07-15'), titularId: 't', programaId: 'liv', pontos: 20000, valor: 76000 },
      { id: 'bon', data: d('2026-07-15'), titularId: 't', programaId: 'liv', pontos: 17000, valor: 0 },
      { id: 'ago', data: d('2026-08-15'), titularId: 't', programaId: 'liv', pontos: 20000, valor: 76000 },
      { id: 'set', data: d('2026-09-15'), titularId: 't', programaId: 'liv', pontos: 20000, valor: 76000 },
    ],
    transferencias: [
      { id: 'smiles', data: d('2026-08-10'), titularId: 't', origemId: 'liv', destinoId: 'smi', pontos: 37000, pontosDestino: 37000 },
      { id: 'latam', data: d('2026-09-21'), titularId: 't', origemId: 'liv', destinoId: 'lat', pontos: 40000, pontosDestino: 50000 },
    ],
    saidas: [],
  }
  const c = calcularCarteira(m, undefined, { hoje: d('2026-12-01') })
  const media = (3 * 76000) / 77000 * 1000 // 2.961,04 centavos o milheiro
  assert.ok(Math.abs(c.custoTransferencias.get('smiles')!.cmp - media) < 0.01)
  assert.ok(Math.abs(c.custoTransferencias.get('latam')!.cmp - media) < 0.01)
  // Na Latam, os 10.000 de bônus da transferência baixam o custo: 40.000 * média / 50.000.
  assert.ok(Math.abs(c.posicoes.get(chavePosicao('t', 'lat'))!.cmp! - media * 0.8) < 0.01)
  assert.equal(c.custoTransferencias.get('latam')!.provisorio, false)
  // Com PEPS, a Smiles ficava com o bônus e a Latam pagava 38 o milheiro.
  const p = calcularCarteira(m, undefined, PEPS)
  assert.ok(p.custoTransferencias.get('latam')!.cmp > 3700)
})

test('trimestre: trimestres diferentes não se misturam e saldo inicial fica fora da média', () => {
  const m: Movimentos = {
    entradas: [
      { id: 'ini', data: d('2026-01-01'), titularId: 't', programaId: 'p', pontos: 10000, valor: 50000, categoria: 'SALDO_INICIAL' },
      { id: 'c1', data: d('2026-02-01'), titularId: 't', programaId: 'p', pontos: 10000, valor: 30000 },
      { id: 'b1', data: d('2026-03-01'), titularId: 't', programaId: 'p', pontos: 10000, valor: 0 },
      { id: 'c2', data: d('2026-04-01'), titularId: 't', programaId: 'p', pontos: 10000, valor: 20000 },
    ],
    transferencias: [],
    saidas: [{ id: 's', data: d('2026-04-10'), titularId: 't', programaId: 'p', pontos: 25000 }],
  }
  const c = calcularCarteira(m, undefined, { hoje: d('2026-04-20') })
  const s = c.custoSaidas.get('s')!
  // PEPS entre lotes: 10.000 do saldo inicial (50,00), 15.000 do 1º tri (média 15,00).
  assert.deepEqual(s.lotes.map((l) => [l.pontos, Math.round(l.cmp)]), [[10000, 5000], [10000, 1500], [5000, 1500]])
  assert.equal(Math.round(s.custo), 50000 + 22500)
  assert.equal(s.provisorio, false)
  // Sobram 5.000 do 1º tri e 10.000 do 2º tri, cada um com a sua média.
  const lotes = c.lotes.get(chavePosicao('t', 'p'))!
  assert.deepEqual(lotes.filter((l) => l.restantes > 0).map((l) => [l.trimestre, l.restantes, Math.round(l.cmp)]), [
    ['2026-T1', 5000, 1500],
    ['2026-T2', 10000, 2000],
  ])
})

test('trimestre: saída que usa pontos do trimestre aberto fica provisória e muda quando entra o bônus', () => {
  const base: Movimentos = {
    entradas: [{ id: 'c', data: d('2026-10-05'), titularId: 't', programaId: 'p', pontos: 20000, valor: 80000 }],
    transferencias: [],
    saidas: [{ id: 's', data: d('2026-10-10'), titularId: 't', programaId: 'p', pontos: 10000 }],
  }
  const antes = calcularCarteira(base, undefined, { hoje: d('2026-10-20') }).custoSaidas.get('s')!
  assert.equal(antes.provisorio, true)
  assert.equal(Math.round(antes.custo), 40000)
  const comBonus = { ...base, entradas: [...base.entradas, { id: 'b', data: d('2026-11-05'), titularId: 't', programaId: 'p', pontos: 20000, valor: 0 }] }
  const depois = calcularCarteira(comBonus, undefined, { hoje: d('2026-11-20') }).custoSaidas.get('s')!
  assert.equal(Math.round(depois.custo), 20000)
})
