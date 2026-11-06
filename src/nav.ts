import type { Contexto } from './lib/contexto'

export type Vista = string

export interface ItemNav { id: Vista; nome: string; icone: string; aviso?: string }
export interface GrupoNav { nome: string; itens: ItemNav[] }

// Telas já construídas no formato do protótipo (as outras ainda não aparecem no menu)
export const PRONTAS = new Set<string>([
  'painel', 'relat', 'escala', 'mis', 'membros', 'fin', 'cal', 'tickets', 'portaria', 'festa',
  'pint', 'minhas', 'cobr', 'ingr',
])

export const TITULOS: Record<string, [string, string]> = {
  painel: ['Painel geral', 'Visão rápida da república neste mês'],
  cal: ['Calendário de festas', 'Veja o pedido de espaçamento de cada república antes de marcar'],
  fin: ['Finanças', 'Cobranças, gastos por categoria e saldo de cada conta'],
  mis: ['Missões e multas', 'Quem fez, quem deixou de fazer e o que o líder precisa decidir'],
  regras: ['Regras da república', 'Multas, missões, fotos, justificativas e pedido de espaçamento'],
  festa: ['Orçamento da festa', 'Itens, categorias e tags, do jeito que a república quiser'],
  perso: ['Personalizar', 'Tema, cores, nome e blocos do painel'],
  membros: ['Integrantes', 'Cadastre quem mora na república, o WhatsApp e quem já saiu'],
  escala: ['Escala da casa', 'Quem faz o quê em cada dia da semana'],
  relat: ['Relatórios', 'Números prontos para a reunião mensal'],
  minhas: ['Minhas missões', 'O que vale hoje, o que vem aí e o que já passou'],
  cobr: ['Minhas cobranças', 'O que você deve à casa: mensalidades, caixinha e multas'],
  regrasler: ['Regras da república', 'As regras definidas pelo líder, só para você consultar'],
  tickets: ['Ingressos', 'Preço, Pix e quem já pediu ingresso da sua festa'],
  ingr: ['Meus ingressos', 'Pague pelo Pix e receba o ingresso aqui'],
  portaria: ['Portaria', 'Confira quem entra na festa e registre a entrada'],
  perfil: ['Personalizar', 'Sua foto, sua cor e o tema do app'],
  pint: ['Painel geral', 'Como você está na casa: missões, multas e cobranças'],
}

const FUNCOES_MENU: { f: string; id: Vista; nome: string; icone: string; rec: string }[] = [
  { f: 'financeiro', id: 'fin', nome: 'Finanças da casa', icone: 'dollar', rec: 'financas' },
  { f: 'multas', id: 'mis', nome: 'Missões e multas', icone: 'check', rec: 'multas' },
  { f: 'ingressos', id: 'tickets', nome: 'Ingressos', icone: 'music', rec: 'ingressos' },
  { f: 'portaria', id: 'portaria', nome: 'Portaria', icone: 'check', rec: 'ingressos' },
]

export function montarNav(app: Contexto): GrupoNav[] {
  const t = app.tem
  const cal = t('calendario') || t('calendario_ver')
  const g: GrupoNav[] = []
  if (app.ehLider) {
    g.push({ nome: 'INÍCIO', itens: [{ id: 'painel', nome: 'Painel geral', icone: 'grid' }, ...(t('relatorios') ? [{ id: 'relat', nome: 'Relatórios', icone: 'file' }] : [])] })
    g.push({ nome: 'CASA', itens: [
      ...(t('escala') ? [{ id: 'escala', nome: 'Escala da casa', icone: 'clock' }] : []),
      ...(t('escala') && t('multas') ? [{ id: 'mis', nome: 'Missões e multas', icone: 'check' }] : []),
      { id: 'membros', nome: 'Integrantes', icone: 'users' },
    ] })
    if (t('financas')) g.push({ nome: 'FINANÇAS', itens: [{ id: 'fin', nome: 'Finanças', icone: 'dollar' }] })
    g.push({ nome: 'FESTAS', itens: [
      ...(cal ? [{ id: 'cal', nome: 'Calendário de festas', icone: 'cal' }] : []),
      ...(t('ingressos') ? [{ id: 'tickets', nome: 'Ingressos', icone: 'music' }, { id: 'portaria', nome: 'Portaria', icone: 'check' }] : []),
      { id: 'festa', nome: 'Orçamento da festa', icone: 'clip', aviso: 'em breve' },
    ] })
    g.push({ nome: 'CONFIGURAR', itens: [
      ...(t('escala') ? [{ id: 'regras', nome: 'Regras da república', icone: 'shield' }] : []),
      { id: 'perso', nome: 'Personalizar', icone: 'sliders' },
    ] })
  } else {
    g.push({ nome: 'INÍCIO', itens: [{ id: 'pint', nome: 'Painel geral', icone: 'grid' }] })
    const minha: ItemNav[] = []
    if (t('escala')) minha.push({ id: 'minhas', nome: 'Minhas missões', icone: 'check' })
    if (t('financas')) minha.push({ id: 'cobr', nome: 'Minhas cobranças', icone: 'dollar' })
    if (minha.length) g.push({ nome: 'MINHA ÁREA', itens: minha })
    const festas: ItemNav[] = []
    if (cal) festas.push({ id: 'cal', nome: 'Calendário de festas', icone: 'cal' })
    if (t('ingressos')) festas.push({ id: 'ingr', nome: 'Meus ingressos', icone: 'music' })
    if (festas.length) g.push({ nome: 'FESTAS', itens: festas })
    const rec = FUNCOES_MENU.filter((x) => app.funcao(x.f) && t(x.rec) && (x.id !== 'mis' || t('escala')))
    if (rec.length) g.push({ nome: 'FUNÇÕES QUE VOCÊ RECEBEU', itens: rec.map((x) => ({ id: x.id, nome: x.nome, icone: x.icone })) })
    g.push({ nome: 'MEU PERFIL', itens: [{ id: 'perfil', nome: 'Personalizar', icone: 'sliders' }] })
    if (t('escala')) g.push({ nome: 'REGRAS', itens: [{ id: 'regrasler', nome: 'Regras da república', icone: 'shield' }] })
  }
  return g.map((x) => ({ ...x, itens: x.itens.filter((i) => PRONTAS.has(i.id)) })).filter((x) => x.itens.length)
}

export const primeiraVista = (app: Contexto): Vista => (app.ehLider ? 'painel' : 'pint')
