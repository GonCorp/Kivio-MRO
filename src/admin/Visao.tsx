import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAdm } from './AdminApp'
import type { Atividade, RepAdmin, Resumo } from './tipos'
import { ACOES, SITUACAO, dataBR, reais } from './util'

const BLOCOS = [
  { id: 'kpi', nome: 'Indicadores' },
  { id: 'precisa', nome: 'Precisa de você' },
  { id: 'situacao', nome: 'Situação das repúblicas' },
  { id: 'cidades', nome: 'Por região' },
  { id: 'atividade', nome: 'Atividade recente' },
]

function lerOcultos(): string[] {
  try { return JSON.parse(localStorage.getItem('kivio-blocos-ocultos') || '[]') } catch { return [] }
}

export default function Visao() {
  const { avisar, ir } = useAdm()
  const [r, setR] = useState<Resumo | null>(null)
  const [ativ, setAtiv] = useState<Atividade[]>([])
  const [reps, setReps] = useState<RepAdmin[]>([])
  const [ocultos, setOcultos] = useState<string[]>(lerOcultos)
  const [config, setConfig] = useState(false)

  useEffect(() => {
    ;(async () => {
      const [a, b, c] = await Promise.all([
        supabase.rpc('admin_resumo'), supabase.rpc('admin_atividade_recente', { p_limite: 20 }), supabase.rpc('admin_listar_republicas'),
      ])
      if (a.error) return avisar(a.error.message, true)
      setR(a.data as Resumo)
      setAtiv((b.data || []) as Atividade[])
      setReps((c.data || []) as RepAdmin[])
    })()
  }, [avisar])

  function alternar(id: string) {
    const novo = ocultos.includes(id) ? ocultos.filter((x) => x !== id) : [...ocultos, id]
    setOcultos(novo)
    try { localStorage.setItem('kivio-blocos-ocultos', JSON.stringify(novo)) } catch { /* ok */ }
  }
  const ver = (id: string) => !ocultos.includes(id)

  if (!r) return <p className="muted">Carregando…</p>

  const precisa: { n: number; txt: string; ruim?: boolean; ir: () => void }[] = [
    { n: r.whatsapp_pendentes, txt: 'WhatsApp para verificar', ir: () => ir('contatos', 'whatsapp') },
    { n: r.atrasadas, txt: 'mensalidades atrasadas', ruim: true, ir: () => ir('contatos', 'atrasada') },
    { n: r.vencendo, txt: 'vencem nos próximos 5 dias', ir: () => ir('contatos', 'vence_em_breve') },
    { n: r.sem_vencimento, txt: 'planos pagos sem vencimento definido', ir: () => ir('contatos', 'sem_vencimento') },
    { n: r.interessadas, txt: 'interessadas sem contato', ir: () => ir('contatos', 'interessadas') },
  ].filter((x) => x.n > 0)

  const cont = (s: string) => reps.filter((x) => x.situacao === s).length

  return (
    <>
      <div className="linha entre quebra">
        <h1>Visão do app</h1>
        <button className="btn mini" onClick={() => setConfig(!config)}>{config ? 'Fechar' : 'Mostrar/ocultar blocos'}</button>
      </div>
      {config && (
        <div className="card">
          {BLOCOS.map((b) => (
            <label key={b.id} className="linha"><input type="checkbox" checked={ver(b.id)} onChange={() => alternar(b.id)} />{b.nome}</label>
          ))}
          <span className="small muted">Fica salvo neste navegador.</span>
        </div>
      )}

      {ver('kpi') && (
        <div className="grade-auto">
          <div className="card kpi"><span className="muted small">Repúblicas</span><span className="num">{r.republicas}</span><span className="small muted">{r.ativas} ativas · {r.bloqueadas} bloqueadas</span></div>
          <div className="card kpi"><span className="muted small">Assinando</span><span className="num">{r.assinando}</span><span className="small muted">{r.gratis} no plano grátis</span></div>
          <div className="card kpi"><span className="muted small">Receita prevista/mês</span><span className="num">{reais(r.receita_prevista)}</span><span className="small muted">repúblicas ativas e pagas</span></div>
          <div className="card kpi"><span className="muted small">Integrantes</span><span className="num">{r.integrantes}</span><span className="small muted">usando o app</span></div>
        </div>
      )}

      {ver('precisa') && (
        <section className="pilha">
          <h2>Precisa de você</h2>
          {precisa.length === 0 ? <div className="card vazio">Tudo em dia por aqui.</div> : precisa.map((p) => (
            <button key={p.txt} className={'card alerta' + (p.ruim ? ' ruim' : '')} style={{ textAlign: 'left' }} onClick={p.ir}>
              <span><b>{p.n}</b> {p.txt}</span>
            </button>
          ))}
        </section>
      )}

      {ver('situacao') && (
        <section className="pilha">
          <h2>Situação das repúblicas</h2>
          <div className="grade-auto">
            {(['em_dia', 'vence_em_breve', 'atrasada', 'sem_vencimento', 'gratis'] as const).map((s) => (
              <button key={s} className="card kpi" style={{ textAlign: 'left' }} onClick={() => ir('contatos', s)}>
                <span className={'chip ' + SITUACAO[s].chip} style={{ alignSelf: 'flex-start' }}>{SITUACAO[s].nome}</span>
                <span className="num">{cont(s)}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {ver('cidades') && (
        <section className="pilha">
          <h2>Por região</h2>
          <div className="card">
            {r.por_cidade.length === 0 && <span className="muted">Nenhuma região ainda.</span>}
            {r.por_cidade.map((c) => (
              <div className="linha entre" key={c.cidade}>
                <span>{c.cidade} <span className={'chip ' + (c.ativa ? 'ok' : '')}>{c.ativa ? 'ativa' : 'desligada'}</span></span>
                <span className="small muted">{c.republicas} república(s) · {c.integrantes} integrante(s)</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {ver('atividade') && (
        <section className="pilha">
          <h2>Atividade recente</h2>
          <div className="card">
            {ativ.length === 0 && <span className="muted">Sem atividade ainda.</span>}
            {ativ.map((a, i) => (
              <div className="linha entre" key={i}>
                <span className="small"><b>{a.republica || 'App'}</b> {ACOES[a.acao] || a.acao.replace(/_/g, ' ')}</span>
                <span className="small muted">{dataBR(a.created_at)}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="card vazio small">Festas e ingressos aparecem aqui quando o módulo de festas chegar (Fase 3).</div>
    </>
  )
}
