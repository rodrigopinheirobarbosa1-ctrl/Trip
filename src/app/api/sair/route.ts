import { NextResponse } from 'next/server'
import { sair } from '@/lib/auth'

export async function POST(requisicao: Request) {
  await sair()
  return NextResponse.redirect(new URL('/login', requisicao.url), { status: 303 })
}
