import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { configurado, supabase } from './lib/supabase'
import { Ctx, type Contexto } from './lib/contexto'
import type { Membro, Perfil, Republica } from './lib/tipos'
import { Icone } from './components'
import Auth from './screens/Auth'
import Onboarding from './screens/Onboarding'
import Bloqueado from './screens/Bloqueado'
import Inicio from './screens/Inicio'
import Escala from './screens/Escala'
import Multas from './screens/Multas'
import Casa from './screens/Casa'

type Aba = 'inicio' | 'escala' | 'multas' | 'casa'

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
  const [aba, setAba] = useState<Aba>('inicio')
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
    setAba('inicio')
  }, [])

  const ctx: Contexto | null = useMemo(() => {
    if (!dados || !uid) return null
    const ehLider = dados.membro?.papel === 'lider'
    return {
      userId: uid, ...dados,
      tem: (r: string) => dados.recursos.includes(r),
      ehLider,
      podeGerir: ehLider || Boolean(dados.membro?.funcoes.includes('multas')),
      recarregar, avisar, sair,
    }
  }, [dados, uid, recarregar, avisar, sair])

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
    const abas: { id: Aba; nome: string; icone: JSX.Element }[] = [
      { id: 'inicio', nome: 'Início', icone: Icone.inicio },
      ...(ctx.tem('escala') ? [{ id: 'escala' as Aba, nome: 'Escala', icone: Icone.escala }] : []),
      ...(ctx.tem('multas') && ctx.tem('escala') ? [{ id: 'multas' as Aba, nome: 'Multas', icone: Icone.multas }] : []),
      { id: 'casa', nome: 'Casa', icone: Icone.casa },
    ]
    // se o recurso da aba atual foi desligado, volta para o Início
    const atual: Aba = abas.some((a) => a.id === aba) ? aba : 'inicio'
    corpo = (
      <>
        <div className="app">
          <header className="topo">
            <div className="marca">{(ctx.republica?.nome || 'K').charAt(0).toUpperCase()}</div>
            <div className="tit">
              <b>{ctx.republica?.nome || 'Kivio Digital'}</b>
              <span className="muted small">no MRO</span>
            </div>
            <button className="btn mini" onClick={sair}>Sair</button>
          </header>
          {atual === 'inicio' && <Inicio ir={setAba} />}
          {atual === 'escala' && <Escala />}
          {atual === 'multas' && <Multas />}
          {atual === 'casa' && <Casa />}
        </div>
        <div className="abas">
          <nav aria-label="Menu">
            {abas.map((a) => (
              <button key={a.id} aria-current={atual === a.id ? 'page' : undefined} onClick={() => setAba(a.id)}>
                {a.icone}
                {a.nome}
              </button>
            ))}
          </nav>
        </div>
      </>
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
