import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../lib/contexto'
import TrocarSenha from '../TrocarSenha'
import { aplicar, CORES_PRONTAS, corPessoal, salvarCorPessoal, salvarTema, temaSalvo, type Tema } from '../tema'

export default function Personalizar() {
  const app = useApp()
  const rep = app.republica!
  const lider = app.membro?.papel === 'lider'
  const [tema, setTema] = useState<Tema>(temaSalvo())
  const [cor, setCor] = useState<string | null>(lider ? rep.cor : corPessoal() || rep.cor)
  const [nome, setNome] = useState(rep.nome)
  const [senha, setSenha] = useState(false)

  function escolherTema(t: Tema) { setTema(t); salvarTema(t) }
  async function escolherCor(c: string | null) {
    setCor(c)
    if (lider) {
      const { error } = await supabase.rpc('atualizar_republica', { p_rep: rep.id, p_nome: rep.nome, p_cor: c })
      if (error) return app.avisar(error.message, true)
      await app.recarregar(); aplicar(c); app.avisar('Cor da república salva.')
    } else { salvarCorPessoal(c); aplicar(c) }
  }
  async function salvarNome() {
    const { error } = await supabase.rpc('atualizar_republica', { p_rep: rep.id, p_nome: nome, p_cor: rep.cor })
    if (error) return app.avisar(error.message, true)
    await app.recarregar(); app.avisar('Nome salvo.')
  }
  const letra = (rep.nome || 'R').trim().charAt(0).toUpperCase()

  return (
    <div className="cartoes" style={{ alignItems: 'flex-start' }}>
      <div className="pilha" style={{ flex: '1 1 340px' }}>
        <div className="bloco">
          <h2>Tema</h2>
          <span className="small muted">Vale só para este aparelho. “Automático” segue o celular ou o computador.</span>
          <div className="linha quebra">{([['auto', 'Automático'], ['claro', 'Claro'], ['escuro', 'Escuro']] as [Tema, string][]).map(([k, n]) => <button key={k} className={'btn' + (tema === k ? ' primario' : '')} style={{ minWidth: 120 }} onClick={() => escolherTema(k)}>{n}</button>)}</div>
        </div>
        <div className="bloco">
          <h2>{lider ? 'Cor da república' : 'Sua cor'}</h2>
          <span className="small muted">{lider ? 'Todos os integrantes veem esta cor, a menos que escolham a própria.' : 'Vale só para você. Sem escolher, o app usa a cor da república.'} Escolha uma cor pronta ou qualquer cor.</span>
          <div className="cores-sel" style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {CORES_PRONTAS.map(([n, c]) => <button key={c} aria-label={n} onClick={() => escolherCor(c)} style={{ width: 44, height: 44, borderRadius: '50%', background: c, border: `3px solid ${cor === c ? 'var(--texto)' : 'transparent'}` }} />)}
          </div>
          <div className="linha">
            <input type="color" style={{ width: 56, padding: 2 }} aria-label="Escolher outra cor" value={cor || '#14284b'} onChange={(e) => escolherCor(e.target.value)} />
            <span className="small muted">Outra cor: {cor || 'padrão do app'}</span>
            {cor && <button className="btn mini" onClick={() => escolherCor(null)}>Voltar ao padrão</button>}
          </div>
        </div>
        <div className="bloco">
          <h2>Segurança</h2>
          <button className="btn" onClick={() => setSenha(true)}>Trocar minha senha</button>
        </div>
      </div>

      <div className="bloco" style={{ flex: '1 1 340px' }}>
        <h2>Identidade da república</h2>
        <span className="small muted">O nome aparece para as outras repúblicas no calendário de festas.</span>
        <span className="small" style={{ fontWeight: 600 }}>Região: {rep.cidade}</span>
        <input value={nome} disabled={!lider} aria-label="Nome da república" style={{ fontWeight: 700 }} onChange={(e) => setNome(e.target.value)} />
        <div className="linha">
          <div style={{ width: 64, height: 64, borderRadius: 16, background: 'var(--acento)', color: 'var(--sobre-acento)', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 26 }}>{letra}</div>
          <span className="small muted">A foto da república chega em breve; por enquanto usamos a inicial do nome.</span>
        </div>
        {lider ? <button className="btn primario" disabled={nome.trim() === rep.nome} onClick={salvarNome}>Salvar nome</button> : <span className="small muted">Só o líder muda a identidade da república.</span>}
        <div className="card" style={{ background: 'var(--suave)' }}>
          <span className="small muted" style={{ fontWeight: 800, letterSpacing: '.04em' }}>ASSIM APARECE NO CALENDÁRIO DAS OUTRAS REPÚBLICAS</span>
          <div className="linha"><div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--acento)', color: 'var(--sobre-acento)', display: 'grid', placeItems: 'center', fontWeight: 800 }}>{letra}</div><b>{nome || 'Sua república'}</b></div>
        </div>
      </div>
      {senha && <TrocarSenha email={app.email} avisar={app.avisar} onFechar={() => setSenha(false)} />}
    </div>
  )
}
