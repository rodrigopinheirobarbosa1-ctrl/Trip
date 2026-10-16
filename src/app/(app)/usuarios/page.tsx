import { db } from '@/lib/db'
import { exigirAdmin } from '@/lib/auth'
import { opcoes, PAPEIS } from '@/lib/rotulos'
import { Cabecalho, Cartao, Etiqueta } from '@/components/ui'
import { BotaoEnviar, Formulario } from '@/components/form'
import { Caixa, Selecao, Texto } from '@/components/campos'
import { alterarUsuario, criarUsuario, redefinirSenha } from './actions'

export default async function Usuarios() {
  const eu = await exigirAdmin()
  const usuarios = await db.usuario.findMany({ orderBy: [{ ativo: 'desc' }, { nome: 'asc' }] })

  return (
    <>
      <Cabecalho
        titulo="Usuários"
        descricao="Quem pode entrar no sistema. Administradores também cadastram usuários, importam a planilha e veem o histórico."
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {usuarios.map((u) => (
            <Cartao key={u.id}>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <p className="font-semibold text-slate-900">{u.nome}</p>
                <span className="text-sm text-slate-500">{u.email}</span>
                <Etiqueta tom={u.papel === 'ADMIN' ? 'azul' : 'cinza'}>{PAPEIS[u.papel]}</Etiqueta>
                {!u.ativo && <Etiqueta tom="vermelho">Desativado</Etiqueta>}
                {u.id === eu.id && <Etiqueta tom="verde">Você</Etiqueta>}
              </div>
              <p className="mb-3 text-xs text-slate-400">
                Último acesso: {u.ultimoAcesso ? u.ultimoAcesso.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : 'nunca'}
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <Formulario action={alterarUsuario.bind(null, u.id)} className="space-y-3">
                  <Selecao rotulo="Perfil" nome="papel" valor={u.papel} opcoes={opcoes(PAPEIS)} />
                  <Caixa rotulo="Pode entrar no sistema" nome="ativo" marcado={u.ativo} />
                  <BotaoEnviar variante="secundario">Salvar perfil</BotaoEnviar>
                </Formulario>
                <Formulario action={redefinirSenha.bind(null, u.id)} className="space-y-3">
                  <Texto rotulo="Nova senha" nome="senha" tipo="password" dica="Pelo menos 8 caracteres." />
                  <BotaoEnviar variante="secundario">Definir nova senha</BotaoEnviar>
                </Formulario>
              </div>
            </Cartao>
          ))}
        </div>
        <Cartao titulo="Novo usuário">
          <Formulario action={criarUsuario} limparAoSalvar className="space-y-4">
            <Texto rotulo="Nome" nome="nome" obrigatorio />
            <Texto rotulo="E-mail" nome="email" tipo="email" obrigatorio />
            <Selecao rotulo="Perfil" nome="papel" valor="OPERADOR" opcoes={opcoes(PAPEIS)} />
            <Texto rotulo="Senha inicial" nome="senha" tipo="password" obrigatorio dica="A pessoa pode trocar depois em “Minha senha”." />
            <BotaoEnviar>Criar usuário</BotaoEnviar>
          </Formulario>
        </Cartao>
      </div>
    </>
  )
}
