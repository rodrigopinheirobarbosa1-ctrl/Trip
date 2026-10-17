import 'server-only'
import { readFileSync } from 'node:fs'
import Anthropic from '@anthropic-ai/sdk'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import * as z from 'zod/v4'
import type { LinhaLida } from './sugestao'

/**
 * Lê um print (imagem) ou PDF de extrato com o Claude e devolve as
 * movimentações como dados.
 *
 * Precisa da variável ANTHROPIC_API_KEY (na Vercel: Settings > Environment
 * Variables). Cada página custa poucos centavos.
 */

const MODELO = 'claude-opus-5-5'

const Resposta = z.object({
  eExtrato: z
    .boolean()
    .describe('false se a imagem não é de um programa de pontos/milhas (nem extrato de movimentações, nem tela com o saldo)'),
  saldoExibido: z
    .number()
    .int()
    .nullable()
    .describe('saldo atual de pontos/milhas disponíveis mostrado na tela, se aparecer (não "a expirar" nem "a receber")'),
  linhas: z.array(
    z.object({
      data: z.string().describe('data da movimentação no formato AAAA-MM-DD'),
      operacao: z.string().describe('tipo da operação como escrito (Acúmulo, Bônus, Resgate, Transferência...)'),
      descricao: z.string().describe('parceiro ou descrição como escrito'),
      pontos: z.number().int().describe('quantidade de pontos: positiva quando entra, negativa quando sai'),
      observacao: z
        .string()
        .nullable()
        .describe('observação da linha: parceiro, texto do bônus/promoção e outros detalhes úteis, se houver'),
      localizador: z.string().nullable().describe('passagens: localizador da reserva (ex.: "QIHEFV"), se aparecer'),
    }),
  ),
})

const INSTRUCOES = `Você lê extratos de programas de fidelidade brasileiros (Livelo, Smiles, Latam Pass, Azul, Esfera, All Accor e outros) a partir de prints de tela ou PDFs, para que as movimentações sejam lançadas num sistema de controle de milhas.

Transcreva cada movimentação de pontos que aparece, exatamente uma vez por linha visível, na ordem da tela. Datas brasileiras (dd/mm/aaaa) devem virar AAAA-MM-DD; se o ano não aparecer na linha, deduza pelo contexto da tela. Pontos usam ponto como separador de milhar ("250.000" = 250000). O sinal vem da tela: "+" ou verde é entrada; "-" ou vermelho é saída.

Não são movimentações: botões e textos de interface (por exemplo "Turbinar meus pontos", "Como funciona", paginação), saldos, "pontos a expirar" e "pontos a receber". Se um número estiver ilegível, não invente: deixe a linha de fora.

O saldo vai em saldoExibido: o total de pontos ou milhas disponíveis agora ("Saldo", "Você tem", "Pontos disponíveis", "Saldo de milhas"...). Alguns programas mostram o saldo numa tela separada, sem movimentações: essa tela também vale (eExtrato = true, saldoExibido com o saldo e nenhuma linha). Só use eExtrato = false para imagens que não são de um programa de pontos.

Extratos em PDF (como o da Smiles) trazem mais detalhes em cada movimentação. Transcreva UMA linha por movimentação (cada "Descrição"), com o total de milhas dela; os "Detalhes da transação" (tarifas, taxas de embarque, bilhetes) já estão somados nesse total e não viram linhas. A data é a do dia da movimentação. Em observacao, junte o parceiro e o texto do bônus quando houver (ex.: "Parceiro: LIVELO S.A. · Bônus: 18/05 WL ate 80%"). Em passagens, o ID de 6 letras é o localizador. A devolução de uma passagem cancelada aparece como passagem com milhas positivas: transcreva assim mesmo, com o sinal positivo.`

/** Só em desenvolvimento: lê as respostas de um arquivo, para testar a tela sem gastar com a IA. */
function respostaDeTeste(pagina: number): z.infer<typeof Resposta> | null {
  const arquivo = process.env.TRIP_EXTRATO_TESTE
  if (!arquivo || process.env.NODE_ENV === 'production') return null
  const paginas = JSON.parse(readFileSync(arquivo, 'utf8')) as z.infer<typeof Resposta>[]
  return paginas[(pagina - 1) % paginas.length]
}

export function iaConfigurada(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY) || Boolean(process.env.TRIP_EXTRATO_TESTE && process.env.NODE_ENV !== 'production')
}

export type ResultadoLeitura =
  | { ok: true; linhas: LinhaLida[]; saldoExibido: number | null; /** Lido sem IA (PDF de formato conhecido). */ semIa?: boolean }
  | { ok: false; erro: string }

export async function lerPaginaDoExtrato(arquivo: {
  /** "2026-01-01": transcrever só daí em diante (extratos longos). */
  desde?: string | null
  pagina: number
  /** Conteúdo em base64. */
  dados: string
  tipo: 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf'
  programa: string
}): Promise<ResultadoLeitura> {
  const teste = respostaDeTeste(arquivo.pagina)
  if (teste) {
    return {
      ok: true,
      saldoExibido: teste.saldoExibido,
      linhas: teste.linhas
        .filter((l) => !arquivo.desde || l.data >= arquivo.desde)
        .map((l) => ({ ...l, localizador: l.localizador ?? null, pagina: arquivo.pagina })),
    }
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return { ok: false, erro: 'A leitura automática ainda não foi configurada (falta a chave ANTHROPIC_API_KEY na Vercel).' }
  }

  const client = new Anthropic()
  const conteudo: Anthropic.Beta.BetaContentBlockParam =
    arquivo.tipo === 'application/pdf'
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: arquivo.dados } }
      : { type: 'image', source: { type: 'base64', media_type: arquivo.tipo, data: arquivo.dados } }

  try {
    const resposta = await client.beta.messages.parse({
      model: MODELO,
      // Extratos de vários anos geram respostas longas; acima de ~21 mil o SDK exige streaming.
      max_tokens: 20000,
      // Se o modelo recusar por engano (filtros de segurança), o pedido é
      // refeito automaticamente no modelo alternativo recomendado.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium', format: betaZodOutputFormat(Resposta) },
      system: INSTRUCOES,
      messages: [
        {
          role: 'user',
          content: [
            conteudo,
            {
              type: 'text',
              text:
                `Extrato do programa ${arquivo.programa}. Transcreva as movimentações` +
                (arquivo.desde ? ` de ${arquivo.desde.split('-').reverse().join('/')} em diante (ignore as anteriores).` : '.'),
            },
          ],
        },
      ],
    })

    if (resposta.stop_reason === 'refusal') {
      return { ok: false, erro: `A página ${arquivo.pagina} não pôde ser lida (recusada pela IA). Tente um print mais recortado.` }
    }
    if (resposta.stop_reason === 'max_tokens') {
      return { ok: false, erro: `A página ${arquivo.pagina} é longa demais para ler de uma vez. Divida em prints menores.` }
    }
    const lido = resposta.parsed_output
    if (!lido) return { ok: false, erro: `Não consegui interpretar a página ${arquivo.pagina}. Tente de novo.` }
    // Uma tela só com o saldo vale, mesmo que a IA não a considere extrato.
    if (!lido.eExtrato && lido.saldoExibido === null) {
      return { ok: false, erro: `A página ${arquivo.pagina} não parece ser um extrato de pontos.` }
    }
    return {
      ok: true,
      saldoExibido: lido.saldoExibido,
      linhas: lido.linhas
        .filter((l) => /^\d{4}-\d{2}-\d{2}$/.test(l.data) && Number.isInteger(l.pontos) && l.pontos !== 0)
        .filter((l) => !arquivo.desde || l.data >= arquivo.desde)
        .map((l) => ({ ...l, pagina: arquivo.pagina })),
    }
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) {
      return { ok: false, erro: 'A chave da IA (ANTHROPIC_API_KEY) é inválida. Confira o valor na Vercel.' }
    }
    if (e instanceof Anthropic.RateLimitError) {
      return { ok: false, erro: 'Muitas leituras ao mesmo tempo. Aguarde um minuto e tente de novo.' }
    }
    if (e instanceof Anthropic.BadRequestError) {
      console.error('Leitura de extrato recusada pela API:', e.message)
      return { ok: false, erro: `A página ${arquivo.pagina} não pôde ser enviada (${e.message.slice(0, 160)}).` }
    }
    if (e instanceof Anthropic.APIError) {
      console.error('Erro da API na leitura de extrato:', e.status, e.message)
      return { ok: false, erro: 'O serviço de leitura está com problema agora. Tente de novo em alguns minutos.' }
    }
    throw e
  }
}
