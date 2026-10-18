import { test } from 'node:test'
import assert from 'node:assert/strict'
import { detalharEntrada, detalharSaida, detalharTransferencia } from '../src/lib/detalhes-historico'
import { lerExclusao } from '../src/lib/relancar'

const d = (s: string) => new Date(`${s}T00:00:00Z`)

test('lê de volta a entrada excluída (como o histórico escreve)', () => {
  const texto = detalharEntrada({
    data: d('2026-04-24'), titular: { nome: 'Rodrigo' }, programa: { nome: 'All Accor' }, categoria: 'PARCEIRO', pontos: 28000,
    valor: 0, formaPagamento: 'SEM_DESEMBOLSO', parcelas: 1, cartao: null, observacao: 'Reserva cancelada · Reserva cancelada: Novotel Lisboa',
  })
  assert.deepEqual(lerExclusao(`Excluiu ao importar o extrato All Accor (não estava no extrato) — ${texto}`), {
    tipo: 'ENTRADA', data: '2026-04-24', titular: 'Rodrigo', programa: 'All Accor', categoria: 'PARCEIRO', pontos: 28000,
    valor: 0, formaPagamento: 'SEM_DESEMBOLSO', parcelas: 1, cartao: null,
    observacao: 'Reserva cancelada · Reserva cancelada: Novotel Lisboa',
  })
})

test('lê a compra com valor, cartão e parcelas', () => {
  const texto = detalharEntrada({
    data: d('2026-03-03'), titular: { nome: 'Rodrigo' }, programa: { nome: 'Livelo' }, categoria: 'COMPRA', pontos: 158400,
    valor: 424512, formaPagamento: 'CARTAO', parcelas: 6, cartao: { nome: 'Diners 1433', final: '1433' }, observacao: 'Compra Livelo',
  })
  const r = lerExclusao(`Excluiu — ${texto}`)
  assert.equal(r?.tipo, 'ENTRADA')
  if (r?.tipo !== 'ENTRADA') return
  assert.deepEqual([r.categoria, r.valor, r.formaPagamento, r.parcelas, r.cartao], ['COMPRA', 424512, 'CARTAO', 6, 'Diners 1433'])
})

test('lê a saída com os dados da venda', () => {
  const texto = detalharSaida({
    data: d('2026-02-06'), titular: { nome: 'Rodrigo' }, programa: { nome: 'All Accor' }, tipo: 'VENDA', pontos: 8000,
    taxaEmbarque: 0, valorVenda: 50000, fornecedor: 'Rodrigo', cliente: 'Pessoal SSA', localizador: 'ABC123', dataIda: d('2026-03-01'),
    dataVolta: null, passageiros: 1, origem: 'GRU', destino: 'SSA', formaRecebimento: 'PIX', parcelas: 1, dataRecebimento: d('2026-02-07'),
    observacao: null,
  })
  const r = lerExclusao(`Excluiu — ${texto}`)
  assert.equal(r?.tipo, 'SAIDA')
  if (r?.tipo !== 'SAIDA') return
  assert.deepEqual(
    [r.tipoSaida, r.pontos, r.valorVenda, r.cliente, r.localizador, r.origem, r.destino, r.dataIda, r.passageiros, r.formaRecebimento, r.dataRecebimento],
    ['VENDA', 8000, 50000, 'Pessoal SSA', 'ABC123', 'GRU', 'SSA', '2026-03-01', 1, 'PIX', '2026-02-07'],
  )
})

test('lê a transferência', () => {
  const texto = detalharTransferencia({
    data: d('2026-07-16'), titular: { nome: 'Rodrigo' }, origem: { nome: 'Esfera' }, destino: { nome: 'All Accor' }, pontos: 30100,
    bonusPercentual: 12.5, pontosDestino: 33863, observacao: 'Transferência · ALL - Accor Live Limitless',
  })
  assert.deepEqual(lerExclusao(`Excluiu — ${texto}`), {
    tipo: 'TRANSFERENCIA', data: '2026-07-16', titular: 'Rodrigo', origem: 'Esfera', destino: 'All Accor', pontos: 30100,
    bonusPercentual: 12.5, pontosDestino: 33863, observacao: 'Transferência · ALL - Accor Live Limitless',
  })
})

test('lê o formato mais antigo (só pontos, data, pessoa e programa)', () => {
  const r = lerExclusao('Excluiu entrada de 1.000 pontos Livelo de Rodrigo (05/03/2026)')
  assert.equal(r?.tipo, 'ENTRADA')
  assert.equal(r?.data, '2026-03-05')
  assert.equal(lerExclusao('Alterou o programa Livelo'), null)
})
