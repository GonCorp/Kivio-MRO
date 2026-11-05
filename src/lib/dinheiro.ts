// "1.234,50" / "12,5" / "12.5" -> número (ou null se não for número válido)
export function lerValor(txt: string): number | null {
  const t = txt.trim().replace(/\s/g, '')
  if (!t) return null
  const n = Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t)
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null
}
