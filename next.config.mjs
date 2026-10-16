import path from 'node:path'
import { fileURLToPath } from 'node:url'

// A pasta deste arquivo é a raiz do projeto.
const raiz = path.dirname(fileURLToPath(import.meta.url))

/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: { root: raiz },
  // A importação envia os dados da planilha numa só chamada.
  experimental: { serverActions: { bodySizeLimit: '4mb' } },
  // Cabeçalhos de segurança básicos
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ]
  },
}
export default nextConfig
