export type Plano = 'gratis' | 'basico' | 'completo'
export type Situacao = 'gratis' | 'sem_vencimento' | 'atrasada' | 'vence_em_breve' | 'em_dia'

export interface RepAdmin {
  id: string
  nome: string
  cidade: string
  ativo: boolean
  plano: Plano
  integrantes: number
  lider_nome: string | null
  whatsapp_lider: string | null
  whatsapp_status: 'nao_verificado' | 'verificado'
  codigo_verificacao: string
  created_at: string
  situacao: Situacao
  vencimento: string | null
  valor_mensalidade: number | null
  nota_admin: string | null
  contatado: boolean
  limite_membros: number
}

export interface Resumo {
  republicas: number; ativas: number; bloqueadas: number; assinando: number; gratis: number
  integrantes: number; tarefas_ativas: number; faltas_mes: number; justificativas: number
  whatsapp_pendentes: number; atrasadas: number; vencendo: number; sem_vencimento: number
  interessadas: number; receita_prevista: number
  por_cidade: { cidade: string; ativa: boolean; republicas: number; integrantes: number }[]
}

export interface Atividade { created_at: string; republica: string | null; acao: string; detalhe: Record<string, unknown> | null }

export interface Interessada {
  id: string; republica: string; lider: string | null; telefone: string | null; email: string | null
  cidade: string | null; nota: string | null; contatado: boolean; convertida: boolean; created_at: string
}

export interface Aviso { id: string; cidade: string | null; texto: string; link: string | null; expira_em: string | null; created_at: string }

export interface PlanoCfg { id: Plano; nome: string; preco_mensal: number | null; limite_membros: number; descricao: string | null; recursos: string[] }

export interface Modelo { id: string; titulo: string; quando: string; texto: string; ativo: boolean }

export interface Fonte { id: string; cidade: string; nome: string; atualizado_em: string }
export interface Produto { id: string; cidade: string; nome: string; unidade: string | null; categoria: string }
export interface Preco { fonte_id: string; produto_id: string; valor: number }

export interface Cidade { nome: string; ativa: boolean }
