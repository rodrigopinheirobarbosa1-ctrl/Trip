// Preparação dos arquivos do extrato, no navegador: tira as imagens de dentro
// do Word e reduz os prints antes de enviar (envios grandes são recusados
// pela Vercel e custam mais para a IA ler).
import { unzipSync } from 'fflate'

export type PaginaPreparada = {
  nome: string
  dados: string // base64
  tipo: 'image/jpeg' | 'application/pdf'
}

const LADO_MAXIMO = 1600
const PDF_MAXIMO = 3 * 1024 * 1024

function paraBase64(bytes: Uint8Array): string {
  let binario = ''
  const pedaco = 0x8000
  for (let i = 0; i < bytes.length; i += pedaco) {
    binario += String.fromCharCode(...bytes.subarray(i, i + pedaco))
  }
  return btoa(binario)
}

/** Reduz a imagem (lado maior até 1600 px) e converte para JPEG. */
async function reduzirImagem(blob: Blob): Promise<string> {
  const bitmap = await createImageBitmap(blob)
  const escala = Math.min(1, LADO_MAXIMO / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * escala)
  canvas.height = Math.round(bitmap.height * escala)
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#ffffff' // prints com fundo transparente ficam legíveis
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  const jpeg = await new Promise<Blob>((ok, falha) =>
    canvas.toBlob((b) => (b ? ok(b) : falha(new Error('não consegui converter a imagem'))), 'image/jpeg', 0.88),
  )
  return paraBase64(new Uint8Array(await jpeg.arrayBuffer()))
}

const TIPO_POR_EXTENSAO: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp' }

/** Imagens de um .docx, na ordem em que aparecem no documento. */
function imagensDoWord(bytes: Uint8Array): { nome: string; blob: Blob }[] {
  const arquivos = unzipSync(bytes)
  const texto = (caminho: string) => (arquivos[caminho] ? new TextDecoder().decode(arquivos[caminho]) : '')

  // word/_rels/document.xml.rels liga cada rId a um arquivo de word/media/.
  const alvos = new Map<string, string>()
  for (const m of texto('word/_rels/document.xml.rels').matchAll(/Id="([^"]+)"[^>]*Target="([^"]+)"/g)) {
    alvos.set(m[1], `word/${m[2].replace(/^\.?\//, '')}`)
  }
  const ordem: string[] = []
  for (const m of texto('word/document.xml').matchAll(/r:embed="([^"]+)"/g)) {
    const alvo = alvos.get(m[1])
    if (alvo && !ordem.includes(alvo)) ordem.push(alvo)
  }
  // Imagens sem referência (raro) vão para o fim, pela numeração.
  const todas = Object.keys(arquivos)
    .filter((c) => c.startsWith('word/media/'))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  for (const c of todas) if (!ordem.includes(c)) ordem.push(c)

  return ordem
    .map((caminho) => {
      const ext = caminho.split('.').pop()?.toLowerCase() ?? ''
      const tipo = TIPO_POR_EXTENSAO[ext]
      if (!tipo || !arquivos[caminho]) return null
      return { nome: caminho.split('/').pop()!, blob: new Blob([arquivos[caminho]], { type: tipo }) }
    })
    .filter((x): x is { nome: string; blob: Blob } => x !== null)
}

/** Transforma os arquivos escolhidos em páginas prontas para a leitura. */
export async function prepararArquivos(arquivos: File[]): Promise<PaginaPreparada[]> {
  const paginas: PaginaPreparada[] = []
  for (const arquivo of arquivos) {
    const nome = arquivo.name.toLowerCase()
    if (nome.endsWith('.docx')) {
      const imagens = imagensDoWord(new Uint8Array(await arquivo.arrayBuffer()))
      if (imagens.length === 0) throw new Error(`O arquivo ${arquivo.name} não tem imagens.`)
      for (const [i, img] of imagens.entries()) {
        paginas.push({ nome: `${arquivo.name} (imagem ${i + 1})`, dados: await reduzirImagem(img.blob), tipo: 'image/jpeg' })
      }
    } else if (nome.endsWith('.pdf') || arquivo.type === 'application/pdf') {
      if (arquivo.size > PDF_MAXIMO) {
        throw new Error(`O PDF ${arquivo.name} tem mais de 3 MB. Divida em partes menores ou envie como prints.`)
      }
      paginas.push({ nome: arquivo.name, dados: paraBase64(new Uint8Array(await arquivo.arrayBuffer())), tipo: 'application/pdf' })
    } else if (arquivo.type.startsWith('image/')) {
      paginas.push({ nome: arquivo.name, dados: await reduzirImagem(arquivo), tipo: 'image/jpeg' })
    } else if (nome.endsWith('.doc')) {
      throw new Error(`${arquivo.name}: salve o Word no formato .docx (Arquivo > Salvar como).`)
    } else {
      throw new Error(`${arquivo.name}: tipo de arquivo não aceito. Use imagens, PDF ou Word (.docx).`)
    }
  }
  return paginas
}
