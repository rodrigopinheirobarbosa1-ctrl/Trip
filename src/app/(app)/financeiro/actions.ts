'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { exigirUsuarioAction } from '@/lib/auth'
import { auditar } from '@/lib/audit'
import { formatarData, formatarReais } from '@/lib/formatos'
import { centavosOpcional, dataObrigatoria, ErroFormulario, opcao, textoObrigatorio, textoOpcional, tratarErros } from '@/lib/form-dados'
import type { EstadoForm } from '@/components/form'

function lerMovimento(dados: FormData) {
  const valor = centavosOpcional(dados, 'valor', 'Valor')
  if (valor === 0) throw new ErroFormulario('Informe o valor.')
  return {
    data: dataObrigatoria(dados, 'data', 'Data'),
    tipo: opcao(dados, 'tipo', 'Entrada ou saída', ['ENTRADA', 'SAIDA'] as const),
    titularId: textoOpcional(dados, 'titularId'),
    valor,
    descricao: textoObrigatorio(dados, 'descricao', 'Descrição'),
  }
}

export async function salvarMovimento(id: string | null, _e: EstadoForm, dados: FormData): Promise<EstadoForm> {
  return tratarErros(async () => {
    const usuario = await exigirUsuarioAction()
    const m = lerMovimento(dados)
    const salvo = id
      ? await db.movimentoFinanceiro.update({ where: { id }, data: m })
      : await db.movimentoFinanceiro.create({ data: { ...m, criadoPor: usuario.nome } })
    await auditar({
      usuario,
      acao: id ? 'ALTERAR' : 'CRIAR',
      entidade: 'MovimentoFinanceiro',
      entidadeId: salvo.id,
      resumo: `${id ? 'Alterou' : 'Lançou'} ${salvo.tipo === 'ENTRADA' ? 'entrada' : 'saída'} de ${formatarReais(salvo.valor)} em ${formatarData(salvo.data)}: ${salvo.descricao}`,
    })
    revalidatePath('/', 'layout')
    redirect(id ? '/financeiro' : `/financeiro?ok=${Date.now()}`)
  })
}

export async function excluirMovimento(id: string, _e: EstadoForm): Promise<EstadoForm> {
  return tratarErros(async () => {
    const usuario = await exigirUsuarioAction()
    const m = await db.movimentoFinanceiro.delete({ where: { id } })
    await auditar({
      usuario,
      acao: 'EXCLUIR',
      entidade: 'MovimentoFinanceiro',
      entidadeId: id,
      resumo: `Excluiu ${m.tipo === 'ENTRADA' ? 'entrada' : 'saída'} de ${formatarReais(m.valor)} (${formatarData(m.data)}): ${m.descricao}`,
    })
    revalidatePath('/', 'layout')
    redirect('/financeiro')
  })
}
