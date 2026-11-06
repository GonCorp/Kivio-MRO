import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../lib/contexto'
import { FUNCOES, type Funcao, type Membro } from '../lib/tipos'
import { Folha } from '../components'
import TrocarSenha from '../TrocarSenha'
import Relatorios from './Relatorios'

// Número oficial do WhatsApp Business da Kivio Digital (público): 55 + DDD + número
const OFICIAL = (import.meta.env.VITE_WHATSAPP_OFICIAL as string | undefined) || '5531990003109'

export default function Casa() {
  const app = useApp()
  const [senha, setSenha] = useState(false)
  const [relat, setRelat] = useState(false)
  const rep = app.republica!
  const ativos = app.membros.filter((m) => m.ativo)
  const [sel, setSel] = useState<Membro | null>(null)

  async function renovar() {
    if (!confirm('Gerar um novo código? O código antigo deixa de funcionar.')) return
    const { error } = await supabase.rpc('regenerar_convite', { p_rep: rep.id })
    if (error) return app.avisar(error.message, true)
    app.avisar('Novo código gerado.')
    app.recarregar()
  }

  async function copiar(txt: string) {
    try {
      await navigator.clipboard.writeText(txt)
      app.avisar('Copiado!')
    } catch {
      app.avisar('Não consegui copiar. Selecione e copie manualmente.', true)
    }
  }

  async function sair() {
    if (!confirm('Sair desta república?')) return
    const { error } = await supabase.rpc('sair_republica')
    if (error) return app.avisar(error.message, true)
    app.recarregar()
  }

  const convite = `Entra na nossa república no MRO! Crie sua conta em ${location.origin} e use o código ${rep.codigo_convite}.`

  return (
    <>
      <span />

      <div className="card">
        <div className="linha entre">
          <b>{rep.nome}</b>
          <span className="chip">{rep.plano === 'gratis' ? 'Plano grátis' : rep.plano === 'basico' ? 'Plano básico' : 'Plano completo'}</span>
        </div>
        <span className="muted small">{rep.cidade} · {ativos.length} de {rep.limite_membros} integrantes</span>
      </div>

      {app.ehLider && (
        <div className="card">
          <b>Convidar integrantes</b>
          <div className="codigo" aria-label={'Código de convite ' + rep.codigo_convite}>{rep.codigo_convite}</div>
          <div className="linha quebra">
            <a className="btn primario cheio" href={'https://wa.me/?text=' + encodeURIComponent(convite)} target="_blank" rel="noreferrer">Enviar pelo WhatsApp</a>
            <button className="btn" onClick={() => copiar(convite)}>Copiar</button>
            <button className="btn" onClick={renovar}>Novo código</button>
          </div>
        </div>
      )}

      {app.ehLider && rep.whatsapp_status !== 'verificado' && (
        <div className="card" style={{ borderColor: 'var(--aviso-fg)' }}>
          <div className="linha entre"><b>Verificar seu WhatsApp</b><span className="chip aviso">Pendente</span></div>
          <p className="small">
            Mande o código abaixo, pelo WhatsApp {rep.whatsapp_lider ? `(${rep.whatsapp_lider})` : 'cadastrado'}, para o número oficial da Kivio Digital{OFICIAL ? '' : ' (será informado em breve)'}. Depois que a gente conferir, a verificação aparece aqui.
          </p>
          <div className="codigo">{rep.codigo_verificacao}</div>
          {OFICIAL && (
            <a className="btn" target="_blank" rel="noreferrer" href={`https://wa.me/${OFICIAL}?text=${encodeURIComponent('Código de verificação MRO: ' + rep.codigo_verificacao)}`}>Abrir WhatsApp</a>
          )}
        </div>
      )}
      {app.ehLider && rep.whatsapp_status === 'verificado' && <span className="chip ok" style={{ alignSelf: 'flex-start' }}>WhatsApp verificado</span>}

      <h2>Integrantes</h2>
      {ativos.map((m) => (
        <button key={m.id} className="card" style={{ textAlign: 'left', cursor: app.ehLider && m.user_id !== app.userId ? 'pointer' : 'default' }}
          onClick={() => app.ehLider && m.user_id !== app.userId && setSel(m)}
          aria-label={app.ehLider && m.user_id !== app.userId ? 'Opções de ' + (app.nomes[m.user_id] || 'integrante') : undefined}>
          <div className="linha entre">
            <b>{app.nomes[m.user_id] || 'Integrante'}{m.user_id === app.userId ? ' (você)' : ''}</b>
            <span className={'chip' + (m.papel === 'lider' ? ' ok' : '')}>{m.papel === 'lider' ? 'Líder' : 'Integrante'}</span>
          </div>
          {m.funcoes.length > 0 && (
            <div className="linha quebra">
              {m.funcoes.map((f) => <span className="chip" key={f}>{FUNCOES.find((x) => x.id === f)?.nome || f}</span>)}
            </div>
          )}
          {app.ehLider && m.user_id !== app.userId && <span className="small muted">Toque para funções e opções</span>}
        </button>
      ))}

      {app.ehLider && app.tem('relatorios') && <button className="btn primario" onClick={() => setRelat(true)}>Relatórios</button>}
      {relat && <Relatorios onFechar={() => setRelat(false)} />}
      <button className="btn" onClick={() => setSenha(true)}>Trocar minha senha</button>
      {senha && <TrocarSenha email={app.email} avisar={app.avisar} onFechar={() => setSenha(false)} />}
      {!app.ehLider && <button className="btn perigo" onClick={sair}>Sair da república</button>}

      {sel && <Opcoes membro={sel} onFechar={() => setSel(null)} />}
    </>
  )
}

function Opcoes({ membro, onFechar }: { membro: Membro; onFechar: () => void }) {
  const app = useApp()
  const nome = app.nomes[membro.user_id] || 'Integrante'
  const [funcs, setFuncs] = useState<Funcao[]>(membro.funcoes)

  async function salvar() {
    const { error } = await supabase.rpc('definir_funcoes', { p_membro: membro.id, p_funcoes: funcs })
    if (error) return app.avisar(error.message, true)
    app.avisar('Funções atualizadas.')
    await app.recarregar()
    onFechar()
  }
  async function remover() {
    if (!confirm(`Remover ${nome} da república?`)) return
    const { error } = await supabase.rpc('remover_membro', { p_membro: membro.id })
    if (error) return app.avisar(error.message, true)
    app.avisar('Integrante removido.')
    await app.recarregar()
    onFechar()
  }
  async function passar() {
    if (!confirm(`Passar a liderança para ${nome}? Você vira integrante.`)) return
    const { error } = await supabase.rpc('transferir_lideranca', { p_membro: membro.id })
    if (error) return app.avisar(error.message, true)
    app.avisar('Liderança transferida.')
    await app.recarregar()
    onFechar()
  }

  return (
    <Folha titulo={nome} onFechar={onFechar}>
      <b>Funções que este integrante recebe</b>
      <p className="small muted">O que ele lança aparece no seu painel. Você continua vendo tudo.</p>
      {FUNCOES.map((f) => (
        <label key={f.id} className="linha" style={{ alignItems: 'flex-start' }}>
          <input type="checkbox" checked={funcs.includes(f.id)} onChange={(e) => setFuncs(e.target.checked ? [...funcs, f.id] : funcs.filter((x) => x !== f.id))} />
          <span><b>{f.nome}</b><br /><span className="small muted">{f.desc}</span></span>
        </label>
      ))}
      <button className="btn primario cheio" onClick={salvar}>Salvar funções</button>
      <hr style={{ border: 0, borderTop: '1px solid var(--linha)', width: '100%' }} />
      <button className="btn cheio" onClick={passar}>Passar a liderança</button>
      <button className="btn perigo cheio" onClick={remover}>Remover da república</button>
    </Folha>
  )
}
