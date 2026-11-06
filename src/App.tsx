import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { configurado, supabase } from './lib/supabase'
import { Ctx, type Contexto } from './lib/contexto'
import type { Membro, Perfil, Republica } from './lib/tipos'
import { Ico } from './components'
import { montarNav, primeiraVista, TITULOS, type Vista } from './nav'
import Auth from './screens/Auth'
import Onboarding from './screens/Onboarding'
import Bloqueado from './screens/Bloqueado'
import Inicio from './screens/Inicio'
import Escala from './screens/Escala'
import Multas from './screens/Multas'
import Casa from './screens/Casa'
import Financas from './screens/Financas'
import { Calendario } from './screens/Festas'
import Ingressos, { Portaria } from './screens/Ingressos'
import Relatorios from './screens/Relatorios'
import Painel from './screens/Painel'
import EmConstrucao from './screens/EmConstrucao'

interface Dados {
  perfil: Perfil
  membro: Membro | null
  republica: Republica | null
  membros: Membro[]
  nomes: Record<string, string>
  recursos: string[]
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [pronto, setPronto] = useState(false)
  const [dados, setDados] = useState<Dados | null>(null)
  const [vista, setVista] = useState<Vista>('')
  const [intencao, setIntencao] = useState('')
  const [menuAberto, setMenuAberto] = useState(false)
  const [fechados, setFechados] = useState<Record<string, boolean>>({})
  const [toast, setToast] = useState<{ t: string; erro: boolean } | null>(null)
  const timer = useRef<number>()

  useEffect(() => {
    if (!configurado) { setPronto(true); return }
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setPronto(true) })
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  const avisar = useCallback((t: string, erro = false) => {
    setToast({ t, erro })
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setToast(null), erro ? 5000 : 2500)
  }, [])

  const uid = session?.user.id

  const recarregar = useCallback(async () => {
    if (!uid) { setDados(null); return }
    const { data: p } = await supabase.from('profiles').select('*').eq('id', uid).single()
    if (!p) return
    const { data: meu } = await supabase.from('membros').select('*').eq('user_id', uid).eq('ativo', true).maybeSingle()
    let republica: Republica | null = null
    let membros: Membro[] = []
    let nomes: Record<string, string> = {}
    let recursos: string[] = []
    if (meu) {
      const { data: r } = await supabase.from('republicas').select('*').eq('id', meu.republica_id).single()
      republica = (r as Republica) || null
      if (republica?.ativo) {
        const [ms, ps, rc] = await Promise.all([
          supabase.from('membros').select('*').eq('republica_id', meu.republica_id).eq('ativo', true),
          supabase.from('profiles').select('id,nome'),
          supabase.rpc('recursos_da_republica', { p_rep: meu.republica_id }),
        ])
        recursos = (rc.data || []) as string[]
        membros = (ms.data || []) as Membro[]
        nomes = Object.fromEntries(((ps.data || []) as { id: string; nome: string }[]).map((x) => [x.id, x.nome]))
      }
    }
    setDados({ perfil: p as Perfil, membro: (meu as Membro) || null, republica, membros, nomes, recursos })
  }, [uid])

  useEffect(() => { recarregar() }, [recarregar])

  // Quando o administrador muda o plano ou liga/desliga um recurso, o app reflete ao voltar para ele
  useEffect(() => {
    const f = () => { if (document.visibilityState === 'visible') recarregar() }
    document.addEventListener('visibilitychange', f)
    return () => document.removeEventListener('visibilitychange', f)
  }, [recarregar])

  useEffect(() => {
    if ('serviceWorker' in navigator && import.meta.env.PROD) navigator.serviceWorker.register('/sw.js').catch(() => {})
  }, [])

  const sair = useCallback(async () => {
    await supabase.auth.signOut()
    setDados(null)
    setVista('')
  }, [])

  const ctx: Contexto | null = useMemo(() => {
    if (!dados || !uid) return null
    const ehLider = dados.membro?.papel === 'lider'
    return {
      userId: uid, email: session?.user.email || '', ...dados,
      tem: (r: string) => dados.recursos.includes(r),
      funcao: (f: string) => ehLider || Boolean(dados.membro?.funcoes.includes(f as never)),
      ehLider,
      podeGerir: ehLider || Boolean(dados.membro?.funcoes.includes('multas')),
      recarregar, avisar, sair,
    }
  }, [dados, uid, session, recarregar, avisar, sair])

  if (!configurado) {
    return (
      <main className="centro">
        <div className="card">
          <h2>Falta ligar o banco de dados</h2>
          <p>Cadastre <code>VITE_SUPABASE_URL</code> e <code>VITE_SUPABASE_ANON_KEY</code> nas variáveis de ambiente e publique de novo.</p>
        </div>
      </main>
    )
  }
  if (!pronto) return <main className="centro"><p className="muted">Carregando…</p></main>
  if (!session) return <Auth />
  if (!ctx) return <main className="centro"><p className="muted">Carregando…</p></main>

  const saida = toast && <div className={'toast' + (toast.erro ? ' erro' : '')} role="status">{toast.t}</div>

  let corpo
  if (!ctx.membro) corpo = ctx.perfil.is_super_admin ? <SoAdmin sair={sair} /> : <Onboarding />
  else if (ctx.republica && !ctx.republica.ativo) corpo = <Bloqueado />
  else {
    const grupos = montarNav(ctx)
    const todas = grupos.flatMap((g) => g.itens.map((i) => i.id))
    const primeira = primeiraVista(ctx)
    const atual: Vista = todas.includes(vista) ? vista : todas.includes(primeira) ? primeira : todas[0]
    const ir = (v: Vista, i = '') => { setVista(v); setIntencao(i); setMenuAberto(false); window.scrollTo(0, 0) }
    const [titulo, sub] = TITULOS[atual] || ['', '']
    const mapaAntigo: Record<string, Vista> = { inicio: 'pint', escala: 'minhas', multas: 'mis', financas: 'cobr', casa: 'membros', festas: 'cal' }
    corpo = (
      <div className="shell">
        <aside className={'lado' + (menuAberto ? ' aberto' : '')}>
          <div className="rep">
            <div className="marca">{(ctx.republica?.nome || 'K').charAt(0).toUpperCase()}</div>
            <div style={{ minWidth: 0 }}><b>{ctx.republica?.nome || 'Kivio Digital'}</b><span className="muted small">no MRO</span></div>
          </div>
          <nav aria-label="Menu">
            {grupos.map((g) => (
              <div key={g.nome} style={{ display: 'contents' }}>
                <button className="grupo" aria-label={(fechados[g.nome] ? 'Abrir ' : 'Recolher ') + g.nome} onClick={() => setFechados({ ...fechados, [g.nome]: !fechados[g.nome] })}>
                  {g.nome}<span style={{ width: 16, height: 16, display: 'inline-flex' }}><Ico nome={fechados[g.nome] ? 'right' : 'down'} /></span>
                </button>
                {!fechados[g.nome] && g.itens.map((i) => (
                  <button key={i.id} className="item" aria-current={atual === i.id ? 'page' : undefined} onClick={() => ir(i.id)}>
                    <Ico nome={i.icone} />{i.nome}{i.aviso && <span className="chip" style={{ marginLeft: 'auto' }}>{i.aviso}</span>}
                  </button>
                ))}
              </div>
            ))}
          </nav>
          <div className="rodape"><button className="btn" onClick={sair}>Sair</button></div>
        </aside>
        <main className="principal">
          <header className="cab">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button className="btn mini menu-btn" aria-label="Abrir menu" onClick={() => setMenuAberto(!menuAberto)}><span style={{ width: 20, height: 20, display: 'inline-flex' }}><Ico nome="menu" /></span></button>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}><h1>{titulo}</h1><span className="muted small">{sub}</span></div>
            </div>
            <span className="pilula">{ctx.republica?.nome} · {ctx.republica?.cidade}</span>
          </header>
          {atual === 'painel' && <Painel ir={ir} />}
          {atual === 'pint' && <Inicio ir={(a) => ir(mapaAntigo[a] || 'pint')} />}
          {atual === 'relat' && <Relatorios />}
          {(atual === 'escala' || atual === 'minhas') && <Escala />}
          {atual === 'mis' && <Multas />}
          {atual === 'membros' && <Casa />}
          {(atual === 'fin' || atual === 'cobr') && <Financas intencao={intencao} />}
          {atual === 'cal' && <Calendario />}
          {(atual === 'tickets' || atual === 'ingr') && <Ingressos />}
          {atual === 'portaria' && <Portaria />}
          {atual === 'festa' && <EmConstrucao />}
        </main>
      </div>
    )
  }

  return (
    <Ctx.Provider value={ctx}>
      {corpo}
      {saida}
    </Ctx.Provider>
  )
}

// Conta do administrador que não pertence a nenhuma república: o painel fica em outro endereço.
function SoAdmin({ sair }: { sair: () => void }) {
  return (
    <main className="centro">
      <div className="card">
        <h2>Esta é a conta de administrador</h2>
        <p>O painel do administrador fica em um endereço separado, exclusivo. Aqui é o app das repúblicas.</p>
        <p className="muted small">Para testar o app como cliente, saia e entre com outra conta (ou crie uma república de teste).</p>
        <button className="btn primario" onClick={sair}>Sair</button>
      </div>
    </main>
  )
}
