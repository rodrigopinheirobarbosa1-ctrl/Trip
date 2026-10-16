/**
 * Primeira barreira contra tentativas repetidas de adivinhar senha.
 *
 * Guarda as tentativas em memória: simples, sem dependências, e suficiente
 * para o porte do Trip. Se um dia a aplicação rodar em várias instâncias,
 * troque por um contador compartilhado (banco ou Redis) — a interface abaixo
 * continua a mesma.
 *
 * Código puro, sem banco nem arquivos: por isso é testado diretamente.
 */

const JANELA = 15 * 60 * 1000 // 15 minutos
const MAXIMO = 8 // tentativas erradas permitidas na janela

type Registro = { erros: number; primeiraEm: number }
const tentativas = new Map<string, Registro>()

function limpar(agora: number) {
  for (const [chave, registro] of tentativas) {
    if (agora - registro.primeiraEm > JANELA) tentativas.delete(chave)
  }
}

/** Devolve os minutos de espera se a chave estiver bloqueada; 0 se liberada. */
export function minutosDeBloqueio(chave: string): number {
  const agora = Date.now()
  limpar(agora)
  const registro = tentativas.get(chave)
  if (!registro || registro.erros < MAXIMO) return 0
  const restante = JANELA - (agora - registro.primeiraEm)
  return Math.max(1, Math.ceil(restante / 60000))
}

export function registrarErro(chave: string): void {
  const agora = Date.now()
  limpar(agora)
  const registro = tentativas.get(chave)
  if (!registro) tentativas.set(chave, { erros: 1, primeiraEm: agora })
  else registro.erros += 1
}

export function limparTentativas(chave: string): void {
  tentativas.delete(chave)
}
