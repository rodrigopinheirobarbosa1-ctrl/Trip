import 'server-only'
import { getDocumentProxy } from 'unpdf'
import { lerExtratoSmiles, montarLinhasDeTexto, pareceExtratoSmiles, type ItemTexto } from './smiles-pdf'
import type { LinhaLida } from './sugestao'

/**
 * Lê o texto de um PDF e, se for um formato conhecido (hoje, o extrato da
 * Smiles), devolve as movimentações sem usar a IA. Devolve null para PDFs
 * de outro formato ou sem texto (escaneados), que seguem para a IA.
 */
export async function lerPdfSemIa(base64: string, pagina: number): Promise<LinhaLida[] | null> {
  try {
    const pdf = await getDocumentProxy(new Uint8Array(Buffer.from(base64, 'base64')))
    const paginas: ItemTexto[][] = []
    for (let n = 1; n <= pdf.numPages; n++) {
      const conteudo = await (await pdf.getPage(n)).getTextContent()
      paginas.push(
        conteudo.items.flatMap((it) =>
          'str' in it ? [{ str: it.str, x: it.transform[4], y: it.transform[5], largura: it.width }] : [],
        ),
      )
    }
    const linhas = montarLinhasDeTexto(paginas)
    if (!pareceExtratoSmiles(linhas)) return null
    return lerExtratoSmiles(linhas, pagina)
  } catch (e) {
    console.error('Não consegui ler o texto do PDF; vai para a IA.', e)
    return null
  }
}
