import { test } from 'node:test'
import assert from 'node:assert/strict'
import { custoDaEntrada } from '../src/lib/custo-atribuido'
import { montarSugestoes, type LinhaLida } from '../src/lib/extrato/sugestao'

test('parceiro sem valor usa o custo padrão do programa; com valor, o próprio', () => {
  assert.deepEqual(custoDaEntrada({ categoria: 'PARCEIRO', pontos: 19080, valor: 0 }, 3100), { valor: 59148, atribuido: true })
  assert.deepEqual(custoDaEntrada({ categoria: 'PARCEIRO', pontos: 128, valor: 397 }, 3100), { valor: 397, atribuido: true })
  // Sem padrão no programa: fica zero.
  assert.deepEqual(custoDaEntrada({ categoria: 'PARCEIRO', pontos: 1000, valor: 0 }, null), { valor: 0, atribuido: false })
})

test('cartão e bônus do programa continuam sem custo; compra fica com o valor pago', () => {
  assert.equal(custoDaEntrada({ categoria: 'ACUMULO', pontos: 5288, valor: 0 }, 3100).valor, 0)
  assert.equal(custoDaEntrada({ categoria: 'BONUS', pontos: 25000, valor: 0 }, 3100).valor, 0)
  assert.equal(custoDaEntrada({ categoria: 'COMPRA', pontos: 20000, valor: 75991 }, 3100).valor, 75991)
})

const l = (descricao: string, pontos: number, operacao = 'Acúmulo'): LinhaLida => ({
  data: '2026-04-09', operacao, descricao, pontos, observacao: null, pagina: 1,
})
const ctx = (programaId = 'livelo') => ({
  programaId,
  programas: [{ id: 'livelo', nome: 'Livelo' }, { id: 'azul', nome: 'Azul' }, { id: 'accor', nome: 'All Accor' }],
  regras: [],
  existentes: { entradas: [], enviadas: [], recebidas: [], saidas: [] },
})

test('importação: cartão vira acúmulo, bônus do programa vira bônus, o resto é parceiro', () => {
  const s = montarSugestoes(
    [
      l('Membership Rewards', 5288),
      l('Acúmulo de ponto - Cartao Azul Itau', 15713),
      l('Crédito de Pontos Itaú', 4946),
      l('Bônus · Clube Livelo', 25000, 'Bônus'),
      l('INSIDER', 19080),
      l('UBER DO BRASIL', 34),
      l('MOVIDA PARTICIPAÇÕES S A', 3013),
      l('Passagem aérea', 101, 'Passagem aérea'),
    ],
    ctx(),
  )
  assert.deepEqual(s.map((x) => x.acao), ['ACUMULO', 'ACUMULO', 'ACUMULO', 'BONUS', 'PARCEIRO', 'PARCEIRO', 'PARCEIRO', 'ACUMULO'])
})
