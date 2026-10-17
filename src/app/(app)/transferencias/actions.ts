'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { exigirUsuarioAction } from '@/lib/auth'
import { detalharTransferencia } from '@/lib/detalhes-historico'
import { auditar } from '@/lib/audit'
import { validarSaldos } from '@/lib/dados'
import { calcularPontosDestino, type MovTransferencia } from '@/lib/carteira'
import { formatarData, formatarPontos, lerPontos } from '@/lib/formatos'
import {
  dataObrigatoria,
  ErroFormulario,
  numeroOpcional,
  pontosObrigatorio,
  textoObrigatorio,
  textoOpcional,
  tratarErros,
} from '@/lib/form-dados'
import type { EstadoForm } from '@/components/form'

function lerTransferencia(dados: FormData) {
  const origemId = textoObrigatorio(dados, 'origemId', 'Programa de origem')
  const destinoId = textoObrigatorio(dados, 'destinoId', 'Programa de destino')
  if (origemId === destinoId) throw new ErroFormulario('Origem e destino precisam ser programas diferentes.')
  const pontos = pontosObrigatorio(dados, 'pontos', 'Pontos transferidos')
  const bonusPercentual = numeroOpcional(dados, 'bonusPercentual', 'Bônus (%)') ?? 0
  if (bonusPercentual <= -100 || bonusPercentual > 1000) throw new ErroFormulario('O bônus deve ficar entre -99% e 1000%.')
  // Quantidade que chegou: a pessoa pode corrigir se o programa arredondou diferente.
  const informado = lerPontos(textoOpcional(dados, 'pontosDestino'))
  const pontosDestino = informado && informado > 0 ? informado : calcularPontosDestino(pontos, bonusPercentual)
  return {
    data: dataObrigatoria(dados, 'data', 'Data'),
    titularId: textoObrigatorio(dados, 'titularId', 'Pessoa'),
    origemId,
    destinoId,
    pontos,
    bonusPercentual,
    pontosDestino,
    observacao: textoOpcional(dados, 'observacao'),
    imediata: dados.get('imediata') === 'sim',
  }
}

const DIA = 86400000

/**
 * Transferência imediata: acha a compra feita na hora, na origem, para completar
 * a transferência. Mesma pessoa e programa, até 3 dias de diferença, no máximo os
 * pontos transferidos, e ainda não ligada a outra transferência.
 */
async function acharCompraImediata(
  t: { data: Date; titularId: string; origemId: string; pontos: number },
  transferenciaId: string | null,
): Promise<string> {
  const compras = await db.entrada.findMany({
    where: {
      titularId: t.titularId,
      programaId: t.origemId,
      categoria: 'COMPRA',
      pontos: { lte: t.pontos },
      data: { gte: new Date(t.data.getTime() - 3 * DIA), lte: new Date(t.data.getTime() + 3 * DIA) },
      transferenciasImediatas: { none: transferenciaId ? { id: { not: transferenciaId } } : {} },
    },
  })
  const melhor = compras.sort(
    (a, b) => Math.abs(a.data.getTime() - t.data.getTime()) - Math.abs(b.data.getTime() - t.data.getTime()) || b.pontos - a.pontos,
  )[0]
  if (!melhor) {
    throw new ErroFormulario(
      'Transferência imediata: não achei a compra de pontos na origem perto desta data. Lance antes a compra (Entradas → Nova, tipo Compra, ' +
        'com os pontos comprados e o valor pago) e salve a transferência de novo.',
    )
  }
  return melhor.id
}

const paraCarteira = (
  id: string,
  t: ReturnType<typeof lerTransferencia>,
  ordem: number,
  compraId: string | null,
): MovTransferencia => ({
  id, data: t.data, titularId: t.titularId, origemId: t.origemId, destinoId: t.destinoId,
  pontos: t.pontos, pontosDestino: t.pontosDestino, ordem, compraId,
})

export async function salvarTransferencia(id: string | null, _e: EstadoForm, dados: FormData): Promise<EstadoForm> {
  return tratarErros(async () => {
    const usuario = await exigirUsuarioAction()
    const { imediata, ...nova } = lerTransferencia(dados)
    const anterior = id ? await db.transferencia.findUniqueOrThrow({ where: { id } }) : null
    const compraId = imediata ? await acharCompraImediata(nova, id) : null

    const chaves: [string, string][] = [
      [nova.titularId, nova.origemId],
      [nova.titularId, nova.destinoId],
    ]
    if (anterior) chaves.push([anterior.titularId, anterior.origemId], [anterior.titularId, anterior.destinoId])
    const erroSaldo = await validarSaldos(
      (m) => ({
        ...m,
        transferencias: [
          ...m.transferencias.filter((t) => t.id !== id),
          paraCarteira(id ?? 'nova', { ...nova, imediata }, anterior?.criadoEm.getTime() ?? Date.now(), compraId),
        ],
      }),
      chaves,
    )
    if (erroSaldo) return { erro: erroSaldo }

    const inclui = { titular: true, origem: true, destino: true } as const
    const salvo = anterior
      ? await db.transferencia.update({ where: { id: anterior.id }, data: { ...nova, compraId }, include: inclui })
      : await db.transferencia.create({ data: { ...nova, compraId, criadoPor: usuario.nome }, include: inclui })

    await auditar({
      usuario,
      acao: anterior ? 'ALTERAR' : 'CRIAR',
      entidade: 'Transferencia',
      entidadeId: salvo.id,
      resumo:
        `${anterior ? 'Alterou' : 'Lançou'} transferência de ${formatarPontos(salvo.pontos)} ${salvo.origem.nome} → ` +
        `${formatarPontos(salvo.pontosDestino)} ${salvo.destino.nome} (${salvo.titular.nome}, ${formatarData(salvo.data)})` +
        (compraId ? ' — transferência imediata, com a compra feita na hora' : ''),
    })
    revalidatePath('/', 'layout')
    redirect(dados.get('continuar') === 'sim' ? `/transferencias/nova?ok=${Date.now()}` : '/transferencias')
  })
}

export async function excluirTransferencia(id: string, _e: EstadoForm): Promise<EstadoForm> {
  return tratarErros(async () => {
    const usuario = await exigirUsuarioAction()
    const t = await db.transferencia.findUniqueOrThrow({ where: { id }, include: { titular: true, origem: true, destino: true } })
    const erroSaldo = await validarSaldos(
      (m) => ({ ...m, transferencias: m.transferencias.filter((x) => x.id !== id) }),
      [[t.titularId, t.destinoId]],
    )
    if (erroSaldo) return { erro: `Não dá para excluir: os pontos recebidos já foram usados. ${erroSaldo}` }
    await db.transferencia.delete({ where: { id } })
    await auditar({
      usuario,
      acao: 'EXCLUIR',
      entidade: 'Transferencia',
      entidadeId: id,
      resumo: `Excluiu — ${detalharTransferencia(t)}`,
    })
    revalidatePath('/', 'layout')
    redirect('/transferencias')
  })
}
