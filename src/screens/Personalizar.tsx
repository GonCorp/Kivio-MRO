import { useRef, useState } from 'react'
import { Foto } from '../components'
import { enviarFoto } from '../lib/fotos'
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
  const inLogo = useRef<HTMLInputElement>(null)
  const inPerfil = useRef<HTMLInputElement>(null)
  const [env, setEnv] = useState(false)
  const meuNome = app.nomes[app.userId] || 'Eu'
  async function trocar(arq: File | undefined, tipo: 'logo' | 'perfil') {
    if (!arq) return
    setEnv(true)
    try {
      const path = await enviarFoto(rep.id, tipo, arq, tipo === 'logo' ? 512 : 400)
      const { error } = tipo === 'logo' ? await supabase.rpc('definir_logo', { p_rep: rep.id, p_path: path }) : await supabase.rpc('definir_foto_perfil', { p_rep: rep.id, p_path: path })
      if (error) throw new Error(error.message)
      await app.recarregar(); app.avisar(tipo === 'logo' ? 'Foto da república salva.' : 'Sua foto foi salva.')
    } catch (e) { app.avisar((e as Error).message, true) }
    setEnv(false)
  }
  async function tirar(tipo: 'logo' | 'perfil') {
    const { error } = tipo === 'logo' ? await supabase.rpc('definir_logo', { p_rep: rep.id, p_path: null }) : await supabase.rpc('definir_foto_perfil', { p_rep: rep.id, p_path: null })
    if (error) return app.avisar(error.message, true)
    await app.recarregar(); app.avisar('Foto removida.')
  }

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
          <h2>Sua foto</h2>
          <span className="small muted">Aparece para os colegas da república. Pode ser tirada na hora pelo celular.</span>
          <div className="linha">
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--acento)', color: 'var(--sobre-acento)', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 26, overflow: 'hidden' }}><Foto path={app.fotos[app.userId]} letra={meuNome.charAt(0).toUpperCase()} /></div>
            <input ref={inPerfil} type="file" accept="image/*" hidden onChange={(e) => { trocar(e.target.files?.[0], 'perfil'); e.target.value = '' }} />
            <button className="btn" disabled={env} onClick={() => inPerfil.current?.click()}>{env ? 'Enviando…' : app.fotos[app.userId] ? 'Trocar foto' : 'Escolher foto'}</button>
            {app.fotos[app.userId] && <button className="btn mini" onClick={() => tirar('perfil')}>Remover</button>}
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
          <div style={{ width: 64, height: 64, borderRadius: 16, background: 'var(--acento)', color: 'var(--sobre-acento)', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 26, overflow: 'hidden', flex: 'none' }}><Foto path={rep.logo_path} letra={letra} /></div>
          {lider ? <>
            <input ref={inLogo} type="file" accept="image/*" hidden onChange={(e) => { trocar(e.target.files?.[0], 'logo'); e.target.value = '' }} />
            <button className="btn" disabled={env} onClick={() => inLogo.current?.click()}>{env ? 'Enviando…' : rep.logo_path ? 'Trocar foto' : 'Escolher foto da república'}</button>
            {rep.logo_path && <button className="btn mini" onClick={() => tirar('logo')}>Remover</button>}
          </> : <span className="small muted">A foto da república é escolhida pelo líder.</span>}
        </div>
        {lider ? <button className="btn primario" disabled={nome.trim() === rep.nome} onClick={salvarNome}>Salvar nome</button> : <span className="small muted">Só o líder muda a identidade da república.</span>}
        <div className="card" style={{ background: 'var(--suave)' }}>
          <span className="small muted" style={{ fontWeight: 800, letterSpacing: '.04em' }}>ASSIM APARECE NO CALENDÁRIO DAS OUTRAS REPÚBLICAS</span>
          <div className="linha"><div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--acento)', color: 'var(--sobre-acento)', display: 'grid', placeItems: 'center', fontWeight: 800, overflow: 'hidden' }}><Foto path={rep.logo_path} letra={letra} /></div><b>{nome || 'Sua república'}</b></div>
        </div>
      </div>
      {senha && <TrocarSenha email={app.email} avisar={app.avisar} onFechar={() => setSenha(false)} />}
    </div>
  )
}
