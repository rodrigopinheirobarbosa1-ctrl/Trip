/**
 * Exportação dos lançamentos em CSV (abre no Excel), na ordem do extrato de
 * cada pessoa em cada programa, com o saldo e o CMP logo depois de cada
 * movimento. Serve para conferir tudo fora do sistema.
 *
 * Código puro, testado em testes/exportacao.test.ts.
 */

/** Uma célula do CSV, com aspas quando precisa (separador ";", formato brasileiro). */
export function celula(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return ''
  const t = typeof v === 'number' ? String(v).replace('.', ',') : v
  return /[;"\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t
}

/** Centavos -> "1234,56" (sem "R$", para o Excel somar). */
export const reaisCsv = (centavos: number | null | undefined) =>
  centavos === null || centavos === undefined ? '' : (Math.round(centavos) / 100).toFixed(2).replace('.', ',')

/** Monta o CSV: BOM (acentos no Excel), cabeçalho e linhas. */
export function montarCsv(cabecalho: string[], linhas: (string | number | null | undefined)[][]): string {
  return '﻿' + [cabecalho, ...linhas].map((l) => l.map(celula).join(';')).join('\r\n') + '\r\n'
}
