// Tema (claro/escuro/automático) e cor do app. Preferências pessoais ficam neste aparelho;
// a cor da república vem do banco e vale para todo mundo, a menos que a pessoa escolha a sua.
export type Tema = 'auto' | 'claro' | 'escuro'
const K_TEMA = 'mro-tema'
const K_COR = 'mro-cor'

const ler = (k: string) => { try { return localStorage.getItem(k) } catch { return null } }
const gravar = (k: string, v: string | null) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v) } catch { /* sem armazenamento */ } }

export const temaSalvo = (): Tema => { const t = ler(K_TEMA); return t === 'claro' || t === 'escuro' ? t : 'auto' }
export const corPessoal = (): string | null => { const c = ler(K_COR); return c && /^#[0-9a-fA-F]{6}$/.test(c) ? c : null }
export const salvarTema = (t: Tema) => { gravar(K_TEMA, t === 'auto' ? null : t); aplicar() }
export const salvarCorPessoal = (c: string | null) => gravar(K_COR, c)

function contraste(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.45 ? '#0b1326' : '#ffffff'
}

let corRep: string | null = null
export function aplicar(corDaRepublica?: string | null) {
  if (corDaRepublica !== undefined) corRep = corDaRepublica
  const raiz = document.documentElement
  const t = temaSalvo()
  if (t === 'auto') raiz.removeAttribute('data-tema'); else raiz.setAttribute('data-tema', t)
  const cor = corPessoal() || corRep
  if (cor) { raiz.style.setProperty('--acento', cor); raiz.style.setProperty('--sobre-acento', contraste(cor)) }
  else { raiz.style.removeProperty('--acento'); raiz.style.removeProperty('--sobre-acento') }
}
export const CORES_PRONTAS: [string, string][] = [['Azul', '#3b82f6'], ['Verde', '#22c55e'], ['Laranja', '#f59e0b'], ['Vermelho', '#ef4444'], ['Roxo', '#8b5cf6'], ['Rosa', '#ec4899'], ['Turquesa', '#14b8a6'], ['Marinho', '#14284b']]
