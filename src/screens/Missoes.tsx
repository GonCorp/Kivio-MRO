import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../lib/contexto'
import type { Faixa, Multa, Ocorrencia, StatusOc, Tarefa } from '../lib/tipos'
import { dataCurta, hoje, mesAnterior, mesSeguinte, nomeDiaExtenso, nomeMes, primeiroDoMes, reais, somarDias, diasNoMes } from '../lib/datas'
import { EditarRegras } from './Multas'

const ROT: Record<StatusOc, { t: string; bg: string; fg: string }> = {
  feita: { t: 'Feita', bg: 'var(--ok-bg)', fg: 'var(--ok-fg)' },
  falta: { t: 'Não fez', bg: 'var(--ruim-bg)', fg: 'var(--ruim-fg)' },
  justificada: { t: 'Justificada', bg: 'var(--aviso-bg)', fg: 'var(--aviso-fg)' },
  pendente: { t: 'Pendente', bg: 'var(--neutro-bg)', fg: 'var(--neutro-fg)' },
  em_analise: { t: 'Em análise', bg: 'color-mix(in srgb, var(--acento) 18%, transparent)', fg: 'var(--acento)' },
}

export default function Missoes() {
  const app = useApp()
  const rep = app.republica!
  const h = hoje()
  const [mes, setMes] = useState(primeiroDoMes(h))
  const [oc, setOc] = useState<Ocorrencia[]>([])
  const [multas, setMultas] = useState<Multa[]>([])
  const [faixas, setFaixas] = useState<Faixa[]>([])
  const [tarefas, setTarefas] = useState<Record<string, string>>({})
  const [editando, setEditando] = useState(false)

  const carregar = useCallback(async () => {
    const fim = somarDias(mes, diasNoMes(mes) - 1)
    const [o, m, f, t] = await Promise.all([
      supabase.rpc('ocorrencias', { p_rep: rep.id, p_de: mes, p_ate: fim < h ? fim : h }),
      supabase.rpc('multas_do_mes', { p_rep: rep.id, p_mes: mes }),
      supabase.from('faixas_multa').select('faixa,valor').eq('republica_id', rep.id).order('faixa'),
      supabase.from('tarefas').select('id,titulo').eq('republica_id', rep.id),
    ])
    if (o.error) app.avisar(o.error.message, true)
    setOc(((o.data || []) as Ocorrencia[]).filter((x) => x.data <= h))
    setMultas(((m.data || []) as Multa[]).map((x) => ({ ...x, valor: Number(x.valor) })))
    setFaixas(((f.data || []) as Faixa[]).map((x) => ({ ...x, valor: Number(x.valor) })))
    setTarefas(Object.fromEntries(((t.data || []) as Pick<Tarefa, 'id' | 'titulo'>[]).map((x) => [x.id, x.titulo])))
  }, [rep.id, mes, h]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { carregar() }, [carregar])

  const nome = (id: string) => { const m = app.membros.find((x) => x.id === id); return (m && app.nomes[m.user_id]) || 'Integrante' }
  const gerente = app.podeGerir
  const total = multas.reduce((s, x) => s + x.valor, 0)
  const base = oc.filter((x) => ['feita', 'falta', 'justificada', 'em_analise'].includes(x.status)).length
  const feitas = oc.filter((x) => x.status === 'feita').length
  const analise = oc.filter((x) => x.status === 'em_analise')
  const multaDe = useMemo(() => new Map(multas.map((x) => [x.tarefa_id + x.data, x])), [multas])
  const regra = faixas.length === 0 ? 'Nenhum valor de multa definido ainda' : faixas.length === 1 ? `${reais(faixas[0].valor)} por falta, valor fixo`
    : faixas.map((f) => `${f.faixa}ª falta: ${reais(f.valor)}`).join(' · ') + ` (depois repete ${reais(faixas[faixas.length - 1].valor)})`

  async function definir(o: Ocorrencia, status: string) {
    const { error } = await supabase.rpc('definir_status_missao', { p_tarefa: o.tarefa_id, p_data: o.data, p_status: status })
    if (error) return app.avisar(error.message, true)
    carregar()
  }
  const proximo = (o: Ocorrencia): string => {
    switch (o.status) {
      case 'pendente': return 'feita'
      case 'feita': return 'falta'
      case 'falta': return 'justificada'
      default: return o.data === h ? 'pendente' : 'feita'
    }
  }
  async function decidir(o: Ocorrencia, aceitar: boolean) {
    const { error } = await supabase.rpc('decidir_justificativa', { p_tarefa: o.tarefa_id, p_data: o.data, p_aceitar: aceitar })
    if (error) return app.avisar(error.message, true)
    app.avisar(aceitar ? 'Justificativa aceita.' : 'Justificativa recusada. A falta conta.'); carregar()
  }

  const porMembro = app.membros.filter((m) => m.ativo).map((m) => ({ m, lista: oc.filter((x) => x.membro_id === m.id).sort((a, b) => a.data.localeCompare(b.data)) }))
  const acumulado = porMembro.map(({ m }) => {
    const ms = multas.filter((x) => x.membro_id === m.id)
    return { id: m.id, faltas: ms.length, total: ms.reduce((s, x) => s + x.valor, 0) }
  }).filter((x) => x.faltas > 0)

  return (
    <div className="pilha" style={{ maxWidth: 980 }}>
      <div className="linha entre">
        <button className="btn mini" onClick={() => setMes(mesAnterior(mes))} aria-label="Mês anterior">‹</button>
        <b>{nomeMes(mes)}</b>
        <button className="btn mini" onClick={() => setMes(mesSeguinte(mes))} aria-label="Próximo mês" disabled={mes >= primeiroDoMes(h)}>›</button>
      </div>

      <div className="cartoes">
        <div className="bloco"><span className="small muted" style={{ fontWeight: 600 }}>Regra de multa em vigor</span><span style={{ fontWeight: 700 }}>{regra}</span>
          {gerente && <button className="btn mini" style={{ alignSelf: 'flex-start' }} onClick={() => setEditando(true)}>Editar regras</button>}</div>
        <div className="bloco"><span className="small muted" style={{ fontWeight: 600 }}>Multas a cobrar neste mês</span><span className="grande">{reais(total)}</span>
          {rep.teto_multa != null && total > rep.teto_multa && <span className="small" style={{ color: 'var(--aviso-fg)' }}>Acima do teto de {reais(rep.teto_multa)}</span>}</div>
        <div className="bloco"><span className="small muted" style={{ fontWeight: 600 }}>Cumprimento geral</span><span className="grande">{base ? Math.round((feitas / base) * 100) + '%' : '—'}</span></div>
      </div>

      {analise.length > 0 && (
        <div className="card" style={{ borderColor: 'var(--aviso-fg)' }}>
          <h2>Justificativas para analisar ({analise.length})</h2>
          <span className="small muted">Você decide se a justificativa é justa. Se recusar, a falta conta e a multa é aplicada.</span>
          {analise.map((o) => (
            <div className="lista-linha" key={o.tarefa_id + o.data} style={{ flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 200px' }}><b className="small">{nome(o.membro_id)} · {tarefas[o.tarefa_id] || 'Tarefa'}</b><br /><span className="small muted">{nomeDiaExtenso(o.data)} · Motivo: {o.motivo}</span></div>
              {gerente && <><button className="btn mini primario" onClick={() => decidir(o, true)}>Aceitar justificativa</button><button className="btn mini perigo" onClick={() => decidir(o, false)}>Recusar, conta como falta</button></>}
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <h2>Quadro da reunião mensal</h2>
        <span className="small muted">Cada integrante aparece uma vez, com as tarefas dele. Toque no status para alternar: feita, não fez, justificada, pendente.</span>
        {porMembro.map(({ m, lista }) => {
          const f = lista.filter((x) => x.status === 'feita').length
          const fl = lista.filter((x) => x.status === 'falta').length
          return (
            <div key={m.id} style={{ borderTop: '1px solid var(--linha)', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div className="linha entre"><b>{app.nomes[m.user_id] || 'Integrante'}</b><span className="small muted">{f} feita(s) · {fl} falta(s) no mês</span></div>
              {lista.length === 0 && <span className="small muted">Sem tarefas na escala neste mês.</span>}
              {lista.map((o) => {
                const r = ROT[o.status]; const mu = multaDe.get(o.tarefa_id + o.data)
                return (
                  <div className="linha" key={o.tarefa_id + o.data} style={{ flexWrap: 'wrap', gap: 8 }}>
                    <div style={{ flex: '1 1 180px', minWidth: 0 }}><b className="small">{tarefas[o.tarefa_id] || 'Tarefa'}</b><br /><span className="small muted">{nomeDiaExtenso(o.data)}{o.motivo && o.status !== 'feita' ? ' · ' + o.motivo : ''}</span></div>
                    <button disabled={!gerente} style={{ minHeight: 36, borderRadius: 999, border: 0, padding: '0 14px', fontWeight: 700, fontSize: 13, background: r.bg, color: r.fg, cursor: gerente ? 'pointer' : 'default' }}
                      aria-label={`Status: ${r.t}. Toque para alternar`} onClick={() => definir(o, proximo(o))}>{r.t}</button>
                    <div style={{ minWidth: 110, textAlign: 'right' }}>{mu ? <><b className="small" style={{ color: 'var(--ruim-fg)' }}>{reais(mu.valor)}</b><br /><span className="small muted">{mu.numero}ª falta no mês</span></> : <span className="small muted">—</span>}</div>
                  </div>
                )
              })}
            </div>
          )
        })}
        {porMembro.length === 0 && <span className="small muted">Cadastre integrantes e monte a escala.</span>}
      </div>

      <div className="card">
        <h2>Multas acumuladas no mês</h2>
        {acumulado.length === 0 && <span className="small muted">Nenhuma multa neste mês.</span>}
        {acumulado.map((a) => <div className="lista-linha" key={a.id}><b style={{ flex: 1 }}>{nome(a.id)}</b><span className="small muted">{a.faltas} falta(s)</span><b style={{ color: 'var(--ruim-fg)' }}>{reais(a.total)}</b></div>)}
        <div className="lista-linha"><b style={{ flex: 1 }}>Total</b><b>{reais(total)}</b></div>
      </div>

      {editando && <EditarRegras faixas={faixas} teto={rep.teto_multa} onFechar={() => setEditando(false)} onSalvo={async () => { setEditando(false); await app.recarregar(); carregar() }} />}
      <span hidden>{dataCurta(h)}</span>
    </div>
  )
}
