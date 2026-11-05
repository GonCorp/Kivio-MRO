import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { rmSync } from 'node:fs'

// Dois sites saem do mesmo código:
//   npm run build        -> site dos clientes (pasta dist)
//   npm run build:admin  -> site exclusivo do super admin (pasta dist-admin), com outro endereço
function siteAdmin(): Plugin {
  return {
    name: 'mro-site-admin',
    // o painel não é app instalável: sem manifest nem service worker
    closeBundle() { for (const f of ['sw.js', 'manifest.webmanifest']) rmSync('dist-admin/' + f, { force: true }) },
    transformIndexHtml: {
      order: 'pre',
      handler(html: string) {
      return html
        .replace('/src/main.tsx', '/src/admin/main.tsx')
        .replace('<title>MRO · Minha República em Ordem</title>', '<title>Kivio · Painel</title>')
        .replace(/<meta name="description"[^>]*>/, '<meta name="robots" content="noindex, nofollow" />')
        .replace(/<link rel="manifest"[^>]*>/, '')
      },
    },
  }
}

export default defineConfig(({ mode }) => {
  const admin = mode === 'admin'
  return {
    plugins: [react(), ...(admin ? [siteAdmin()] : [])],
    build: { outDir: admin ? 'dist-admin' : 'dist', emptyOutDir: true },
  }
})
