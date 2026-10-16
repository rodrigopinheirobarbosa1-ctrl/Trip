/**
 * Lê a planilha de milhas (formato "Super Planilha"/"Milhas 2026") e
 * transforma as abas em dados prontos para gravar.
 *
 * Código puro: recebe as linhas de cada aba (já lidas do .xlsx, no navegador)
 * e devolve os dados + avisos. As colunas são encontradas pelo TÍTULO, não
 * pela posição, para tolerar colunas inseridas ou movidas.
 *
 * O que NÃO é importado, de propósito:
 *  - senhas da aba Cadastros (ficam fora do sistema);
 *  - colunas calculadas (CMP, custo, lucro, parcelas): o sistema recalcula;
 *  - Dashboard, Resumo, Fluxo de Caixa, apoio e simuladores: são relatórios.
 */

export type Celula = string | number | boolean | Date | null | undefined
export type Linhas = Celula[][]
/** Devolve as linhas de uma aba, ou null se a aba não existir. */
export type LerAba = (nome: string) => Linhas | null

export type TipoProgramaImport = 'CARTAO_CREDITO' | 'CIA_AEREA' | 'HOTEL' | 'ABASTECIMENTO' | 'OUTRO'
export type FormaImport = 'PIX' | 'CARTAO' | 'BOLETO' | 'DINHEIRO' | 'OUTRO' | 'SEM_DESEMBOLSO'

export type DadosImportacao = {
  titulares: { nome: string; saldoInicialCaixa: number }[]
  programas: { nome: string; tipo: TipoProgramaImport }[]
  contas: { titular: string; programa: string; login: string }[]
  cartoes: { nome: string; final: string | null }[]
  entradas: {
    linha: number
    data: string
    titular: string
    programa: string
    categoria: 'COMPRA' | 'ACUMULO' | 'BONUS' | 'SALDO_INICIAL' | 'AJUSTE'
    pontos: number
    valor: number
    formaPagamento: FormaImport
    parcelas: number
    cartao: string | null
    observacao: string | null
  }[]
  transferencias: {
    linha: number
    data: string
    titular: string
    origem: string
    destino: string
    pontos: number
    bonusPercentual: number
    pontosDestino: number
    observacao: string | null
  }[]
  saidas: {
    linha: number
    aba: string
    data: string
    titular: string
    programa: string
    tipo: 'VENDA' | 'USO_PESSOAL' | 'OUTRO'
    pontos: number
    taxaEmbarque: number
    valorVenda: number
    fornecedor: string | null
    cliente: string | null
    localizador: string | null
    dataIda: string | null
    dataVolta: string | null
    passageiros: number | null
    origem: string | null
    destino: string | null
    formaRecebimento: FormaImport | null
    parcelas: number
    dataRecebimento: string | null
    observacao: string | null
  }[]
  movimentos: {
    linha: number
    data: string
    titular: string | null
    tipo: 'ENTRADA' | 'SAIDA'
    valor: number
    descricao: string
  }[]
  avisos: string[]
}

// ---------------------------------------------------------------------------
// Ajudantes
// ---------------------------------------------------------------------------

/** Texto sem acento, minúsculo e sem espaços duplicados (para comparar títulos). */
export function normalizar(v: Celula): string {
  return String(v ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function texto(v: Celula): string | null {
  if (v === null || v === undefined) return null
  if (v instanceof Date) return dataIso(v)
  const t = String(v).replace(/\s+/g, ' ').trim()
  return t === '' ? null : t
}

function numero(v: Celula): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v !== 'string') return null
  const t = v.trim().replace(/R\$/gi, '').replace(/\s/g, '')
  if (t === '' || t.startsWith('#')) return null
  // Texto no formato brasileiro: "1.234,56"
  const n = Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t)
  return Number.isFinite(n) ? n : null
}

function dataIso(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

function data(v: Celula): string | null {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : dataIso(v)
  if (typeof v === 'string') {
    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v.trim())
    if (m) return `${m[3]}-${m[2]}-${m[1]}`
    const iso = /^(\d{4}-\d{2}-\d{2})/.exec(v.trim())
    if (iso) return iso[1]
  }
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    // Número de série do Excel (dias desde 30/12/1899).
    return dataIso(new Date(Date.UTC(1899, 11, 30) + v * 86400000))
  }
  return null
}

const centavos = (v: number | null) => (v === null ? 0 : Math.round(v * 100))

/**
 * Encontra a linha de títulos de uma tabela: a primeira linha que contém
 * todos os títulos pedidos. Devolve o índice da linha e um mapa título->coluna.
 */
function acharTabela(linhas: Linhas, obrigatorios: string[]): { linha: number; col: (titulo: string) => number } | null {
  const alvo = obrigatorios.map(normalizar)
  for (let i = 0; i < Math.min(linhas.length, 40); i++) {
    const titulos = (linhas[i] ?? []).map(normalizar)
    if (alvo.every((t) => titulos.includes(t))) {
      return {
        linha: i,
        col: (titulo: string) => titulos.indexOf(normalizar(titulo)),
      }
    }
  }
  return null
}

const pegar = (linha: Celula[], indice: number): Celula => (indice >= 0 ? linha[indice] : null)

export function tipoPrograma(v: Celula): TipoProgramaImport {
  const t = normalizar(v)
  if (t.includes('cartao') || t.includes('credito') || t.includes('banco')) return 'CARTAO_CREDITO'
  if (t.includes('aerea') || t.includes('aereo') || t.includes('cia')) return 'CIA_AEREA'
  if (t.includes('hotel')) return 'HOTEL'
  if (t.includes('abastec') || t.includes('combust') || t.includes('posto')) return 'ABASTECIMENTO'
  return 'OUTRO'
}

export function formaPagamento(v: Celula): FormaImport | null {
  const t = normalizar(v)
  if (!t) return null
  if (t.includes('pix')) return 'PIX'
  if (t.includes('cart') || t.includes('credito') || t.includes('cedito')) return 'CARTAO'
  if (t.includes('boleto')) return 'BOLETO'
  if (t.includes('dinheiro') || t.includes('especie')) return 'DINHEIRO'
  return 'OUTRO'
}

// ---------------------------------------------------------------------------
// Leitura
// ---------------------------------------------------------------------------

export function lerPlanilha(lerAba: LerAba): DadosImportacao {
  const avisos: string[] = []
  const dados: DadosImportacao = {
    titulares: [],
    programas: [],
    contas: [],
    cartoes: [],
    entradas: [],
    transferencias: [],
    saidas: [],
    movimentos: [],
    avisos,
  }

  // Nomes como aparecem no cadastro, para padronizar maiúsculas/acentos
  // digitados de forma diferente nos lançamentos.
  const titularPorChave = new Map<string, string>()
  const programaPorChave = new Map<string, string>()
  const titular = (v: Celula, onde: string): string | null => {
    const nome = texto(v)
    if (!nome) return null
    const chave = normalizar(nome)
    const existente = titularPorChave.get(chave)
    if (existente) return existente
    titularPorChave.set(chave, nome)
    dados.titulares.push({ nome, saldoInicialCaixa: 0 })
    avisos.push(`"${nome}" aparece em ${onde} mas não está na aba Cadastros. Foi cadastrado automaticamente.`)
    return nome
  }
  const programa = (v: Celula, onde: string): string | null => {
    const nome = texto(v)
    if (!nome) return null
    const chave = normalizar(nome)
    const existente = programaPorChave.get(chave)
    if (existente) return existente
    programaPorChave.set(chave, nome)
    dados.programas.push({ nome, tipo: 'OUTRO' })
    avisos.push(`O programa "${nome}" aparece em ${onde} mas não está na aba Cadastros. Foi cadastrado com o tipo "Outro".`)
    return nome
  }

  // ---- Cadastros --------------------------------------------------------
  const cad = lerAba('Cadastros')
  if (!cad) {
    avisos.push('Não encontrei a aba "Cadastros". Pessoas e programas serão criados a partir dos lançamentos.')
  } else {
    const tab = acharTabela(cad, ['CPF', 'Programa', 'Tipo'])
    if (!tab) {
      avisos.push('Na aba "Cadastros" não encontrei os títulos "CPF", "Programa" e "Tipo".')
    } else {
      const cCpf = tab.col('CPF')
      const cSaldo = tab.col('Saldo inicial')
      const cProg = tab.col('Programa')
      const cTipo = tab.col('Tipo')
      const titulosLinha = cad[tab.linha] ?? []

      // Pessoas, na ordem do cadastro (a ordem liga cada uma à sua coluna de login).
      const ordemTitulares: string[] = []
      for (let i = tab.linha + 1; i < cad.length; i++) {
        const nome = texto(pegar(cad[i], cCpf))
        if (!nome) continue
        const chave = normalizar(nome)
        if (titularPorChave.has(chave)) continue
        titularPorChave.set(chave, nome)
        ordemTitulares.push(nome)
        dados.titulares.push({ nome, saldoInicialCaixa: centavos(numero(pegar(cad[i], cSaldo))) })
      }

      // Programas
      const linhaDoPrograma: { nome: string; i: number }[] = []
      for (let i = tab.linha + 1; i < cad.length; i++) {
        const nome = texto(pegar(cad[i], cProg))
        if (!nome) continue
        const chave = normalizar(nome)
        if (programaPorChave.has(chave)) {
          avisos.push(`O programa "${nome}" está cadastrado mais de uma vez na aba Cadastros. Mantive um só.`)
          continue
        }
        const tipoTexto = texto(pegar(cad[i], cTipo))
        if (!tipoTexto) avisos.push(`O programa "${nome}" está sem tipo na aba Cadastros. Ficou como "Outro".`)
        programaPorChave.set(chave, nome)
        dados.programas.push({ nome, tipo: tipoPrograma(tipoTexto) })
        linhaDoPrograma.push({ nome, i })
      }

      // Logins: colunas "Login ..." depois da coluna Tipo, uma por pessoa, na
      // ordem do cadastro. A coluna seguinte a cada login é a senha: ignorada.
      const colunasLogin: number[] = []
      for (let c = cTipo + 1; c < titulosLinha.length; c++) {
        if (normalizar(titulosLinha[c]).startsWith('senha')) continue
        if (texto(titulosLinha[c])) colunasLogin.push(c)
      }
      colunasLogin.forEach((c, k) => {
        const dono = ordemTitulares[k]
        if (!dono) return
        for (const { nome, i } of linhaDoPrograma) {
          const login = texto(pegar(cad[i], c))
          if (login) dados.contas.push({ titular: dono, programa: nome, login })
        }
      })

      // Cartões: tabela "Cartão de Crédito" | "Descrição" na mesma aba.
      const tabCartao = acharTabela(cad, ['Cartão de Crédito', 'Descrição'])
      if (tabCartao) {
        const cNome = tabCartao.col('Cartão de Crédito')
        const cDesc = tabCartao.col('Descrição')
        const vistos = new Set<string>()
        for (let i = tabCartao.linha + 1; i < cad.length; i++) {
          const nome = texto(pegar(cad[i], cNome))
          if (!nome || vistos.has(normalizar(nome))) continue
          vistos.add(normalizar(nome))
          dados.cartoes.push({ nome, final: texto(pegar(cad[i], cDesc)) })
        }
      }
    }
  }

  // ---- Entradas -------------------------------------------------------------
  const ent = lerAba('Lança Entrada Ptos')
  if (ent) {
    const tab = acharTabela(ent, ['Data', 'CPF', 'Programa', 'Qtde'])
    if (!tab) avisos.push('Na aba "Lança Entrada Ptos" não encontrei os títulos "Data", "CPF", "Programa" e "Qtde".')
    else {
      const c = {
        data: tab.col('Data'),
        cpf: tab.col('CPF'),
        prog: tab.col('Programa'),
        valor: tab.col('Valor transação'),
        qtde: tab.col('Qtde'),
        obs: tab.col('Observação'),
        forma: tab.col('Forma de pgto'),
        parcelas: tab.col('Parcelas'),
        cartao: tab.col('Cartão (se aplicável)'),
      }
      for (let i = tab.linha + 1; i < ent.length; i++) {
        const l = ent[i] ?? []
        const n = i + 1 // número da linha como aparece no Excel
        const dt = data(pegar(l, c.data))
        const cpfTexto = texto(pegar(l, c.cpf))
        const progTexto = texto(pegar(l, c.prog))
        if (!dt && !cpfTexto && !progTexto) continue
        const pontos = numero(pegar(l, c.qtde))
        if (!dt || !cpfTexto || !progTexto || pontos === null) {
          avisos.push(`Lança Entrada Ptos, linha ${n}: faltou data, CPF, programa ou quantidade. Linha ignorada.`)
          continue
        }
        const obs = texto(pegar(l, c.obs))
        let valor = centavos(numero(pegar(l, c.valor)))
        if (valor < 0) {
          avisos.push(`Lança Entrada Ptos, linha ${n}: valor negativo. Importado como zero.`)
          valor = 0
        }
        const pts = Math.round(pontos)
        const o = normalizar(obs)
        const categoria =
          pts < 0 ? 'AJUSTE'
          : o.includes('saldo inicial') ? 'SALDO_INICIAL'
          : o.includes('bonus') ? 'BONUS'
          : valor > 0 ? 'COMPRA'
          : 'ACUMULO'
        if (pts < 0) avisos.push(`Lança Entrada Ptos, linha ${n}: quantidade negativa (${pts}). Importado como ajuste.`)
        const parcelasNum = numero(pegar(l, c.parcelas))
        const forma = formaPagamento(pegar(l, c.forma))
        // Na planilha, sem forma de pagamento e sem parcelas o lançamento
        // não entrava no fluxo de caixa: mantemos o mesmo comportamento.
        const formaFinal: FormaImport = forma ?? (parcelasNum ? 'OUTRO' : 'SEM_DESEMBOLSO')
        dados.entradas.push({
          linha: n,
          data: dt,
          titular: titular(cpfTexto, `Lança Entrada Ptos (linha ${n})`)!,
          programa: programa(progTexto, `Lança Entrada Ptos (linha ${n})`)!,
          categoria,
          pontos: pts,
          valor,
          formaPagamento: formaFinal,
          parcelas: Math.max(1, Math.round(parcelasNum ?? 1)),
          cartao: texto(pegar(l, c.cartao)),
          observacao: obs,
        })
      }
    }
  } else avisos.push('Não encontrei a aba "Lança Entrada Ptos".')

  // ---- Transferências -------------------------------------------------------
  const tra = lerAba('Lança Transf Ptos')
  if (tra) {
    const tab = acharTabela(tra, ['Data', 'CPF', 'Programa Origem', 'Qtde', 'Programa Destino'])
    if (!tab) avisos.push('Na aba "Lança Transf Ptos" não encontrei os títulos esperados.')
    else {
      const c = {
        data: tab.col('Data'),
        cpf: tab.col('CPF'),
        origem: tab.col('Programa Origem'),
        qtde: tab.col('Qtde'),
        destino: tab.col('Programa Destino'),
        obs: tab.col('Observação'),
        bonus: tab.col('Bonificação'),
        qtdeDestino: tab.col('Qtde no Destino'),
      }
      for (let i = tab.linha + 1; i < tra.length; i++) {
        const l = tra[i] ?? []
        const n = i + 1
        const dt = data(pegar(l, c.data))
        const cpfTexto = texto(pegar(l, c.cpf))
        if (!dt && !cpfTexto) continue
        const pontos = numero(pegar(l, c.qtde))
        const origem = texto(pegar(l, c.origem))
        const destino = texto(pegar(l, c.destino))
        if (!dt || !cpfTexto || !origem || !destino || pontos === null || pontos <= 0) {
          avisos.push(`Lança Transf Ptos, linha ${n}: faltou data, CPF, programas ou quantidade. Linha ignorada.`)
          continue
        }
        // Na planilha o bônus é fração (0,9 = 90%).
        const bonusFracao = numero(pegar(l, c.bonus)) ?? 0
        const bonusPercentual = Math.round(bonusFracao * 100 * 100) / 100
        const destinoPlanilha = numero(pegar(l, c.qtdeDestino))
        const pts = Math.round(pontos)
        dados.transferencias.push({
          linha: n,
          data: dt,
          titular: titular(cpfTexto, `Lança Transf Ptos (linha ${n})`)!,
          origem: programa(origem, `Lança Transf Ptos (linha ${n})`)!,
          destino: programa(destino, `Lança Transf Ptos (linha ${n})`)!,
          pontos: pts,
          bonusPercentual,
          pontosDestino: destinoPlanilha !== null ? Math.round(destinoPlanilha) : Math.round(pts * (1 + bonusFracao)),
          observacao: texto(pegar(l, c.obs)),
        })
      }
    }
  } else avisos.push('Não encontrei a aba "Lança Transf Ptos".')

  // ---- Saídas: Controle de Venda (com dados financeiros) ----------------------
  // Cada venda vira UMA saída. As linhas de "Lança Saída Ptos" que
  // correspondem a uma venda (mesma pessoa, programa e quantidade) são a
  // mesma operação lançada duas vezes e por isso não são importadas de novo.
  type ChaveSaida = string
  const vendasPorChave = new Map<ChaveSaida, number>()
  const chaveSaida = (t: string, p: string, pts: number) => `${normalizar(t)}|${normalizar(p)}|${pts}`

  const ven = lerAba('Controle de Venda')
  if (ven) {
    const tab = acharTabela(ven, ['Data Emissão', 'CPF', 'Programa', 'Qtde Milhas'])
    if (!tab) avisos.push('Na aba "Controle de Venda" não encontrei os títulos esperados.')
    else {
      const c = {
        data: tab.col('Data Emissão'),
        cpf: tab.col('CPF'),
        fornecedor: tab.col('Fornecedor'),
        cliente: tab.col('Cliente'),
        localizador: tab.col('Localizador'),
        ida: tab.col('Data Ida'),
        volta: tab.col('Data Volta'),
        pax: tab.col('Qtde de CPFs'),
        prog: tab.col('Programa'),
        origem: tab.col('Origem'),
        destino: tab.col('Destino'),
        qtde: tab.col('Qtde Milhas'),
        taxa: tab.col('Taxa de Embarque'),
        venda: tab.col('Valor de Venda'),
        forma: tab.col('Forma de Pgto'),
        parcelas: tab.col('Parcelas'),
        pgto: tab.col('Data Pgto'),
      }
      for (let i = tab.linha + 1; i < ven.length; i++) {
        const l = ven[i] ?? []
        const n = i + 1
        const dt = data(pegar(l, c.data))
        const cpfTexto = texto(pegar(l, c.cpf))
        if (!dt && !cpfTexto) continue
        const pontos = numero(pegar(l, c.qtde))
        const progTexto = texto(pegar(l, c.prog))
        if (pontos === 0) {
          avisos.push(`Controle de Venda, linha ${n}: quantidade de milhas zero (operação cancelada?). Linha ignorada.`)
          continue
        }
        if (!dt || !cpfTexto || !progTexto || pontos === null || pontos < 0) {
          avisos.push(`Controle de Venda, linha ${n}: faltou data, CPF, programa ou quantidade de milhas. Linha ignorada.`)
          continue
        }
        const formaTexto = pegar(l, c.forma)
        const pessoal = normalizar(formaTexto).includes('pessoal')
        const t = titular(cpfTexto, `Controle de Venda (linha ${n})`)!
        const p = programa(progTexto, `Controle de Venda (linha ${n})`)!
        const pts = Math.round(pontos)
        const k = chaveSaida(t, p, pts)
        vendasPorChave.set(k, (vendasPorChave.get(k) ?? 0) + 1)
        const pax = numero(pegar(l, c.pax))
        dados.saidas.push({
          linha: n,
          aba: 'Controle de Venda',
          data: dt,
          titular: t,
          programa: p,
          tipo: pessoal ? 'USO_PESSOAL' : 'VENDA',
          pontos: pts,
          taxaEmbarque: centavos(numero(pegar(l, c.taxa))),
          valorVenda: Math.max(0, centavos(numero(pegar(l, c.venda)))),
          fornecedor: texto(pegar(l, c.fornecedor)),
          cliente: texto(pegar(l, c.cliente)),
          localizador: texto(pegar(l, c.localizador)),
          dataIda: data(pegar(l, c.ida)),
          dataVolta: data(pegar(l, c.volta)),
          passageiros: pax !== null ? Math.round(pax) : null,
          origem: texto(pegar(l, c.origem)),
          destino: texto(pegar(l, c.destino)),
          formaRecebimento: pessoal ? null : formaPagamento(formaTexto),
          parcelas: Math.max(1, Math.round(numero(pegar(l, c.parcelas)) ?? 1)),
          dataRecebimento: data(pegar(l, c.pgto)),
          observacao: null,
        })
      }
    }
  } else avisos.push('Não encontrei a aba "Controle de Venda".')

  // ---- Saídas: Lança Saída Ptos (só o que não tem venda correspondente) -------
  const sai = lerAba('Lança Saída Ptos')
  if (sai) {
    const tab = acharTabela(sai, ['Data', 'CPF', 'Programa', 'Qtde'])
    if (!tab) avisos.push('Na aba "Lança Saída Ptos" não encontrei os títulos esperados.')
    else {
      const c = { data: tab.col('Data'), cpf: tab.col('CPF'), prog: tab.col('Programa'), qtde: tab.col('Qtde'), obs: tab.col('Observação') }
      for (let i = tab.linha + 1; i < sai.length; i++) {
        const l = sai[i] ?? []
        const n = i + 1
        const dt = data(pegar(l, c.data))
        const cpfTexto = texto(pegar(l, c.cpf))
        if (!dt && !cpfTexto) continue
        const pontos = numero(pegar(l, c.qtde))
        const progTexto = texto(pegar(l, c.prog))
        if (pontos === 0) {
          avisos.push(`Lança Saída Ptos, linha ${n}: quantidade zero (operação cancelada?). Linha ignorada.`)
          continue
        }
        if (!dt || !cpfTexto || !progTexto || pontos === null || pontos < 0) {
          avisos.push(`Lança Saída Ptos, linha ${n}: faltou data, CPF, programa ou quantidade. Linha ignorada.`)
          continue
        }
        const t = titular(cpfTexto, `Lança Saída Ptos (linha ${n})`)!
        const p = programa(progTexto, `Lança Saída Ptos (linha ${n})`)!
        const pts = Math.round(pontos)
        const k = chaveSaida(t, p, pts)
        const restantes = vendasPorChave.get(k) ?? 0
        if (restantes > 0) {
          vendasPorChave.set(k, restantes - 1)
          continue // já veio pelo Controle de Venda
        }
        const obs = texto(pegar(l, c.obs))
        const pessoal = normalizar(obs).includes('pessoal')
        avisos.push(
          `Lança Saída Ptos, linha ${n}: saída de ${pts.toLocaleString('pt-BR')} pontos ${p} de ${t} sem venda correspondente no Controle de Venda. ` +
            `Importada como "${pessoal ? 'uso pessoal' : 'outra saída'}" — confira se era uma venda.`,
        )
        dados.saidas.push({
          linha: n,
          aba: 'Lança Saída Ptos',
          data: dt,
          titular: t,
          programa: p,
          tipo: pessoal ? 'USO_PESSOAL' : 'OUTRO',
          pontos: pts,
          taxaEmbarque: 0,
          valorVenda: 0,
          fornecedor: null,
          cliente: null,
          localizador: null,
          dataIda: null,
          dataVolta: null,
          passageiros: null,
          origem: null,
          destino: null,
          formaRecebimento: null,
          parcelas: 1,
          dataRecebimento: null,
          observacao: obs,
        })
      }
    }
  }
  for (const [k, qtd] of vendasPorChave) {
    if (qtd > 0) {
      const [t, p, pts] = k.split('|')
      avisos.push(
        `Controle de Venda: ${qtd} venda(s) de ${Number(pts).toLocaleString('pt-BR')} pontos (${p}, ${t}) não aparece(m) em "Lança Saída Ptos". ` +
          'Na planilha esses pontos não tinham saído do saldo; aqui eles saem.',
      )
    }
  }

  // ---- E|S Financeiras --------------------------------------------------------
  const fin = lerAba('E|S Financeiras')
  if (fin) {
    const tab = acharTabela(fin, ['CPF', 'Valor', 'Descrição'])
    if (tab) {
      const c = {
        lanc: tab.col('Data Lançamento'),
        oper: tab.col('Data Operação'),
        cpf: tab.col('CPF'),
        valor: tab.col('Valor'),
        desc: tab.col('Descrição'),
        tipo: Math.max(tab.col('Entada / Saída'), tab.col('Entrada / Saída')),
      }
      for (let i = tab.linha + 1; i < fin.length; i++) {
        const l = fin[i] ?? []
        const n = i + 1
        const valor = numero(pegar(l, c.valor))
        const dt = data(pegar(l, c.oper)) ?? data(pegar(l, c.lanc))
        if (valor === null && !dt) continue
        if (valor === null || !dt) {
          avisos.push(`E|S Financeiras, linha ${n}: faltou data ou valor. Linha ignorada.`)
          continue
        }
        const tipoTexto = normalizar(pegar(l, c.tipo))
        const cpfTexto = texto(pegar(l, c.cpf))
        dados.movimentos.push({
          linha: n,
          data: dt,
          titular: cpfTexto ? titular(cpfTexto, `E|S Financeiras (linha ${n})`) : null,
          tipo: tipoTexto.startsWith('s') || valor < 0 ? 'SAIDA' : 'ENTRADA',
          valor: Math.abs(centavos(valor)),
          descricao: texto(pegar(l, c.desc)) ?? 'Importado da planilha',
        })
      }
    }
  }

  return dados
}
