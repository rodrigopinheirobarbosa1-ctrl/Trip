'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { exigirUsuarioAction } from '@/lib/auth'
import { auditar } from '@/lib/audit'
import { ErroFormulario, opcao, textoObrigatorio, textoOpcional, tratarErros } from '@/lib/form-dados'
import { lerCentavos } from '@/lib/formatos'
import { TIPOS_PROGRAMA } from '@/lib/rotulos'
import type { EstadoForm } from '@/components/form'

const TIPOS = Object.keys(TIPOS_PROGRAMA) as (keyof typeof TIPOS_PROGRAMA)[]

function lerPrograma(dados: FormData) {
  const milheiroTexto = textoOpcional(dados, 'valorMilheiro')
  const valorMilheiro = milheiroTexto ? lerCentavos(milheiroTexto) : null
  if (milheiroTexto && valorMilheiro === null) throw new ErroFormulario('Valor inválido em "Preço de venda do milheiro".')
  const parceiroTexto = textoOpcional(dados, 'custoParceiroMilheiro')
  const custoParceiroMilheiro = parceiroTexto ? lerCentavos(parceiroTexto) : null
  if (parceiroTexto && custoParceiroMilheiro === null) {
    throw new ErroFormulario('Valor inválido em "Custo atribuído aos pontos de parceiros".')
  }
  return {
    nome: textoObrigatorio(dados, 'nome', 'Nome'),
    tipo: opcao(dados, 'tipo', 'Tipo', TIPOS),
    valorMilheiro,
    custoParceiroMilheiro,
  }
}

export async function criarPrograma(_e: EstadoForm, dados: FormData): Promise<EstadoForm> {
  return tratarErros(async () => {
    const usuario = await exigirUsuarioAction()
    const p = await db.programa.create({ data: lerPrograma(dados) })
    await auditar({ usuario, acao: 'CRIAR', entidade: 'Programa', entidadeId: p.id, resumo: `Cadastrou o programa ${p.nome}` })
    revalidatePath('/programas')
    return { ok: `Programa ${p.nome} cadastrado.` }
  })
}

export async function salvarPrograma(id: string, _e: EstadoForm, dados: FormData): Promise<EstadoForm> {
  return tratarErros(async () => {
    const usuario = await exigirUsuarioAction()
    const p = await db.programa.update({ where: { id }, data: { ...lerPrograma(dados), ativo: dados.get('ativo') === 'on' } })
    await auditar({ usuario, acao: 'ALTERAR', entidade: 'Programa', entidadeId: id, resumo: `Alterou o programa ${p.nome}` })
    revalidatePath('/programas')
    redirect('/programas')
  })
}
