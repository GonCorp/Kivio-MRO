import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { Campo } from '../components'

export default function Auth() {
  const [modo, setModo] = useState<'entrar' | 'criar'>('entrar')
  const [nome, setNome] = useState('')
  const [whats, setWhats] = useState('')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [msg, setMsg] = useState<{ t: string; erro: boolean } | null>(null)
  const [ocupado, setOcupado] = useState(false)

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    setMsg(null)
    setOcupado(true)
    try {
      if (modo === 'entrar') {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha })
        if (error) throw error
      } else {
        if (nome.trim().length < 2) throw new Error('Informe seu nome.')
        if (senha.length < 8) throw new Error('A senha precisa ter pelo menos 8 caracteres.')
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password: senha,
          options: { data: { nome: nome.trim(), whatsapp: whats.replace(/\D/g, '') } },
        })
        if (error) throw error
        if (!data.session) {
          setMsg({ t: 'Conta criada! Confirme o e-mail que enviamos e depois entre aqui.', erro: false })
          setModo('entrar')
        }
      }
    } catch (err) {
      setMsg({ t: traduz((err as Error).message), erro: true })
    } finally {
      setOcupado(false)
    }
  }

  return (
    <main className="centro">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcSet="/kivio-logo-app-escuro.svg" />
        <img className="logo" src="/kivio-logo-app-claro.svg" alt="Kivio Digital" />
      </picture>
      <div className="pilha" style={{ width: '100%' }}>
        <div style={{ textAlign: 'center' }}>
          <h1>MRO</h1>
          <p className="muted">Minha República em Ordem: todas as suas regras e rotinas de casa num lugar só. Mais organização e menos trabalho.</p>
        </div>
        <div className="seg" role="group" aria-label="Entrar ou criar conta">
          <button type="button" aria-pressed={modo === 'entrar'} onClick={() => setModo('entrar')}>Entrar</button>
          <button type="button" aria-pressed={modo === 'criar'} onClick={() => setModo('criar')}>Criar conta</button>
        </div>
        <form className="pilha" onSubmit={enviar}>
          {modo === 'criar' && (
            <>
              <Campo rotulo="Seu nome">
                <input value={nome} onChange={(e) => setNome(e.target.value)} autoComplete="name" required />
              </Campo>
              <Campo rotulo="Seu WhatsApp (com DDD)">
                <input value={whats} onChange={(e) => setWhats(e.target.value)} inputMode="tel" autoComplete="tel" placeholder="31 99999-0000" />
              </Campo>
            </>
          )}
          <Campo rotulo="E-mail">
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
          </Campo>
          <Campo rotulo="Senha">
            <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete={modo === 'entrar' ? 'current-password' : 'new-password'} required />
          </Campo>
          {msg && <p className={msg.erro ? 'chip ruim' : 'chip ok'} style={{ whiteSpace: 'normal', borderRadius: 12, padding: '10px 12px' }}>{msg.t}</p>}
          <button className="btn primario cheio" disabled={ocupado}>{ocupado ? 'Aguarde…' : modo === 'entrar' ? 'Entrar' : 'Criar conta'}</button>
        </form>
      </div>
    </main>
  )
}

export function traduz(m: string): string {
  if (/Invalid login credentials/i.test(m)) return 'E-mail ou senha incorretos.'
  if (/already registered|already been registered/i.test(m)) return 'Esse e-mail já tem conta. Use "Entrar".'
  if (/rate limit/i.test(m)) return 'Muitas tentativas. Espere alguns minutos e tente de novo.'
  if (/Email not confirmed/i.test(m)) return 'Confirme seu e-mail antes de entrar.'
  return m
}
