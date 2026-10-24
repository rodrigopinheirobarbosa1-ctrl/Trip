/**
 * Servidor MCP da ligação com o Claude (transporte "Streamable HTTP", sem
 * sessão: cada pedido é respondido em JSON). A chave secreta do endereço é
 * gerada em "Ligação com o Claude"; endereço errado responde 404.
 */
import { conferirChave } from '@/lib/ligacao-claude'
import { chamarFerramenta, FERRAMENTAS } from '@/lib/mcp'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const VERSOES = ['2025-06-18', '2025-03-26', '2024-11-05']

const INSTRUCOES =
  'Trip: controle de milhas e pontos (várias pessoas/CPFs, vários programas). Valores em reais, datas AAAA-MM-DD. ' +
  'Custo pelo método de custo médio por trimestre. Antes de alterar, consulte o lançamento (ver_lancamento) e confirme com a pessoa ' +
  'o que vai mudar; toda alteração fica no histórico como "Claude (assistente)" e pode ser desfeita no Trip pelo botão "Relançar".'

type Pedido = { jsonrpc: '2.0'; id?: string | number | null; method: string; params?: Record<string, unknown> }

async function responder(p: Pedido, edicao: boolean): Promise<unknown | null> {
  // Notificações (sem id) não têm resposta.
  if (p.id === undefined || p.id === null) return null
  const ok = (result: unknown) => ({ jsonrpc: '2.0', id: p.id, result })
  switch (p.method) {
    case 'initialize': {
      const pedida = String(p.params?.protocolVersion ?? '')
      return ok({
        protocolVersion: VERSOES.includes(pedida) ? pedida : VERSOES[0],
        capabilities: { tools: {} },
        serverInfo: { name: 'trip', title: 'Trip – milhas e pontos', version: '1.0.0' },
        instructions: INSTRUCOES + (edicao ? '' : ' A edição está desligada: só leitura.'),
      })
    }
    case 'ping':
      return ok({})
    case 'tools/list':
      return ok({
        tools: FERRAMENTAS.filter((f) => edicao || !f.edicao).map((f) => ({
          name: f.name,
          description: f.description,
          inputSchema: f.inputSchema,
          annotations: f.edicao ? { readOnlyHint: false, destructiveHint: f.name === 'excluir_lancamento' } : { readOnlyHint: true },
        })),
      })
    case 'tools/call': {
      const nome = String(p.params?.name ?? '')
      const args = (p.params?.arguments ?? {}) as Record<string, unknown>
      return ok(await chamarFerramenta(nome, args, edicao))
    }
    default:
      return { jsonrpc: '2.0', id: p.id, error: { code: -32601, message: `Método não suportado: ${p.method}` } }
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ chave: string }> }) {
  const acesso = await conferirChave((await params).chave)
  if (!acesso) return new Response('Não encontrado.', { status: 404 })

  let corpo: unknown
  try {
    corpo = await req.json()
  } catch {
    return Response.json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'JSON inválido.' } }, { status: 400 })
  }
  const pedidos = (Array.isArray(corpo) ? corpo : [corpo]) as Pedido[]
  const respostas = (await Promise.all(pedidos.map((p) => responder(p, acesso.edicao)))).filter((r) => r !== null)
  if (respostas.length === 0) return new Response(null, { status: 202 })
  return Response.json(Array.isArray(corpo) ? respostas : respostas[0])
}

// Sem sessão nem notificações do servidor: não há canal GET.
export async function GET() {
  return new Response('Use POST.', { status: 405, headers: { Allow: 'POST' } })
}

export async function DELETE() {
  return new Response(null, { status: 405, headers: { Allow: 'POST' } })
}
