// Textos mostrados na tela para cada opção guardada no banco.

export const TIPOS_PROGRAMA = {
  CARTAO_CREDITO: 'Cartão de crédito',
  CIA_AEREA: 'Cia. aérea',
  HOTEL: 'Hotel',
  ABASTECIMENTO: 'Abastecimento',
  OUTRO: 'Outro',
} as const

export const CATEGORIAS_ENTRADA = {
  COMPRA: 'Compra',
  ACUMULO: 'Acúmulo',
  BONUS: 'Bônus',
  SALDO_INICIAL: 'Saldo inicial',
  AJUSTE: 'Ajuste',
} as const

export const FORMAS_PAGAMENTO = {
  PIX: 'PIX',
  CARTAO: 'Cartão de crédito',
  BOLETO: 'Boleto',
  DINHEIRO: 'Dinheiro',
  OUTRO: 'Outro',
  SEM_DESEMBOLSO: 'Sem desembolso',
} as const

export const TIPOS_SAIDA = {
  VENDA: 'Venda',
  USO_PESSOAL: 'Uso pessoal',
  OUTRO: 'Outra saída',
} as const

export const TIPOS_MOVIMENTO = {
  ENTRADA: 'Entrada',
  SAIDA: 'Saída',
} as const

export const PAPEIS = {
  ADMIN: 'Administrador',
  OPERADOR: 'Operador',
} as const

export function rotulo<T extends Record<string, string>>(tabela: T, chave: string | null | undefined): string {
  if (!chave) return '-'
  return (tabela as Record<string, string>)[chave] ?? chave
}

export function opcoes<T extends Record<string, string>>(tabela: T): { valor: keyof T & string; texto: string }[] {
  return Object.entries(tabela).map(([valor, texto]) => ({ valor: valor as keyof T & string, texto }))
}
