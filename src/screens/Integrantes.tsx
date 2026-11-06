import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../lib/contexto'
import { FUNCOES, type Funcao } from '../lib/tipos'
import { Campo } from '../components'

const OFICIAL = (import.meta.env.VITE_WHATSAPP_OFICIAL as string | undefined) || '5531990003109'

interface Det { membro_id: string; user_id: string; nome: string; whatsapp: string | null; email: string; papel: 'lider' | 'integrante'; funcoes: Funcao[]; ativo: boolean }

function senhaAleatoria(): string {
  const a = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const b = new Uint32Array(8); crypto.getRandomValues(b)
  return Array.from(b, (x) => a[x % a.length]).join('')
}
const mascara = (v: string) => {
  const d = v.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 2) return d
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

export default function Integrantes() {
  const app = useApp()
  const rep = app.republica!
  const [lista, setLista] = useState<Det[]>([])
  const [aberto, setAberto] = useState('')
  const [f, setF] = useState({ nome: '', email: '', whatsapp: '', senha: '' })
  const [ocupado, setOcupado] = useState(false)
  const [cred, setCred] = useState<{ nome: string; email: string; senha: string } | null>(null)

  const carregar = useCallback(async () => {
    const { data, error } = await supabase.rpc('integrantes_detalhe', { p_rep: rep.id })
    if (error) app.avisar(error.message, true)
    setLista((data || []) as Det[])
  }, [rep.id]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { carregar() }, [carregar])

  const ativos = lista.filter((x) => x.ativo)
  const ex = lista.filter((x) => !x.ativo)

  async function cadastrar(e: React.FormEvent) {
    e.preventDefault()
    setOcupado(true)
    const { data, error } = await supabase.functions.invoke('lider-integrante', { body: { acao: 'criar', ...f } })
    setOcupado(false)
    const erro = (data as { erro?: string } | null)?.erro || (error ? 'Não foi possível cadastrar agora. Tente de novo.' : '')
    if (erro) return app.avisar(erro, true)
    setCred({ nome: f.nome, email: f.email.trim().toLowerCase(), senha: f.senha })
    setF({ nome: '', email: '', whatsapp: '', senha: '' })
    await app.recarregar(); carregar()
  }
  async function copiar(t: string) {
    try { await navigator.clipboard.writeText(t); app.avisar('Copiado.') } catch { app.avisar('Não consegui copiar.', true) }
  }
  async function rpc(nome: string, args: Record<string, unknown>, ok: string) {
    const { error } = await supabase.rpc(nome, args)
    if (error) { app.avisar(error.message, true); return false }
    app.avisar(ok); await app.recarregar(); carregar(); return true
  }

  const dadosAcesso = (c: { email: string; senha: string }) => `Acesso ao MRO da ${rep.nome}\nEndereço: ${location.origin}\nE-mail: ${c.email}\nSenha: ${c.senha}`

  return (
    <div className="pilha" style={{ maxWidth: 820 }}>
      <div className="card">
        <div className="linha entre">
          <b>{rep.nome}</b>
          <span className="chip">{rep.plano === 'gratis' ? 'Plano grátis' : rep.plano === 'basico' ? 'Plano básico' : 'Plano completo'}</span>
        </div>
        <span className="muted small">{rep.cidade} · {ativos.length} de {rep.limite_membros} integrantes</span>
        {rep.whatsapp_status === 'verificado' && <span className="chip ok" style={{ alignSelf: 'flex-start' }}>WhatsApp verificado</span>}
      </div>

      {rep.whatsapp_status !== 'verificado' && (
        <div className="card" style={{ borderColor: 'var(--aviso-fg)' }}>
          <div className="linha entre"><b>Verificar seu WhatsApp</b><span className="chip aviso">Pendente</span></div>
          <p className="small">Mande o código abaixo, pelo WhatsApp {rep.whatsapp_lider ? `(${rep.whatsapp_lider})` : 'cadastrado'}, para o número oficial da Kivio Digital. Depois que a gente conferir, a verificação aparece aqui.</p>
          <div className="codigo">{rep.codigo_verificacao}</div>
          <a className="btn" target="_blank" rel="noreferrer" href={`https://wa.me/${OFICIAL}?text=${encodeURIComponent('Código de verificação MRO: ' + rep.codigo_verificacao)}`}>Abrir WhatsApp</a>
        </div>
      )}

      {cred && (
        <div className="card" style={{ borderColor: 'var(--ok-fg)' }}>
          <b>Acesso criado para {cred.nome}</b>
          <span className="small muted">Passe estes dados para o integrante entrar no app. Por segurança, a senha só aparece agora.</span>
          <div className="lista-linha"><span className="muted small" style={{ width: 70 }}>E-mail</span><b style={{ wordBreak: 'break-all' }}>{cred.email}</b></div>
          <div className="lista-linha"><span className="muted small" style={{ width: 70 }}>Senha</span><b style={{ fontFamily: 'ui-monospace, monospace', letterSpacing: 1 }}>{cred.senha}</b></div>
          <div className="linha quebra">
            <button className="btn" onClick={() => copiar(dadosAcesso(cred))}>Copiar dados de acesso</button>
            <a className="btn" target="_blank" rel="noreferrer" href={'https://wa.me/?text=' + encodeURIComponent(dadosAcesso(cred))}>Enviar pelo WhatsApp</a>
            <button className="btn primario" onClick={() => setCred(null)}>Já passei os dados</button>
          </div>
        </div>
      )}

      <div className="card">
        <h2>Cadastrar integrante</h2>
        <span className="small muted">O integrante entra com este e-mail e esta senha e só vê a parte dele.</span>
        <form className="pilha" onSubmit={cadastrar}>
          <div className="grade2">
            <Campo rotulo="Nome"><input value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} placeholder="Nome" required /></Campo>
            <Campo rotulo="E-mail"><input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder="E-mail" required /></Campo>
            <Campo rotulo="WhatsApp (opcional)"><input inputMode="tel" value={f.whatsapp} onChange={(e) => setF({ ...f, whatsapp: mascara(e.target.value) })} placeholder="(31) 98765-4321" /></Campo>
            <Campo rotulo="Senha (mín. 6 caracteres)">
              <div className="linha"><input value={f.senha} onChange={(e) => setF({ ...f, senha: e.target.value })} placeholder="Senha" minLength={6} required />
                <button type="button" className="btn" onClick={() => setF({ ...f, senha: senhaAleatoria() })}>Gerar</button></div>
            </Campo>
          </div>
          <button className="btn primario" disabled={ocupado}>{ocupado ? 'Criando…' : 'Cadastrar e criar acesso'}</button>
        </form>
      </div>

      <h2>Integrantes</h2>
      <span className="small muted">Toque no nome para ver as opções: WhatsApp, funções, nova senha e saída.</span>
      {ativos.map((m) => (
        <Linha key={m.membro_id} m={m} eu={m.user_id === app.userId} aberto={aberto === m.membro_id} alternar={() => setAberto(aberto === m.membro_id ? '' : m.membro_id)}
          rpc={rpc} onSenha={(c) => setCred({ nome: m.nome, ...c })} />
      ))}

      {ex.length > 0 && (
        <>
          <h2>Ex-integrantes</h2>
          <span className="small muted">Saíram da república. Ficam guardados para consulta e não aparecem na escala.</span>
          {ex.map((m) => (
            <div className="card" key={m.membro_id}>
              <div className="linha entre"><b>{m.nome}</b>
                <div className="linha">
                  <button className="btn mini" onClick={() => rpc('reativar_membro', { p_membro: m.membro_id }, 'Integrante voltou para a república.')}>Voltou</button>
                  <button className="btn mini perigo" onClick={() => confirm(`Apagar ${m.nome} da lista de ex-integrantes?`) && rpc('apagar_ex_membro', { p_membro: m.membro_id }, 'Apagado.')}>Apagar</button>
                </div></div>
              <span className="small muted">{m.email}</span>
            </div>
          ))}
        </>
      )}

    </div>
  )
}

function Linha({ m, eu, aberto, alternar, rpc, onSenha }: { m: Det; eu: boolean; aberto: boolean; alternar: () => void; rpc: (n: string, a: Record<string, unknown>, ok: string) => Promise<boolean>; onSenha: (c: { email: string; senha: string }) => void }) {
  const app = useApp()
  const [zap, setZap] = useState(mascara(m.whatsapp || ''))
  const [funcs, setFuncs] = useState<Funcao[]>(m.funcoes)
  const [nova, setNova] = useState('')
  const [ocupado, setOcupado] = useState(false)

  async function trocarSenha() {
    if (nova.length < 6) return app.avisar('A senha precisa ter pelo menos 6 caracteres.', true)
    setOcupado(true)
    const { data, error } = await supabase.functions.invoke('lider-integrante', { body: { acao: 'nova_senha', membro: m.membro_id, senha: nova } })
    setOcupado(false)
    const erro = (data as { erro?: string } | null)?.erro || (error ? 'Não foi possível trocar agora.' : '')
    if (erro) return app.avisar(erro, true)
    onSenha({ email: m.email, senha: nova }); setNova(''); alternar()
  }

  return (
    <div className="card">
      <button style={{ all: 'unset', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }} onClick={alternar} aria-expanded={aberto}>
        <b>{m.nome}{eu ? ' (você)' : ''}</b>
        <span className="linha">
          {m.funcoes.map((x) => <span className="chip" key={x}>{FUNCOES.find((y) => y.id === x)?.nome || x}</span>)}
          <span className={'chip' + (m.papel === 'lider' ? ' ok' : '')}>{m.papel === 'lider' ? 'Líder' : 'Integrante'}</span>
        </span>
      </button>
      {aberto && (
        <div className="pilha" style={{ borderTop: '1px solid var(--linha)', paddingTop: 12 }}>
          <span className="small muted">{m.email}</span>
          <Campo rotulo="WhatsApp">
            <div className="linha"><input inputMode="tel" value={zap} onChange={(e) => setZap(mascara(e.target.value))} placeholder="(31) 98765-4321" />
              <button className="btn" onClick={() => rpc('definir_whatsapp_membro', { p_membro: m.membro_id, p_whatsapp: zap }, 'WhatsApp salvo.')}>Salvar</button></div>
          </Campo>
          {!eu && (
            <>
              <b>Funções que este integrante recebe</b>
              <span className="small muted">Aparecem só no menu dele. O que ele lança aparece no seu painel, e você continua vendo tudo.</span>
              {FUNCOES.map((f) => (
                <label key={f.id} className="linha" style={{ alignItems: 'flex-start' }}>
                  <input type="checkbox" checked={funcs.includes(f.id)} onChange={(e) => setFuncs(e.target.checked ? [...funcs, f.id] : funcs.filter((x) => x !== f.id))} />
                  <span><b>{f.nome}</b><br /><span className="small muted">{f.desc}</span></span>
                </label>
              ))}
              <button className="btn primario" onClick={() => rpc('definir_funcoes', { p_membro: m.membro_id, p_funcoes: funcs }, 'Funções atualizadas.')}>Salvar funções</button>
              <Campo rotulo="Gerar nova senha">
                <div className="linha"><input value={nova} onChange={(e) => setNova(e.target.value)} placeholder="Nova senha (mín. 6)" />
                  <button className="btn" type="button" onClick={() => setNova(senhaAleatoria())}>Gerar</button>
                  <button className="btn primario" disabled={ocupado} onClick={trocarSenha}>Trocar</button></div>
              </Campo>
              <div className="linha quebra">
                <button className="btn" onClick={() => confirm(`Passar a liderança para ${m.nome}? Você vira integrante.`) && rpc('transferir_lideranca', { p_membro: m.membro_id }, 'Liderança transferida.')}>Passar a liderança</button>
                <button className="btn perigo" onClick={() => confirm(`Marcar que ${m.nome} saiu da república?`) && rpc('remover_membro', { p_membro: m.membro_id }, 'Integrante saiu da república.')}>Saiu da república</button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
