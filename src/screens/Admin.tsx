import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../lib/contexto'
import type { Cidade, RepAdmin } from '../lib/tipos'

export default function Admin() {
  const app = useApp()
  const [reps, setReps] = useState<RepAdmin[]>([])
  const [cidades, setCidades] = useState<Cidade[]>([])
  const [carregando, setCarregando] = useState(true)

  const carregar = useCallback(async () => {
    const [r, c] = await Promise.all([supabase.rpc('admin_listar_republicas'), supabase.from('cidades').select('*').order('nome')])
    if (r.error) app.avisar(r.error.message, true)
    setReps((r.data || []) as RepAdmin[])
    setCidades((c.data || []) as Cidade[])
    setCarregando(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { carregar() }, [carregar])

  async function chamar(fn: string, args: Record<string, unknown>, ok: string) {
    const { error } = await supabase.rpc(fn, args)
    if (error) return app.avisar(error.message, true)
    app.avisar(ok)
    carregar()
  }

  const fila = reps.filter((r) => r.whatsapp_status !== 'verificado')

  return (
    <>
      <h1>Super admin</h1>
      <p className="muted small">Só você vê esta tela. Libere, bloqueie e confira o WhatsApp de cada república.</p>

      <h2>Fila de verificação de WhatsApp ({fila.length})</h2>
      {fila.length === 0 && <div className="card vazio">Ninguém na fila.</div>}
      {fila.map((r) => (
        <div className="card" key={r.id}>
          <div className="linha entre"><b>{r.nome}</b><span className="muted small">{r.lider_nome}</span></div>
          <span className="small">WhatsApp do líder: <b>{r.whatsapp_lider || '—'}</b></span>
          <span className="small">Código que deve chegar: <b style={{ letterSpacing: '0.12em' }}>{r.codigo_verificacao}</b></span>
          <div className="linha quebra">
            {r.whatsapp_lider && <a className="btn mini" target="_blank" rel="noreferrer" href={'https://wa.me/55' + r.whatsapp_lider.replace(/^55/, '')}>Abrir conversa</a>}
            <button className="btn mini primario" onClick={() => chamar('admin_verificar_whatsapp', { p_rep: r.id, p_ok: true }, 'WhatsApp verificado.')}>Marcar como verificado</button>
          </div>
        </div>
      ))}

      <h2>Repúblicas ({reps.length})</h2>
      {carregando && <p className="muted">Carregando…</p>}
      {reps.map((r) => (
        <div className="card" key={r.id} style={r.ativo ? undefined : { borderColor: 'var(--ruim-fg)' }}>
          <div className="linha entre">
            <b>{r.nome}</b>
            <span className={'chip ' + (r.ativo ? 'ok' : 'ruim')}>{r.ativo ? 'Ativa' : 'Bloqueada'}</span>
          </div>
          <span className="small muted">{r.cidade} · líder {r.lider_nome || '—'} · {r.integrantes} integrante(s) · criada em {r.created_at.slice(0, 10).split('-').reverse().join('/')}</span>
          <div className="linha quebra">
            <select aria-label="Plano" style={{ width: 'auto', minHeight: 36 }} value={r.plano}
              onChange={(e) => chamar('admin_set_plano', { p_rep: r.id, p_plano: e.target.value, p_limite: e.target.value === 'gratis' ? 7 : 30 }, 'Plano alterado.')}>
              <option value="gratis">Grátis (7)</option>
              <option value="basico">Básico (30)</option>
              <option value="completo">Completo (30)</option>
            </select>
            <span className={'chip ' + (r.whatsapp_status === 'verificado' ? 'ok' : 'aviso')}>{r.whatsapp_status === 'verificado' ? 'WhatsApp verificado' : 'WhatsApp pendente'}</span>
          </div>
          <div className="linha quebra">
            <button className={'btn mini ' + (r.ativo ? 'perigo' : 'primario')}
              onClick={() => confirm(r.ativo ? `Bloquear ${r.nome}? Ninguém da república conseguirá usar o app.` : `Liberar ${r.nome}?`) &&
                chamar('admin_set_ativo', { p_rep: r.id, p_ativo: !r.ativo }, r.ativo ? 'República bloqueada.' : 'República liberada.')}>
              {r.ativo ? 'Bloquear acesso' : 'Liberar acesso'}
            </button>
          </div>
        </div>
      ))}

      <h2>Cidades</h2>
      <div className="card">
        {cidades.map((c) => (
          <label key={c.nome} className="linha entre">
            <span>{c.nome}</span>
            <input type="checkbox" checked={c.ativa} onChange={(e) => chamar('admin_ativar_cidade', { p_cidade: c.nome, p_ativa: e.target.checked }, 'Cidade atualizada.')} />
          </label>
        ))}
      </div>
    </>
  )
}
