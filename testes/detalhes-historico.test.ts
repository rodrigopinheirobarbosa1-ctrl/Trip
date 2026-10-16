import { test } from 'node:test'
import assert from 'node:assert/strict'
import { detalharEntrada, detalharSaida, detalharTransferencia } from '../src/lib/detalhes-historico'

const d = (s: string) => new Date(`${s}T00:00:00Z`)

test('a entrada excluída guarda o valor pago e a forma de pagamento', () => {
  const t = detalharEntrada({
    data: d('2026-03-03'), titular: { nome: 'Rodrigo' }, programa: { nome: 'Livelo' }, categoria: 'COMPRA',
    pontos: 158400, valor: 554400, formaPagamento: 'CARTAO', parcelas: 10,
    cartao: { nome: 'Itaú', final: '1234' }, observacao: null,
  })
  assert.match(t, /158\.400 pontos Livelo/)
  assert.match(t, /pessoa: Rodrigo/)
  assert.match(t, /03\/03\/2026/)
  assert.match(t, /valor pago: R\$ 5\.544,00 \(R\$ 35,00 o milheiro\)/)
  assert.match(t, /Cartão de crédito em 10x/)
  assert.match(t, /final 1234/)
  assert.doesNotMatch(t, /observação/)
  // Não repete o final quando ele já está no nome do cartão.
  const t2 = detalharEntrada({
    data: d('2026-03-03'), titular: { nome: 'Rodrigo' }, programa: { nome: 'Livelo' }, categoria: 'BONUS',
    pontos: 1000, valor: 0, formaPagamento: 'SEM_DESEMBOLSO', parcelas: 1, cartao: { nome: 'Diners 1433', final: '1433' }, observacao: null,
  })
  assert.match(t2, /cartão: Diners 1433;|cartão: Diners 1433$/)
  assert.doesNotMatch(t2, /final 1433/)
})

test('a transferência excluída guarda o bônus e os pontos dos dois lados', () => {
  const t = detalharTransferencia({
    data: d('2026-03-03'), titular: { nome: 'Rodrigo' }, origem: { nome: 'Livelo' }, destino: { nome: 'Azul' },
    pontos: 160000, bonusPercentual: 113, pontosDestino: 340800, observacao: 'promoção',
  })
  assert.match(t, /Livelo → Azul/)
  assert.match(t, /saíram 160\.000 pontos Livelo/)
  assert.match(t, /bônus: 113%/)
  assert.match(t, /chegaram 340\.800 pontos Azul/)
  assert.match(t, /observação: promoção/)
})

test('a venda excluída guarda os dados da venda', () => {
  const t = detalharSaida({
    data: d('2026-05-10'), titular: { nome: 'Ana' }, programa: { nome: 'Smiles' }, tipo: 'VENDA', pontos: 50000,
    taxaEmbarque: 0, valorVenda: 90000, fornecedor: null, cliente: 'João', localizador: 'ABC123',
    dataIda: null, dataVolta: null, passageiros: 0, origem: null, destino: null,
    formaRecebimento: 'PIX', parcelas: 1, dataRecebimento: null, observacao: null,
  })
  assert.match(t, /Venda de 50\.000 pontos Smiles/)
  assert.match(t, /valor da venda: R\$ 900,00/)
  assert.match(t, /cliente: João/)
  assert.match(t, /localizador: ABC123/)
  assert.doesNotMatch(t, /passageiros|taxa/)
})
