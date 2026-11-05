import type { Situacao } from './tipos'

export const SITUACAO: Record<Situacao, { nome: string; chip: string }> = {
  demo: { nome: 'Demonstração', chip: '' },
  gratis: { nome: 'Grátis', chip: '' },
  sem_vencimento: { nome: 'Sem vencimento', chip: 'aviso' },
  atrasada: { nome: 'Atrasada', chip: 'ruim' },
  vence_em_breve: { nome: 'Vence em breve', chip: 'aviso' },
  em_dia: { nome: 'Em dia', chip: 'ok' },
}

export const APP_URL = 'https://kivio-mro.goncorp-grupo.workers.dev'

export const NOME_PLANO: Record<string, string> = { gratis: 'Grátis', basico: 'Básico', completo: 'Completo' }

// "pronto" = já existe no app. Os outros podem ser marcados, mas só passam a funcionar quando forem construídos.
export const RECURSOS: { id: string; nome: string; pronto: boolean }[] = [
  { id: 'escala', nome: 'Escala de tarefas', pronto: true },
  { id: 'multas', nome: 'Missões e multas (depende da escala)', pronto: true },
  { id: 'financas', nome: 'Finanças da casa', pronto: true },
  { id: 'relatorios', nome: 'Relatórios', pronto: false },
  { id: 'calendario_ver', nome: 'Consultar calendário de festas', pronto: true },
  { id: 'calendario', nome: 'Calendário de festas (marcar festa)', pronto: true },
  { id: 'ingressos', nome: 'Ingressos e portaria', pronto: false },
  { id: 'orcamento_festa', nome: 'Orçamento para festas', pronto: false },
]

export const ACOES: Record<string, string> = {
  republica_criada: 'criou a república', integrante_entrou: 'entrou na república', integrante_saiu: 'saiu da república',
  integrante_removido: 'foi removido', lideranca_transferida: 'passou a liderança', convite_renovado: 'renovou o convite',
  multas_configuradas: 'configurou as multas', plano_alterado: 'teve o plano alterado', tarefa_criada: 'criou tarefa',
  whatsapp_verificacao: 'teve o WhatsApp avaliado', acesso_liberado: 'foi liberada', acesso_bloqueado: 'foi bloqueada',
  justificativa_enviada: 'recebeu uma justificativa', tarefa_desmarcada: 'desmarcou uma tarefa', tarefa_encerrada: 'encerrou tarefa',
  tarefa_feita: 'marcou tarefa como feita', recurso_alterado: 'teve um recurso alterado', limite_alterado: 'teve o limite de integrantes alterado', pagamento_registrado: 'teve pagamento registrado',
}

export const reais = (v: number | null | undefined) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export function dataBR(d: string | null | undefined): string {
  if (!d) return '—'
  const s = d.slice(0, 10)
  return s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4)
}

export function hojeISO(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
}

export function diasDesde(d: string): number {
  return Math.floor((Date.parse(hojeISO()) - Date.parse(d.slice(0, 10))) / 86400000)
}

export function waLink(tel: string | null | undefined, texto: string): string | null {
  const d = (tel || '').replace(/\D/g, '')
  if (d.length < 10) return null
  const n = d.length > 11 && d.startsWith('55') ? d : '55' + d
  return 'https://wa.me/' + n + '?text=' + encodeURIComponent(texto)
}

export function preencher(texto: string, v: Record<string, string>): string {
  return texto.replace(/\{(\w+)\}/g, (m, k) => (k in v ? v[k] : m))
}
