export type Funcao = 'financeiro' | 'multas' | 'ingressos' | 'portaria'

export const FUNCOES: { id: Funcao; nome: string; desc: string }[] = [
  { id: 'multas', nome: 'Escala e multas', desc: 'Cria tarefas, decide justificativas e define as multas.' },
  { id: 'financeiro', nome: 'Financeiro', desc: 'Cobranças e contas (chega na próxima fase).' },
  { id: 'ingressos', nome: 'Ingressos', desc: 'Confirma pagamentos de ingressos (fase de festas).' },
  { id: 'portaria', nome: 'Portaria', desc: 'Dá baixa nos ingressos na entrada (fase de festas).' },
]

export interface Perfil {
  id: string
  nome: string
  whatsapp: string | null
  is_super_admin: boolean
}

export interface Republica {
  id: string
  nome: string
  cidade: string
  ativo: boolean
  plano: 'gratis' | 'basico' | 'completo'
  limite_membros: number
  codigo_convite: string
  whatsapp_lider: string | null
  whatsapp_status: 'nao_verificado' | 'verificado'
  codigo_verificacao: string
  teto_multa: number | null
  espacamento_dias: number
}

export interface Membro {
  id: string
  republica_id: string
  user_id: string
  papel: 'lider' | 'integrante'
  funcoes: Funcao[]
  ativo: boolean
}

export interface Tarefa {
  id: string
  republica_id: string
  membro_id: string
  titulo: string
  descricao: string | null
  dia_semana: number
  inicio: string
  repeticao: 'semanal' | 'uma_vez' | 'n_vezes'
  vezes: number | null
  fim: string | null
}

export type StatusOc = 'pendente' | 'feita' | 'em_analise' | 'justificada' | 'falta'

export interface Ocorrencia {
  tarefa_id: string
  membro_id: string
  data: string
  status: StatusOc
  motivo: string | null
}

export interface Multa {
  membro_id: string
  tarefa_id: string
  data: string
  numero: number
  valor: number
}

export interface Faixa {
  faixa: number
  valor: number
}

export interface Cidade {
  nome: string
  ativa: boolean
}

export interface Conta { id: string; republica_id: string; nome: string; tipo: 'casa' | 'festa' | 'caixinha' | 'outro'; saldo_inicial: number }
export interface SaldoConta { conta_id: string; nome: string; tipo: Conta['tipo']; saldo_inicial: number; entradas: number; saidas: number; saldo: number; movimentos: number }
export interface Lancamento {
  id: string; conta_id: string; tipo: 'receita' | 'despesa'; valor: number; descricao: string
  categoria: string | null; data: string; origem: 'manual' | 'cobranca' | 'ingresso'
}
export interface Cobranca { id: string; titulo: string; valor: number; vencimento: string | null; conta_id: string | null; created_at: string }
export interface CobrancaItem { id: string; cobranca_id: string; membro_id: string; valor: number; pago: boolean; pago_em: string | null }
export interface MinhaCobranca { item_id: string; titulo: string; valor: number; vencimento: string | null; pago: boolean; pago_em: string | null }

export interface FestaCal { id: string; republica_id: string; republica: string; data: string; titulo: string; local: string | null; minha: boolean; espacamento_dias: number }
