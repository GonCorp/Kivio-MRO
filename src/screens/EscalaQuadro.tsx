import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../lib/contexto'
import type { Tarefa } from '../lib/tipos'
import { dataCurta, diaSemana, hoje, nomeDia, nomeDiaCurto, segundaDaSemana, somarDias } from '../lib/datas'
import { Campo, Folha } from '../components'
import { NovaTarefa } from './Escala'

const ORDEM = [1, 2, 3, 4, 5, 6, 0]

function primeira(t: Tarefa): string {
  const dif = (t.dia_semana - diaSemana(t.inicio) + 7) % 7
  return somarDias(t.inicio, dif)
}
function ultima(t: Tarefa): string | null {
  const p = primeira(t)
  let u: string | null = t.repeticao === 'semanal' ? null : t.repeticao === 'uma_vez' ? p : somarDias(p, 7 * ((t.vezes || 1) - 1))
  if (t.fim && (!u || t.fim < u)) u = t.fim
  return u
}
const vivo = (t: Tarefa) => { const u = ultima(t); return !u || u >= hoje() }

export default function EscalaQuadro() {
  const app = useApp()
  const rep = app.republica!
  const [tarefas, setTarefas] = useState<Tarefa[]>([])
  const [adding, setAdding] = useState('')
  const [texto, setTexto] = useState('')
  const [edit, setEdit] = useState<Tarefa | null>(null)
  const [nova, setNova] = useState(false)
  const gerente = app.podeGerir

  const carregar = useCallback(async () => {
    const { data, error } = await supabase.from('tarefas').select('*').eq('republica_id', rep.id)
    if (error) app.avisar(error.message, true)
    setTarefas(((data || []) as Tarefa[]).filter(vivo))
  }, [rep.id]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { carregar() }, [carregar])

  const ativos = app.membros.filter((m) => m.ativo)
  const nomeDe = (id: string) => { const m = app.membros.find((x) => x.id === id); return (m && app.nomes[m.user_id]) || 'Integrante' }

  async function rapida(membro: string, dia: number) {
    const { error } = await supabase.rpc('criar_tarefas', { p_rep: rep.id, p_membro: membro, p_titulo: texto, p_descricao: null, p_dias: [dia], p_inicio: hoje(), p_repeticao: 'semanal', p_vezes: null })
    if (error) return app.avisar(error.message, true)
    setAdding(''); setTexto(''); app.avisar('Tarefa criada.'); carregar()
  }
  async function remover(t: Tarefa) {
    if (!confirm(`Remover "${t.titulo}"? As faltas e o histórico anteriores continuam valendo.`)) return
    const { error } = await supabase.rpc('encerrar_tarefa', { p_tarefa: t.id })
    if (error) return app.avisar(error.message, true)
    app.avisar('Tarefa removida.'); carregar()
  }

  return (
    <div className="pilha">
      <div className="card">
        <div className="linha entre"><h2>Escala semanal da casa</h2>{gerente && <button className="btn primario" onClick={() => setNova(true)}>+ Nova tarefa</button>}</div>
        <span className="small muted">Toque em + tarefa para criar uma nova, ou toque numa tarefa para editar quando ela começa e quantas vezes se repete. O x remove. Tudo aparece no quadro de missões e para o integrante.</span>
      </div>

      <div className="rolagem" style={{ overflowX: 'auto' }}>
        <div style={{ minWidth: 920, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '130px repeat(7, minmax(110px, 1fr))', gap: 6 }}>
            <span className="small muted" style={{ fontWeight: 800, padding: 6 }}>INTEGRANTE</span>
            {ORDEM.map((d) => <span key={d} className="small muted" style={{ fontWeight: 800, padding: 6, textAlign: 'center' }}>{nomeDia(d)}</span>)}
          </div>
          {ativos.length === 0 && <div className="card vazio">Cadastre integrantes para montar a escala.</div>}
          {ativos.map((m) => {
            const minhas = tarefas.filter((t) => t.membro_id === m.id)
            return (
              <div key={m.id} style={{ display: 'grid', gridTemplateColumns: '130px repeat(7, minmax(110px, 1fr))', gap: 6 }}>
                <div className="card" style={{ padding: 10, justifyContent: 'center', gap: 2 }}>
                  <b className="small">{app.nomes[m.user_id] || 'Integrante'}</b>
                  <span className="small muted">{minhas.length} tarefa(s)</span>
                </div>
                {ORDEM.map((d) => {
                  const cel = minhas.filter((t) => t.dia_semana === d)
                  const chave = m.id + d
                  return (
                    <div key={d} className="card" style={{ padding: 8, gap: 6, background: 'var(--suave)' }}>
                      {cel.map((t) => (
                        <div key={t.id} style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', background: 'var(--acento)', color: 'var(--sobre-acento)' }}>
                          <button style={{ all: 'unset', cursor: gerente ? 'pointer' : 'default', flex: 1, padding: '6px 8px', fontWeight: 700, fontSize: 12, overflowWrap: 'anywhere' }} aria-label="Abrir tarefa" onClick={() => gerente && setEdit(t)}>
                            {t.titulo}{primeira(t) > hoje() ? <span style={{ fontWeight: 500 }}> · começa {dataCurta(primeira(t))}</span> : null}
                          </button>
                          {gerente && <button style={{ all: 'unset', cursor: 'pointer', padding: '0 8px', fontWeight: 800 }} aria-label={'Remover ' + t.titulo} onClick={() => remover(t)}>x</button>}
                        </div>
                      ))}
                      {gerente && (adding === chave ? (
                        <div className="pilha" style={{ gap: 6 }}>
                          <input autoFocus value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Nome da tarefa" aria-label="Nome da tarefa" style={{ minHeight: 38 }} onKeyDown={(e) => e.key === 'Enter' && texto.trim().length > 1 && rapida(m.id, d)} />
                          <div className="linha"><button className="btn mini primario" onClick={() => rapida(m.id, d)}>Salvar</button><button className="btn mini" onClick={() => { setAdding(''); setTexto('') }}>Cancelar</button></div>
                        </div>
                      ) : <button className="btn mini" style={{ background: 'transparent', borderStyle: 'dashed' }} aria-label={`Nova tarefa para ${app.nomes[m.user_id]} na ${nomeDia(d)}`} onClick={() => { setAdding(chave); setTexto('') }}>+ tarefa</button>)}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>

      {nova && <NovaTarefa onFechar={() => setNova(false)} onCriada={() => { setNova(false); carregar() }} />}
      {edit && <Editar t={edit} nomeDe={nomeDe} onFechar={() => setEdit(null)} onOk={() => { setEdit(null); carregar() }} onRemover={() => { const t = edit; setEdit(null); remover(t) }} />}
    </div>
  )
}

function Editar({ t, nomeDe, onFechar, onOk, onRemover }: { t: Tarefa; nomeDe: (id: string) => string; onFechar: () => void; onOk: () => void; onRemover: () => void }) {
  const app = useApp()
  const [titulo, setTitulo] = useState(t.titulo)
  const [membro, setMembro] = useState(t.membro_id)
  const [dia, setDia] = useState(t.dia_semana)
  const jaComecou = primeira(t) < hoje()
  const [quando, setQuando] = useState<'manter' | 'proxima' | 'semana' | 'data'>(jaComecou ? 'manter' : 'manter')
  const [data, setData] = useState(hoje())
  const [rep, setRep] = useState<Tarefa['repeticao']>(t.repeticao)
  const [vezes, setVezes] = useState(t.vezes || 4)
  const [ocupado, setOcupado] = useState(false)

  const inicio = quando === 'manter' ? (t.inicio < hoje() ? hoje() : t.inicio) : quando === 'proxima' ? hoje() : quando === 'semana' ? somarDias(segundaDaSemana(hoje()), 7) : data
  const inicioTxt = quando === 'manter' ? (jaComecou ? 'já começou' : 'começa em ' + dataCurta(primeira(t))) : quando === 'proxima' ? 'começa esta semana' : quando === 'semana' ? 'começa semana que vem' : 'começa a partir de ' + dataCurta(data)
  const repTxt = rep === 'semanal' ? 'toda semana' : rep === 'uma_vez' ? 'uma única vez' : vezes + ' vezes'
  const mudou = titulo !== t.titulo || membro !== t.membro_id || dia !== t.dia_semana || quando !== 'manter' || rep !== t.repeticao || (rep === 'n_vezes' && vezes !== t.vezes)

  async function salvar() {
    setOcupado(true)
    const { error } = await supabase.rpc('editar_tarefa', { p_tarefa: t.id, p_titulo: titulo, p_membro: membro, p_dia: dia, p_inicio: quando === 'manter' ? t.inicio : inicio, p_repeticao: rep, p_vezes: rep === 'n_vezes' ? vezes : null })
    setOcupado(false)
    if (error) return app.avisar(error.message, true)
    app.avisar('Tarefa salva.'); onOk()
  }
  const chip = (on: boolean) => ({ minHeight: 40, borderRadius: 999, border: '1px solid ' + (on ? 'var(--acento)' : 'var(--linha)'), background: on ? 'var(--acento)' : 'transparent', color: on ? 'var(--sobre-acento)' : 'var(--texto)', fontWeight: 700, fontSize: 13, padding: '0 14px' })

  return (
    <Folha titulo="Editar tarefa" onFechar={onFechar}>
      <Campo rotulo="Tarefa"><input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex.: Lavar a louça" /></Campo>
      <div className="pilha" style={{ gap: 8 }}><span className="small muted" style={{ fontWeight: 700 }}>Quem faz</span>
        <div className="linha quebra">{app.membros.filter((m) => m.ativo).map((m) => <button key={m.id} style={chip(membro === m.id)} onClick={() => setMembro(m.id)}>{nomeDe(m.id)}</button>)}</div></div>
      <div className="pilha" style={{ gap: 8 }}><span className="small muted" style={{ fontWeight: 700 }}>Dia da semana</span>
        <div className="linha quebra">{ORDEM.map((d) => <button key={d} style={chip(dia === d)} onClick={() => setDia(d)}>{nomeDiaCurto(d)}</button>)}</div></div>
      <div className="pilha" style={{ gap: 8 }}><span className="small muted" style={{ fontWeight: 700 }}>Quando começa</span>
        <div className="linha quebra">{([['manter', jaComecou ? 'Já começou' : 'Como está'], ['proxima', 'Esta semana'], ['semana', 'Semana que vem'], ['data', 'Uma data']] as const).map(([k, n]) => <button key={k} style={chip(quando === k)} onClick={() => setQuando(k)}>{n}</button>)}</div>
        {quando === 'data' && <><input type="date" min={hoje()} value={data} onChange={(e) => setData(e.target.value)} /><span className="small muted">O dia da semana passa a ser o dia dessa data.</span></>}</div>
      <div className="pilha" style={{ gap: 8 }}><span className="small muted" style={{ fontWeight: 700 }}>Repetição</span>
        <div className="linha quebra">{([['semanal', 'Toda semana'], ['uma_vez', 'Uma vez'], ['n_vezes', 'Algumas vezes']] as const).map(([k, n]) => <button key={k} style={chip(rep === k)} onClick={() => setRep(k)}>{n}</button>)}</div>
        {rep === 'n_vezes' && <input type="number" min={2} max={52} value={vezes} onChange={(e) => setVezes(Number(e.target.value))} aria-label="Quantas vezes" />}</div>
      <div className="card" style={{ background: 'var(--suave)' }}><span className="small">{nomeDe(membro)} · {nomeDia(dia)} · {inicioTxt} · {repTxt}</span></div>
      {t.repeticao !== 'semanal' || jaComecou ? <span className="small muted">Se a tarefa já tem histórico, ele é mantido: a atual termina ontem e uma nova começa com as mudanças.</span> : null}
      <div className="linha entre"><button className="btn perigo" onClick={onRemover}>Remover tarefa</button><button className="btn primario" disabled={ocupado || !mudou || titulo.trim().length < 2} onClick={salvar}>Salvar tarefa</button></div>
    </Folha>
  )
}
