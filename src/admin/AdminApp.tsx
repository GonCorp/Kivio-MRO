import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { Campo } from '../components'
import { traduz } from '../screens/Auth'
import Visao from './Visao'
import Contatos from './Contatos'
import Regioes from './Regioes'
import Planos from './Planos'
import Automacoes from './Automacoes'
import Precos from './Precos'
import { Ingressos, Calendario } from './Fase3'

export type Pagina = 'visao' | 'contatos' | 'regioes' | 'planos' | 'automacoes' | 'precos' | 'ingressos' | 'calendario'

interface AdmCtx { avisar: (t: string, erro?: boolean) => void; ir: (p: Pagina, filtro?: string) => void; filtro: string }
const C = createContext<AdmCtx>({ avisar: () => {}, ir: () => {}, filtro: '' })
export const useAdm = () => useContext(C)

const MENU: { id: Pagina; nome: string; fase3?: boolean }[] = [
  { id: 'visao', nome: 'Visão do app' },
  { id: 'contatos', nome: 'Repúblicas' },
  { id: 'regioes', nome: 'Regiões e avisos' },
  { id: 'planos', nome: 'Planos' },
  { id: 'automacoes', nome: 'Automações' },
  { id: 'precos', nome: 'Base de preços' },
  { id: 'ingressos', nome: 'Ingressos', fase3: true },
  { id: 'calendario', nome: 'Calendário geral', fase3: true },
]

export default function AdminApp() {
  const [session, setSession] = useState<Session | null>(null)
  const [pronto, setPronto] = useState(false)
  const [ehAdmin, setEhAdmin] = useState<boolean | null>(null)
  const [pagina, setPagina] = useState<Pagina>('visao')
  const [filtro, setFiltro] = useState('')
  const [toast, setToast] = useState<{ t: string; erro: boolean } | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const timer = useRef<number>()

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setPronto(true) })
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  const uid = session?.user.id
  useEffect(() => {
    if (!uid) { setEhAdmin(null); return }
    supabase.from('profiles').select('is_super_admin').eq('id', uid).single().then(async ({ data }) => {
      if (data?.is_super_admin) { setEhAdmin(true); return }
      // conta comum: não deve ficar logada aqui
      await supabase.auth.signOut()
      setAviso('Acesso restrito. Esta conta não é do administrador.')
      setEhAdmin(null)
    })
  }, [uid])

  const avisar = useCallback((t: string, erro = false) => {
    setToast({ t, erro })
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setToast(null), erro ? 5000 : 2500)
  }, [])
  const ir = useCallback((p: Pagina, f = '') => { setFiltro(f); setPagina(p); window.scrollTo(0, 0) }, [])

  if (!pronto) return <main className="centro"><p className="muted">Carregando…</p></main>
  if (!session || !ehAdmin) {
    return uid && ehAdmin === null && !aviso
      ? <main className="centro"><p className="muted">Verificando acesso…</p></main>
      : <Login aviso={aviso} limpar={() => setAviso(null)} />
  }

  return (
    <C.Provider value={{ avisar, ir, filtro }}>
      <div className="adm">
        <header className="adm-topo">
          <div className="in">
            <div className="grow"><b>Kivio Digital · Painel</b><div className="sub">Área exclusiva do administrador</div></div>
            <button className="btn mini" onClick={() => supabase.auth.signOut()}>Sair</button>
          </div>
        </header>
        <nav className="adm-nav" aria-label="Menu do painel">
          <div className="in">
            {MENU.map((m) => (
              <button key={m.id} className={m.fase3 ? 'fase3' : ''} aria-current={pagina === m.id ? 'page' : undefined} onClick={() => ir(m.id)}>{m.nome}</button>
            ))}
          </div>
        </nav>
        <main className="adm-main">
          {pagina === 'visao' && <Visao />}
          {pagina === 'contatos' && <Contatos />}
          {pagina === 'regioes' && <Regioes />}
          {pagina === 'planos' && <Planos />}
          {pagina === 'automacoes' && <Automacoes />}
          {pagina === 'precos' && <Precos />}
          {pagina === 'ingressos' && <Ingressos />}
          {pagina === 'calendario' && <Calendario />}
        </main>
      </div>
      {toast && <div className={'toast' + (toast.erro ? ' erro' : '')} role="status">{toast.t}</div>}
    </C.Provider>
  )
}

function Login({ aviso, limpar }: { aviso: string | null; limpar: () => void }) {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  async function entrar(e: React.FormEvent) {
    e.preventDefault()
    setErro(null); limpar(); setOcupado(true)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha })
    if (error) setErro(traduz(error.message))
    setOcupado(false)
  }

  return (
    <main className="centro">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcSet="/kivio-logo-app-escuro.svg" />
        <img className="logo" src="/kivio-logo-app-claro.svg" alt="Kivio Digital" />
      </picture>
      <div className="pilha" style={{ width: '100%' }}>
        <div style={{ textAlign: 'center' }}>
          <h1>Painel Kivio</h1>
          <p className="muted">Área exclusiva do administrador.</p>
        </div>
        <form className="pilha" onSubmit={entrar}>
          <Campo rotulo="E-mail"><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required /></Campo>
          <Campo rotulo="Senha"><input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="current-password" required /></Campo>
          {(erro || aviso) && <p className="chip ruim" style={{ whiteSpace: 'normal', borderRadius: 12, padding: '10px 12px' }}>{erro || aviso}</p>}
          <button className="btn primario cheio" disabled={ocupado}>{ocupado ? 'Aguarde…' : 'Entrar'}</button>
        </form>
      </div>
    </main>
  )
}
