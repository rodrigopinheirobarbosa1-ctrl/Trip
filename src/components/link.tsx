import NextLink from 'next/link'
import type { ComponentProps } from 'react'

/**
 * Link sem pré-carregamento.
 *
 * Em produção o Next.js pré-carrega, em segundo plano, toda página cujo link
 * aparece na tela. Nas listas isso dispara dezenas de páginas ao mesmo tempo,
 * cada uma consultando o banco, e o plano gratuito do banco recusa conexões
 * ("Too many database connections"). Aqui a página só é buscada no clique.
 */
export default function Link(props: ComponentProps<typeof NextLink>) {
  return <NextLink prefetch={false} {...props} />
}
