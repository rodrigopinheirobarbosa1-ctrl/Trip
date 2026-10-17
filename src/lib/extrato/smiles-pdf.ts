/**
 * Leitura do extrato da Smiles em PDF sem IA.
 *
 * O PDF que a Smiles gera ("Extrato Smiles") tem texto de verdade, com um
 * formato fixo: o ano ("Extrato 2026"), o dia ("05 out") e, para cada
 * movimentação, um bloco "Descrição: ... Milhas resgatáveis:" seguido da linha
 * com a descrição e as milhas, "Data do pedido / ID / Parceiro" e, às vezes,
 * "Bônus: ...". Os "Detalhes da transação" (tarifas, taxas) já estão somados
 * no total e são ignorados.
 *
 * Código puro (sem banco nem PDF): recebe as linhas de texto já montadas.
 * Testado em testes/smiles-pdf.test.ts.
 */
import type { LinhaLida } from './sugestao'

/** Um pedaço de texto do PDF, com a posição na página. */
export type ItemTexto = { str: string; x: number; y: number; largura: number }

/**
 * Junta os pedaços de texto em linhas, de cima para baixo. Pedaços distantes
 * na mesma linha (colunas) ficam separados por dois espaços, como num texto
 * com o layout preservado.
 */
export function montarLinhasDeTexto(paginas: ItemTexto[][]): string[] {
  const linhas: string[] = []
  for (const itens of paginas) {
    const grupos: { y: number; itens: ItemTexto[] }[] = []
    for (const it of itens) {
      if (!it.str) continue
      const g = grupos.find((x) => Math.abs(x.y - it.y) <= 3)
      if (g) g.itens.push(it)
      else grupos.push({ y: it.y, itens: [it] })
    }
    grupos.sort((a, b) => b.y - a.y)
    for (const g of grupos) {
      g.itens.sort((a, b) => a.x - b.x)
      let texto = ''
      let fim = -Infinity
      for (const it of g.itens) {
        // Os espaços vêm como pedaços próprios, às vezes "esticados" até a coluna
        // seguinte: a separação sai da distância entre as palavras.
        if (!it.str.trim()) continue
        const vao = it.x - fim
        if (texto) texto += vao > 8 ? '  ' : vao > 1 ? ' ' : ''
        texto += it.str.trim()
        fim = it.x + it.largura
      }
      if (texto.trim()) linhas.push(texto.trim())
    }
  }
  return linhas
}

const MESES: Record<string, number> = {
  jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6, jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12,
}

/** Este texto é um extrato da Smiles no formato do PDF? */
export function pareceExtratoSmiles(linhas: string[]): boolean {
  const texto = linhas.join('\n')
  return /^Extrato \d{4}$/m.test(texto) && /resgatáveis:/.test(texto) && /Data do pedido:/.test(texto)
}

/** Lê as movimentações do extrato da Smiles. Linhas sem data reconhecida são deixadas de fora. */
export function lerExtratoSmiles(linhas: string[], pagina = 1): LinhaLida[] {
  const resultado: LinhaLida[] = []
  let ano: number | null = null
  let dia: { d: number; m: number } | null = null
  let atual: LinhaLida | null = null

  for (let i = 0; i < linhas.length; i++) {
    const t = linhas[i].trim()
    const a = /^Extrato (\d{4})$/.exec(t)
    if (a) ano = Number(a[1])
    const d = /^(\d{2}) (jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)$/.exec(t)
    if (d) dia = { d: Number(d[1]), m: MESES[d[2]] }

    if (t.startsWith('Descrição:')) {
      // A linha com a descrição e as milhas vem logo depois do cabeçalho.
      let j = i + 1
      while (j < linhas.length && !/-?[\d.]+ milhas$/.test(linhas[j].trim())) j++
      if (j >= linhas.length) break
      const partes = linhas[j].trim().split(/\s{2,}/)
      const milhas = /(-?[\d.]+) milhas$/.exec(partes[partes.length - 1])
      let descricao = partes[0]
      // Descrição em duas linhas ("Transf. Pontos + CM - Bônus" / "Agosto - 2026").
      const seguinte = linhas[j + 1]?.trim() ?? ''
      if (seguinte && !/^(Data do pedido|Descrição|Detalhes|Validade|Bônus:)/.test(seguinte) && !/milhas$/.test(seguinte)) {
        descricao += ` ${seguinte}`
        j++
      }
      atual = null
      if (milhas && ano && dia) {
        const pontos = Number(milhas[1].replace(/\./g, ''))
        if (pontos !== 0) {
          atual = {
            data: `${ano}-${String(dia.m).padStart(2, '0')}-${String(dia.d).padStart(2, '0')}`,
            operacao: descricao,
            descricao,
            pontos,
            observacao: null,
            localizador: null,
            pagina,
          }
          resultado.push(atual)
        }
      }
      i = j
      continue
    }

    if (!atual) continue
    const pedido = /Data do pedido:.*ID:\s*(\S+)(?:\s+Parceiro:\s*(.*))?$/.exec(t)
    if (pedido) {
      // Nas passagens, o ID de 6 letras/números é o localizador da reserva.
      if (/^[A-Z0-9]{6}$/.test(pedido[1])) atual.localizador = pedido[1]
      const parceiro = pedido[2]?.trim()
      if (parceiro) atual.observacao = `Parceiro: ${parceiro}`
      continue
    }
    const bonus = /^Bônus: (.*)$/.exec(t)
    if (bonus) atual.observacao = [atual.observacao, `Bônus: ${bonus[1]}`].filter(Boolean).join(' · ')
  }
  return resultado
}
