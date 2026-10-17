import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lerExtratoSmiles, montarLinhasDeTexto, pareceExtratoSmiles } from '../src/lib/extrato/smiles-pdf'

// Texto no formato do PDF da Smiles (valores inventados).
const TEXTO = `Extrato 2026
Março - 2026
|
20 mar
Descrição:  Milhas  Trechos  Milhas
qualificáveis:  qualificáveis:  resgatáveis:
Transf. Pontos + CM - Bônus  -  -  8.000 milhas
Março
Data do pedido: 20/03/2026  ID: 1-AAAA1111  Parceiro: LIVELO S.A.
Validade das milhas: 20/03/2027
Bônus: 19/03 WL ate 80% OAR-1
Descrição:  Milhas  Trechos  Milhas
qualificáveis:  qualificáveis:  resgatáveis:
Pontos Livelo  -  -  10.000 milhas
Data do pedido: 20/03/2026  ID: 1-AAAA2222  Parceiro: LIVELO S.A.
Validade das milhas: 20/03/2029
05 mar
Descrição:  Milhas  Trechos  Milhas
qualificáveis:  qualificáveis:  resgatáveis:
Passagem aérea  -  -  -12.300 milhas
Data do pedido: 04/03/2026  ID: ABC123  Parceiro:
Detalhes da transação:
Taxa de Embarque com Milhas  ID: 1-BBBB1111  Milhas: -2.300 milhas
Tarifa Exclusiva Clube Smiles e  ID: 1-BBBB2222  Milhas: -10.000 milhas
Diamante
Descrição:  Milhas  Trechos  Milhas
qualificáveis:  qualificáveis:  resgatáveis:
Aceite de campanha  -  -  0 milhas
Data do pedido: 05/03/2026  ID: 1-CCCC1111  Parceiro: Programa Smiles
Extrato 2025
Dezembro - 2025
|
05 dez
Descrição:  Milhas  Trechos  Milhas
qualificáveis:  qualificáveis:  resgatáveis:
Clube Anual  100  -  1.000 milhas
Data do pedido: 05/12/2025  ID: 1-DDDD1111  Parceiro: Programa Smiles`.split('\n')

test('reconhece o formato do PDF da Smiles', () => {
  assert.equal(pareceExtratoSmiles(TEXTO), true)
  assert.equal(pareceExtratoSmiles(['Extrato Livelo', 'Acúmulo 1.000']), false)
})

test('lê uma linha por movimentação, com o total, o localizador, o parceiro e o bônus', () => {
  const l = lerExtratoSmiles(TEXTO)
  assert.deepEqual(
    l.map((x) => [x.data, x.descricao, x.pontos, x.localizador, x.observacao]),
    [
      ['2026-03-20', 'Transf. Pontos + CM - Bônus Março', 8000, null, 'Parceiro: LIVELO S.A. · Bônus: 19/03 WL ate 80% OAR-1'],
      ['2026-03-20', 'Pontos Livelo', 10000, null, 'Parceiro: LIVELO S.A.'],
      // Os detalhes (taxa + tarifa) já estão no total e não viram linhas; a data é a do dia, não a do pedido.
      ['2026-03-05', 'Passagem aérea', -12300, 'ABC123', null],
      // Linha de 0 milhas fica de fora; o ano muda com "Extrato 2025".
      ['2025-12-05', 'Clube Anual', 1000, null, 'Parceiro: Programa Smiles'],
    ],
  )
})

test('monta as linhas do PDF pela posição: colunas separadas e espaços "esticados" ignorados', () => {
  const linhas = montarLinhasDeTexto([
    [
      { str: 'Clube Anual', x: 61, y: 628, largura: 48.7 },
      { str: ' ', x: 109.9, y: 628, largura: 150 },
      { str: '100', x: 192, y: 628, largura: 15.7 },
      { str: '1.000 milhas', x: 453, y: 628, largura: 51 },
      { str: 'Data do pedido:', x: 61, y: 596, largura: 64 },
      { str: '05/10/2026', x: 128, y: 596, largura: 47 },
      { str: 'Extrato 2026', x: 39, y: 779, largura: 50 },
    ],
  ])
  assert.deepEqual(linhas, ['Extrato 2026', 'Clube Anual  100  1.000 milhas', 'Data do pedido: 05/10/2026'])
})
