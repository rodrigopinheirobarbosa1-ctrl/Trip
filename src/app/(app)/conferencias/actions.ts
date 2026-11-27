'use server'

import { revalidatePath } from 'next/cache'
import { exigirUsuarioAction } from '@/lib/auth'
import { db } from '@/lib/db'
import { marcarConferida } from '@/lib/conferencias'
import { dataObrigatoria, ErroFormulario, textoObrigatorio, textoOpcional, tratarErros } from '@/lib/form-dados'
import { hoje, lerPontos } from '@/lib/formatos'
import type { EstadoForm } from '@/components/form'

export async function marcarConferidaAction(_e: EstadoForm, dados: FormData): Promise<EstadoForm> {
  return tratarErros(async () => {
    const usuario = await exigirUsuarioAction()
    const [titular, programa] = await Promise.all([
      db.titular.findUnique({ where: { id: textoObrigatorio(dados, 'titularId', 'Pessoa') } }),
      db.programa.findUnique({ where: { id: textoObrigatorio(dados, 'programaId', 'Programa') } }),
    ])
    if (!titular || !programa) throw new ErroFormulario('Pessoa ou programa não encontrado.')
    const conferidoEm = dataObrigatoria(dados, 'data', 'Data')
    if (conferidoEm.getTime() > hoje().getTime()) throw new ErroFormulario('A data da conferência não pode ser no futuro.')
    const saldo = lerPontos(textoOpcional(dados, 'saldo'))
    if (saldo === null) throw new ErroFormulario('Informe o saldo que aparece no app do programa.')
    await marcarConferida({ usuario, titular, programa, conferidoEm, saldo, observacao: textoOpcional(dados, 'observacao') })
    revalidatePath('/conferencias')
    revalidatePath('/extrato')
    return { ok: `${titular.nome} · ${programa.nome} marcada como conferida.` }
  })
}
