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

const smiles = (extra: Partial<Parameters<typeof montarSugestoes>[1]> = {}) => ctx({ programaId: 'smiles', ...extra })

test('Smiles: transferência lançada sem bônus e o bônus numa linha à parte (19/05)', () => {
  const s = montarSugestoes(
    [
      l('2026-05-19', 'Transferência de pontos - Maio 26', 'Transferência de pontos', 56000, 1, 'Parceiro: LIVELO S.A. · Bônus: 18/05 WL ate 80%'),
      l('2026-05-19', 'Pontos Livelo', 'Pontos Livelo', 70000, 1, 'Parceiro: LIVELO S.A.'),
    ],
    smiles({ existentes: { ...vazio, recebidas: [recebida('t1', '2026-05-19', 70000, 70000)] } }),
  )
  const principal = s.find((x) => x.linha.pontos === 70000)!
  const bonus = s.find((x) => x.linha.pontos === 56000)!
  assert.equal(principal.jaLancado, null)
  assert.equal(principal.corrigirBonus?.pontosDestinoNovo, 126000)
  assert.equal(principal.corrigirBonus?.bonusNovo, 80)
  assert.equal(bonus.parteDe, 't1')
})

test('Smiles: bônus lançado errado (80% no sistema, 70% no extrato)', () => {
  const s = montarSugestoes(
    [
      l('2026-07-28', 'Transf. Pontos + CM - Bônus', 'Transf. Pontos + CM - Bônus Julho', 34300, 1, 'Parceiro: LIVELO S.A.'),
      l('2026-07-28', 'Pontos Livelo', 'Pontos Livelo', 49000, 1, 'Parceiro: LIVELO S.A.'),
    ],
    smiles({ existentes: { ...vazio, recebidas: [recebida('t1', '2026-07-28', 49000, 88200, 'livelo', 80)] } }),
  )
  const principal = s.find((x) => x.linha.pontos === 49000)!
  assert.equal(principal.corrigirBonus?.pontosDestinoNovo, 83300)
  assert.equal(principal.corrigirBonus?.bonusNovo, 70)
  assert.equal(s.find((x) => x.linha.pontos === 34300)!.parteDe, 't1')
})

test('Smiles: pontos + bônus que somam o total lançado ficam como já lançados (07/03)', () => {
  const s = montarSugestoes(
    [
      l('2026-03-07', 'Bônus Transf. Pontos', 'Bônus Transf. Pontos Consumidor - 03/2026', 42000),
      l('2026-03-07', 'Pontos Livelo', 'Pontos Livelo', 70000),
    ],
    smiles({ existentes: { ...vazio, recebidas: [recebida('t1', '2026-03-07', 70000, 112000, 'livelo', 60)] } }),
  )
  assert.deepEqual(s.map((x) => [x.jaLancado?.id, x.corrigirBonus, x.parteDe]), [['t1', null, null], ['t1', null, null]])
})

test('resgate cancelado e devolvido: as duas linhas se anulam; a emissão lançada vai para excluir', () => {
  const s = montarSugestoes(
    [
      { ...l('2026-06-19', 'Passagem aérea', 'Passagem aérea', -120400), localizador: 'IXYIJX' },
      { ...l('2026-06-19', 'Passagem aérea', 'Passagem aérea', 120400), localizador: 'LZDRFK' },
      { ...l('2026-06-19', 'Passagem aérea', 'Passagem aérea', -120400), localizador: 'LZDRFK' },
    ],
    smiles({ existentes: { ...vazio, saidas: [{ id: 's1', data: new Date('2026-06-19T00:00:00Z'), pontos: 120400 }] } }),
  )
  // A primeira casa com a saída lançada; a devolução anula a outra do mesmo localizador.
  assert.equal(s[0].jaLancado?.id, 's1')
  assert.equal(s[1].acao, 'IGNORAR')
  assert.equal(s[2].acao, 'IGNORAR')
  assert.match(s[1].motivo, /resgate cancelado/)
})

test('reembolso da Azul anula o resgate do mesmo valor', () => {
  const s = montarSugestoes(
    [l('2026-06-27', 'Reembolso', 'Reembolso - Azul', 380000), l('2026-06-27', 'Resgate', 'Resgate - Azul', -380000)],
    ctx({ programaId: 'azul' }),
  )
  assert.deepEqual(s.map((x) => x.acao), ['IGNORAR', 'IGNORAR'])
})

test('Smiles sem a transferência lançada: pontos viram transferência e o bônus vira bônus', () => {
  const s = montarSugestoes(
    [
      l('2026-08-27', 'Transf. Pontos + CM - Bônus', 'Transf. Pontos + CM - Bônus Agosto', 232000, 1, 'Parceiro: LIVELO S.A. · Bônus: 27/08 WL ate 80%'),
      l('2026-08-27', 'Pontos Livelo', 'Pontos Livelo', 290000, 1, 'Parceiro: LIVELO S.A.'),
      l('2026-03-20', 'Pontos Clube Livelo', 'Pontos Clube Livelo', 239000, 1, 'Parceiro: LIVELO S.A.'),
    ],
    smiles(),
  )
  assert.deepEqual(s.map((x) => [x.acao, x.outroProgramaId]), [['BONUS', null], ['TRANSF_RECEBIDA', 'livelo'], ['TRANSF_RECEBIDA', 'livelo']])
})

const accor = (extra: Partial<Parameters<typeof montarSugestoes>[1]> = {}) => ctx({ programaId: 'accor', ...extra })

test('All Accor: reserva cancelada semanas depois anula o resgate (os dois ficam de fora)', () => {
  const s = montarSugestoes(
    [
      { ...l('2026-03-01', 'Resgate', 'Reserva Novotel', -10000), localizador: '12345678' },
      { ...l('2026-04-20', 'Crédito', 'Cancelamento de reserva', 10000), localizador: '12345678' },
    ],
    accor(),
  )
  assert.deepEqual(s.map((x) => x.acao), ['IGNORAR', 'IGNORAR'])
})

test('All Accor: reimportando, a devolução gravada como entrada e a reserva lançada vêm para excluir', () => {
  const s = montarSugestoes(
    [
      l('2026-03-01', 'Uso pessoal', 'Estadia paga com pontos: Novotel Lisboa', -10000),
      l('2026-04-20', 'Crédito', 'Reserva cancelada: Novotel Lisboa', 10000),
    ],
    accor({
      existentes: {
        ...vazio,
        entradas: [{ id: 'e-devolucao', data: new Date('2026-04-20T00:00:00Z'), pontos: 10000 }],
        saidas: [{ id: 's-reserva', data: new Date('2026-03-01T00:00:00Z'), pontos: 10000 }],
      },
    }),
  )
  assert.deepEqual(s.map((x) => [x.acao, x.jaLancado]), [['IGNORAR', null], ['IGNORAR', null]])
  assert.deepEqual(s.flatMap((x) => x.excluirSugerido).sort(), ['e-devolucao', 's-reserva'])
})

test('All Accor: devolução de reserva feita antes do extrato exclui a emissão lançada', () => {
  const s = montarSugestoes(
    [l('2026-04-20', 'Crédito', 'Reserva cancelada: ibis Rio De Janeiro Barra Da Tijuca', 8000)],
    accor({
      existentes: {
        ...vazio,
        saidas: [
          // Mesmo valor, outro hotel: não pode ser esta.
          { id: 's-outro-hotel', data: new Date('2026-03-10T00:00:00Z'), pontos: 8000, texto: 'Estadia paga com pontos: Mercure Porto Gaia' },
          { id: 's-antiga', data: new Date('2026-02-10T00:00:00Z'), pontos: 8000, texto: 'Estadia paga com pontos: ibis Rio De Janeiro Barra Da Tijuca' },
        ],
      },
    }),
  )
  assert.equal(s[0].acao, 'IGNORAR')
  assert.deepEqual(s[0].anulaSaida, { id: 's-antiga', data: '2026-02-10' })
  assert.deepEqual(s[0].excluirSugerido, ['s-antiga'])
})

test('devolução sem texto de cancelamento não procura resgate antigo', () => {
  const s = montarSugestoes(
    [l('2026-03-01', 'Resgate', 'Passagem aérea', -10000), l('2026-04-20', 'Acúmulo', 'Passagem aérea', 10000)],
    ctx({ programaId: 'smiles' }),
  )
  assert.notEqual(s[1].acao, 'IGNORAR')
})

test('All Accor: devolução não casa com reserva de mesmo valor em outro hotel', () => {
  const s = montarSugestoes(
    [
      l('2026-08-16', 'Uso pessoal', 'Estadia paga com pontos: Mercure Porto Gaia Hotel', -6000),
      l('2026-09-14', 'Crédito', 'Reserva cancelada: ibis Porto Centro Mercado Do Bolhao', 6000),
      l('2026-08-16', 'Uso pessoal', 'Estadia paga com pontos: Mercure Porto Centro Aliados', -12000),
      l('2026-09-04', 'Crédito', 'Reserva cancelada: Mercure Porto Centro Aliados', 12000),
    ],
    accor(),
  )
  assert.deepEqual(s.map((x) => [x.linha.pontos, x.acao === 'IGNORAR']), [[-6000, false], [6000, false], [-12000, true], [12000, true]])
})
