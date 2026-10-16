import { Cabecalho, Cartao } from '@/components/ui'
import { BotaoEnviar, Formulario } from '@/components/form'
import { Texto } from '@/components/campos'
import { trocarMinhaSenha } from '../usuarios/actions'

export default function MinhaSenha() {
  return (
    <>
      <Cabecalho titulo="Minha senha" />
      <Cartao className="max-w-md">
        <Formulario action={trocarMinhaSenha} className="space-y-4">
          <Texto rotulo="Senha atual" nome="atual" tipo="password" obrigatorio />
          <Texto rotulo="Nova senha" nome="nova" tipo="password" obrigatorio dica="Pelo menos 8 caracteres." />
          <Texto rotulo="Repita a nova senha" nome="confirmacao" tipo="password" obrigatorio />
          <BotaoEnviar>Trocar senha</BotaoEnviar>
        </Formulario>
      </Cartao>
    </>
  )
}
