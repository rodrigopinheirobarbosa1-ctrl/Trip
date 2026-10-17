import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chaveDaLinha, juntarPaginas, montarSugestoes, programaCitado, type LinhaLida } from '../src/lib/extrato/sugestao'

const programas = [
  { id: 'livelo', nome: 'Livelo' },
  { id: 'smiles', nome: 'Smiles' },
  { id: 'azul', nome: 'Azul' },
  { id: 'latam', nome: 'Latam' },
  { id: 'accor', nome: 'All Accor' },
  { id: 'mm', nome: 'Miles & More' },
]
const l = (data: string, operacao: string, descricao: string, pontos: number, pagina = 1, observacao: string | null = null): LinhaLida => ({
  data, operacao, descricao, pontos, observacao, pagina,
})
const vazio = { entradas: [], enviadas: [], recebidas: [], saidas: [] }
const ctx = (extra: Partial<Parameters<typeof montarSugestoes>[1]> = {}) => ({
  programaId: 'livelo',
  programas,
  regras: [],
  existentes: vazio,
  ...extra,
})

test('sugere pelo texto do extrato da Livelo', () => {
  const s = montarSugestoes(
    [
      l('2026-08-26', 'Bônus', 'Clube Livelo', 25000),
      l('2026-08-27', 'Acúmulo', 'Compra de Pontos', 250000),
      l('2026-08-26', 'Acúmulo', 'Clube Livelo', 20000),
      l('2026-09-17', 'Acúmulo', 'Membership Rewards', 253),
      l('2026-08-27', 'Resgate', 'Smiles', -290000),
      l('2026-03-14', 'Pontos + Dinheiro', 'Cvc', -107880, 1, 'pagamento em dinheiro'),
      l('2026-03-07', 'Pontos + Dinheiro', 'Smiles', -700, 1, 'pagamento em dinheiro'),
    ],
    ctx(),
  )
  assert.deepEqual(
    s.map((x) => [x.acao, x.outroProgramaId]),
    [
      ['BONUS', null],
      ['COMPRA', null],
      ['COMPRA', null],
      ['ACUMULO', null],
      ['TRANSF_ENVIADA', 'smiles'],
      ['USO_PESSOAL', null],
      ['TRANSF_IMEDIATA', 'smiles'], // "Pontos + Dinheiro" na Smiles: parte dos pontos foi comprada na hora
    ],
  )
})

test('marca o que já foi lançado (mesmos pontos, até 3 dias de diferença)', () => {
  const s = montarSugestoes(
    [
      l('2026-08-27', 'Acúmulo', 'Compra de Pontos', 250000),
      l('2026-08-27', 'Resgate', 'Smiles', -290000),
      l('2026-09-01', 'Acúmulo', 'Compra de Pontos', 250000),
    ],
    ctx({
      existentes: {
        ...vazio,
        entradas: [{ id: 'e1', data: new Date('2026-08-25T00:00:00Z'), pontos: 250000 }],
        enviadas: [{ id: 't1', data: new Date('2026-08-28T00:00:00Z'), pontos: 290000 }],
      },
    }),
  )
  assert.deepEqual(s[0].jaLancado, { tipo: 'ENTRADA', id: 'e1', data: '2026-08-25' })
  assert.deepEqual(s[1].jaLancado, { tipo: 'TRANSFERENCIA', id: 't1', data: '2026-08-28' })
  // A mesma entrada existente não serve para duas linhas.
  assert.equal(s[2].jaLancado, null)
})

test('regra aprendida tem prioridade sobre o texto', () => {
  const linha = l('2026-09-26', 'Acúmulo', 'Clube Livelo', 20000)
  const s = montarSugestoes([linha], ctx({
    regras: [{ chave: chaveDaLinha(linha), acao: 'COMPRA', outroProgramaId: null, valorMilheiro: 3500, bonusPercentual: null }],
  }))
  assert.equal(s[0].acao, 'COMPRA')
  assert.equal(s[0].valorMilheiro, 3500)
  assert.match(s[0].motivo, /última vez/)
})

test('regra de entrada não vale para linha de saída', () => {
  const linha = l('2026-09-26', 'Resgate', 'Smiles', -1000)
  const s = montarSugestoes([linha], ctx({
    regras: [{ chave: chaveDaLinha(linha), acao: 'COMPRA', outroProgramaId: null, valorMilheiro: null, bonusPercentual: null }],
  }))
  assert.equal(s[0].acao, 'TRANSF_ENVIADA')
})

test('tira só a repetição entre prints diferentes', () => {
  const p1 = [l('2026-09-17', 'Acúmulo', 'Membership Rewards', 253, 1), l('2026-09-17', 'Acúmulo', 'Membership Rewards', 253, 1)]
  // O segundo print começa repetindo uma das linhas do primeiro.
  const p2 = [l('2026-09-17', 'Acúmulo', 'Membership Rewards', 253, 2), l('2026-08-27', 'Resgate', 'Smiles', -290000, 2)]
  const r = juntarPaginas([p1, p2])
  assert.equal(r.length, 3)
  assert.equal(r.filter((x) => x.pontos === 253).length, 2)
})

test('reconhece o programa citado', () => {
  assert.equal(programaCitado('Resgate Smiles', programas, 'livelo'), 'smiles')
  assert.equal(programaCitado('Membership Rewards', programas, 'livelo'), null)
  assert.equal(programaCitado('Transferência Livelo', programas, 'livelo'), null) // o próprio programa
})

test('reconhece nomes parecidos sem confundir Smiles com Miles & More', () => {
  assert.equal(programaCitado('AccorHotels', programas, 'livelo'), 'accor')
  assert.equal(programaCitado('Smiles', programas, 'livelo'), 'smiles')
  assert.equal(programaCitado('Miles & More', programas, 'livelo'), 'mm')
})

test('transferência para o grupo da família vira outra saída', () => {
  const s = montarSugestoes([l('2025-12-15', 'Pontos Transferidos', 'Livelo - grupo de transferência', -60000)], ctx())
  assert.equal(s[0].acao, 'OUTRA_SAIDA')
})

const recebida = (id: string, data: string, pontos: number, pontosDestino: number, origemId = 'livelo', bonusPercentual = 0) => ({
  id, data: new Date(`${data}T00:00:00Z`), pontos, pontosDestino, origemId, bonusPercentual,
})

test('transferência já lançada sem o bônus: sugere corrigir o bônus', () => {
  const s = montarSugestoes([l('2026-06-22', 'Transferência', 'Livelo', 95000)], ctx({
    programaId: 'azul',
    existentes: { ...vazio, recebidas: [recebida('t1', '2026-06-22', 50000, 50000)] },
  }))
  assert.equal(s[0].jaLancado, null)
  assert.deepEqual(s[0].corrigirBonus, {
    id: 't1', data: '2026-06-22', origemId: 'livelo', pontos: 50000,
    bonusAtual: 0, pontosDestinoAtual: 50000, bonusNovo: 90, pontosDestinoNovo: 95000,
  })
  assert.equal(s[0].acao, 'TRANSF_RECEBIDA')
})

test('extrato com a transferência e o bônus em duas linhas: já lançado, nada a corrigir', () => {
  const s = montarSugestoes(
    [l('2026-06-22', 'Transferência', 'Livelo', 50000), l('2026-06-22', 'Bônus', 'Bônus transferência Livelo', 45000)],
    ctx({ programaId: 'azul', existentes: { ...vazio, recebidas: [recebida('t1', '2026-06-22', 50000, 95000, 'livelo', 90)] } }),
  )
  assert.equal(s[0].jaLancado?.id, 't1')
  assert.equal(s[1].jaLancado?.id, 't1')
  assert.equal(s[0].corrigirBonus, null)
  assert.equal(s[1].corrigirBonus, null)
})

test('não sugere corrigir transferência de outro programa, longe da data ou já casada', () => {
  const s = montarSugestoes(
    [
      l('2026-06-22', 'Transferência', 'Livelo', 95000),
      l('2026-06-22', 'Acúmulo', 'Compra no cartão', 3000),
      l('2026-07-10', 'Transferência', 'Smiles', 20000),
    ],
    ctx({
      programaId: 'azul',
      existentes: {
        ...vazio,
        recebidas: [
          recebida('t1', '2026-06-22', 50000, 50000, 'smiles'), // cita Livelo, mas veio da Smiles
          recebida('t2', '2026-06-01', 10000, 10000, 'smiles'), // data longe
        ],
      },
    }),
  )
  assert.deepEqual(s.map((x) => x.corrigirBonus), [null, null, null])
})

test('transferência imediata já lançada (compra + transferência maior) casa com a linha do extrato', () => {
  const s = montarSugestoes([l('2026-03-03', 'Pontos + Dinheiro', 'Azul', -1600, 1, 'pagamento em dinheiro')], ctx({
    existentes: {
      ...vazio,
      entradas: [{ id: 'c1', data: new Date('2026-03-03T00:00:00Z'), pontos: 158400 }],
      enviadas: [{ id: 't1', data: new Date('2026-03-03T00:00:00Z'), pontos: 160000 }],
    },
  }))
  assert.deepEqual(s[0].jaLancado, { tipo: 'TRANSFERENCIA', id: 't1', data: '2026-03-03', compraId: 'c1' })
})

test('linha da companhia aérea com "Pontos <programa>" vira transferência recebida', () => {
  const s = montarSugestoes([l('2026-03-03', 'Acúmulo', 'Acúmulo de ponto - Pontos Livelo', 340800)], ctx({ programaId: 'azul' }))
  assert.equal(s[0].acao, 'TRANSF_RECEBIDA')
  assert.equal(s[0].outroProgramaId, 'livelo')
})
