import { createContext, useContext } from 'react'
import type { Membro, Perfil, Republica } from './tipos'

export interface Contexto {
  userId: string
  email: string
  perfil: Perfil
  membro: Membro | null
  republica: Republica | null
  membros: Membro[]
  nomes: Record<string, string> // user_id -> nome
  podeGerir: boolean // líder ou função "multas"
  ehLider: boolean
  recursos: string[] // o que o plano (ou você, via painel) liberou para esta república
  tem: (recurso: string) => boolean
  recarregar: () => Promise<void>
  avisar: (texto: string, erro?: boolean) => void
  sair: () => Promise<void>
}

export const Ctx = createContext<Contexto | null>(null)

export function useApp(): Contexto {
  const c = useContext(Ctx)
  if (!c) throw new Error('Contexto ausente')
  return c
}

// Nome do integrante a partir do id do vínculo (membros.id)
export function nomeDoMembro(c: Contexto, membroId: string): string {
  const m = c.membros.find((x) => x.id === membroId)
  return (m && c.nomes[m.user_id]) || 'Integrante'
}
