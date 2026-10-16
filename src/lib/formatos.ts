// Conversões entre o que a pessoa digita/lê e o que o sistema guarda.
//  - Dinheiro circula como INTEIRO EM CENTAVOS.
//  - Pontos circulam como inteiros.
//  - Datas de lançamento são "dias" (sem hora), guardadas à meia-noite UTC.

/** 312000 -> "3.120,00" */
export function formatarCentavos(centavos: number): string {
  const negativo = centavos < 0
  const inteiro = Math.abs(Math.round(centavos))
  const reais = Math.floor(inteiro / 100)
  const cents = inteiro % 100
  return `${negativo ? '-' : ''}${reais.toLocaleString('pt-BR')},${String(cents).padStart(2, '0')}`
}

/** 312000 -> "R$ 3.120,00" */
export function formatarReais(centavos: number): string {
  const negativo = Math.round(centavos) < 0
  return `${negativo ? '-' : ''}R$ ${formatarCentavos(Math.abs(centavos))}`
}

/** 1234567 -> "1.234.567" */
export function formatarPontos(pontos: number): string {
  return Math.round(pontos).toLocaleString('pt-BR')
}

/** CMP em centavos por milheiro -> "R$ 28,15" */
export function formatarCmp(centavosPorMilheiro: number | null): string {
  if (centavosPorMilheiro === null || !Number.isFinite(centavosPorMilheiro)) return '-'
  return formatarReais(centavosPorMilheiro)
}

/** 90 -> "90%"; 12.5 -> "12,5%" */
export function formatarPercentual(valor: number): string {
  return `${valor.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`
}

/**
 * Interpreta um número digitado no formato brasileiro ou americano.
 * Aceita "3.120,50", "3120,50", "3120.50", "3120", "R$ 3.120,50".
 * Devolve null quando o texto não representa um número.
 */
export function lerNumero(entrada: unknown): number | null {
  if (entrada === null || entrada === undefined) return null
  if (typeof entrada === 'number') return Number.isFinite(entrada) ? entrada : null
  let texto = String(entrada).trim()
  if (texto === '') return null
  texto = texto.replace(/R\$/gi, '').replace(/%/g, '').replace(/\s/g, '')

  const temVirgula = texto.includes(',')
  const temPonto = texto.includes('.')
  if (temVirgula && temPonto) {
    // O separador que aparece por último é o decimal.
    if (texto.lastIndexOf(',') > texto.lastIndexOf('.')) {
      texto = texto.replace(/\./g, '').replace(',', '.')
    } else {
      texto = texto.replace(/,/g, '')
    }
  } else if (temVirgula) {
    const partes = texto.split(',')
    // "1,000,000" é milhar; "1,5" é decimal.
    texto = partes.length > 2 ? texto.replace(/,/g, '') : texto.replace(',', '.')
  } else if (temPonto) {
    // "1.500" e "200.000" são milhar no Brasil; "1.5" é decimal.
    const partes = texto.split('.')
    const ultima = partes[partes.length - 1]
    if (partes.length > 2 || ultima.length === 3) texto = texto.replace(/\./g, '')
  }

  if (!/^-?\d*(\.\d*)?$/.test(texto) || texto === '' || texto === '-') return null
  const numero = Number(texto)
  return Number.isFinite(numero) ? numero : null
}

/** Valor digitado em reais -> centavos. */
export function lerCentavos(entrada: unknown): number | null {
  const n = lerNumero(entrada)
  return n === null ? null : Math.round(n * 100)
}

/** Quantidade de pontos digitada ("200.000", "200000") -> inteiro. */
export function lerPontos(entrada: unknown): number | null {
  if (typeof entrada === 'string') {
    // Pontos nunca têm casas decimais: ponto e vírgula são sempre milhar.
    const limpo = entrada.trim().replace(/[.\s]/g, '').replace(/,/g, '')
    if (limpo === '') return null
    if (!/^-?\d+$/.test(limpo)) return null
    return Number(limpo)
  }
  const n = lerNumero(entrada)
  return n === null ? null : Math.round(n)
}

/** Centavos -> texto para preencher campo de formulário: 312050 -> "3120,50" */
export function centavosParaCampo(centavos: number | null | undefined): string {
  if (centavos === null || centavos === undefined) return ''
  const negativo = centavos < 0
  const abs = Math.abs(centavos)
  return `${negativo ? '-' : ''}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, '0')}`
}

// ---------------------------------------------------------------------------
// Datas
// ---------------------------------------------------------------------------

/** "2026-01-15" -> Date à meia-noite UTC. Devolve null se inválida. */
export function lerData(entrada: unknown): Date | null {
  if (entrada instanceof Date) return Number.isNaN(entrada.getTime()) ? null : diaUtc(entrada)
  if (typeof entrada !== 'string') return null
  const texto = entrada.trim()
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto)
  if (m) return criarData(Number(m[1]), Number(m[2]), Number(m[3]))
  m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(texto)
  if (m) return criarData(Number(m[3]), Number(m[2]), Number(m[1]))
  return null
}

function criarData(ano: number, mes: number, dia: number): Date | null {
  const d = new Date(Date.UTC(ano, mes - 1, dia))
  if (d.getUTCFullYear() !== ano || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) return null
  return d
}

/** Mesma data, sem as horas (meia-noite UTC). */
export function diaUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

/** Date -> "2026-01-15" (para campos type="date"). */
export function dataParaCampo(d: Date | null | undefined): string {
  if (!d) return ''
  return d.toISOString().slice(0, 10)
}

/** Date -> "15/01/2026" */
export function formatarData(d: Date | null | undefined): string {
  if (!d) return '-'
  return d.toLocaleDateString('pt-BR', { timeZone: 'UTC' })
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

/** Chave de mês "2026-01" -> "jan/2026" */
export function formatarMes(chave: string): string {
  const [ano, mes] = chave.split('-')
  return `${MESES[Number(mes) - 1]}/${ano}`
}

/** Date -> chave de mês "2026-01" */
export function chaveMes(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

/** "2026-01" + 3 -> "2026-04" */
export function somarMeses(chave: string, meses: number): string {
  const [ano, mes] = chave.split('-').map(Number)
  const total = ano * 12 + (mes - 1) + meses
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`
}

/** Hoje, como dia UTC no fuso de Brasília. */
export function hoje(): Date {
  const agora = new Date()
  const texto = agora.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
  return lerData(texto) ?? diaUtc(agora)
}
