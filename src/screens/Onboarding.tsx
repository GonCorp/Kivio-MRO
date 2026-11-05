import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../lib/contexto'
import { Campo } from '../components'
import type { Cidade } from '../lib/tipos'

export default function Onboarding() {
  const app = useApp()
  const [modo, setModo] = useState<'criar' | 'entrar'>('entrar')
  const [cidades, setCidades] = useState<Cidade[]>([])
  const [nome, setNome] = useState('')
  const [cidade, setCidade] = useState('')
  const [whats, setWhats] = useState(app.perfil.whatsapp || '')
  const [codigo, setCodigo] = useState('')
  const [ocupado, setOcupado] = useState(false)

  useEffect(() => {
    supabase.from('cidades').select('*').order('nome').then(({ data }) => {
      const lista = (data || []) as Cidade[]
      setCidades(lista)
      const ativa = lista.find((c) => c.ativa)
      if (ativa) setCidade(ativa.nome)
    })
  }, [])

  async function criar(e: React.FormEvent) {
    e.preventDefault()
    setOcupado(true)
    const { error } = await supabase.rpc('criar_republica', { p_nome: nome, p_cidade: cidade, p_whatsapp: whats.replace(/\D/g, '') })
    setOcupado(false)
    if (error) return app.avisar(error.message, true)
    app.avisar('República criada!')
    await app.recarregar()
  }

  async function entrar(e: React.FormEvent) {
    e.preventDefault()
    setOcupado(true)
    const { error } = await supabase.rpc('entrar_republica', { p_codigo: codigo })
    setOcupado(false)
    if (error) return app.avisar(error.message, true)
    app.avisar('Você entrou na república!')
    await app.recarregar()
  }

  return (
    <main className="centro">
      <div className="pilha" style={{ width: '100%' }}>
        <div>
          <h1>Olá, {app.perfil.nome.split(' ')[0] || 'bem-vindo'}!</h1>
          <p className="muted">Você ainda não está em nenhuma república. Entre com um código de convite ou crie a sua.</p>
        </div>
        <div className="seg" role="group" aria-label="Escolha">
          <button type="button" aria-pressed={modo === 'entrar'} onClick={() => setModo('entrar')}>Tenho um código</button>
          <button type="button" aria-pressed={modo === 'criar'} onClick={() => setModo('criar')}>Criar república</button>
        </div>
        {modo === 'entrar' ? (
          <form className="pilha" onSubmit={entrar}>
            <Campo rotulo="Código de convite (6 caracteres)">
              <input value={codigo} onChange={(e) => setCodigo(e.target.value.toUpperCase())} maxLength={6} autoCapitalize="characters" required style={{ textAlign: 'center', letterSpacing: '0.2em', fontWeight: 800, fontSize: 20 }} />
            </Campo>
            <p className="muted small">O código está no menu "Casa" do líder da sua república.</p>
            <button className="btn primario cheio" disabled={ocupado || codigo.length < 6}>Entrar na república</button>
          </form>
        ) : (
          <form className="pilha" onSubmit={criar}>
            <Campo rotulo="Nome da república">
              <input value={nome} onChange={(e) => setNome(e.target.value)} required minLength={2} />
            </Campo>
            <Campo rotulo="Cidade">
              <select value={cidade} onChange={(e) => setCidade(e.target.value)}>
                {cidades.map((c) => (
                  <option key={c.nome} value={c.nome} disabled={!c.ativa}>{c.nome}{c.ativa ? '' : ' (em breve)'}</option>
                ))}
              </select>
            </Campo>
            <Campo rotulo="WhatsApp do líder (com DDD)">
              <input value={whats} onChange={(e) => setWhats(e.target.value)} inputMode="tel" required />
            </Campo>
            <p className="muted small">Você será o líder. Plano grátis: até 7 integrantes.</p>
            <button className="btn primario cheio" disabled={ocupado}>Criar república</button>
          </form>
        )}
        <button className="btn" onClick={app.sair}>Sair da conta</button>
      </div>
    </main>
  )
}
