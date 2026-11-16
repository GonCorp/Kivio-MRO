import { useEffect, useState } from 'react'
import { supabase } from './supabase'

// Reduz a foto no próprio aparelho (máx. 1024 px, JPEG) para economizar o armazenamento gratuito.
export async function comprimir(arq: File, max = 1024): Promise<Blob> {
  const url = URL.createObjectURL(arq)
  try {
    const img = await new Promise<HTMLImageElement>((ok, erro) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => erro(new Error('Não consegui abrir essa imagem.')); i.src = url })
    const esc = Math.min(1, max / Math.max(img.width, img.height))
    const c = document.createElement('canvas')
    c.width = Math.round(img.width * esc); c.height = Math.round(img.height * esc)
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
    return await new Promise<Blob>((ok, erro) => c.toBlob((b) => (b ? ok(b) : erro(new Error('Falha ao preparar a foto.'))), 'image/jpeg', 0.82))
  } finally { URL.revokeObjectURL(url) }
}

export async function enviarFoto(repId: string, pasta: string, arq: File, max = 1024): Promise<string> {
  const blob = await comprimir(arq, max)
  const path = `${repId}/${pasta}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`
  const { error } = await supabase.storage.from('mro').upload(path, blob, { contentType: 'image/jpeg' })
  if (error) throw new Error(error.message)
  return path
}

const cache = new Map<string, { url: string; ate: number }>()
export function useFotoUrl(path: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(path ? cache.get(path)?.url ?? null : null)
  useEffect(() => {
    if (!path) { setUrl(null); return }
    const c = cache.get(path)
    if (c && c.ate > Date.now()) { setUrl(c.url); return }
    let vivo = true
    supabase.storage.from('mro').createSignedUrl(path, 3600).then(({ data }) => {
      if (!vivo || !data) return
      cache.set(path, { url: data.signedUrl, ate: Date.now() + 3000 * 1000 })
      setUrl(data.signedUrl)
    })
    return () => { vivo = false }
  }, [path])
  return url
}
