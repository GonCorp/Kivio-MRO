import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { nomeDoMembro, useApp } from '../lib/contexto'
import type { Ocorrencia, StatusOc, Tarefa } from '../lib/tipos'
import { dataCurta, diaSemana, hoje, nomeDia, nomeDiaCurto, segundaDaSemana, somarDias } from '../lib/datas'
import { Campo, Folha } from '../components'
import { enviarFoto, useFotoUrl } from '../lib/fotos'

export const ROTULO: Record<StatusOc, { t: string; c: string }> = {
  pendente: { t: 'Pendente', c: '' },
  feita: { t: 'Feita', c: 'ok' },
  em_analise: { t: 'Em análise', c: 'aviso' },
  justificada: { t: 'Justificada', c: 'ok' },
  falta: { t: 'Falta', c: 'ruim' },
}

export default function MinhasMissoes() {
  const app = useApp()
  const rep = app.republica!
  const [semana, setSemana] = useState(segundaDaSemana(hoje()))
  const [tarefas, setTarefas] = useState<Tarefa[]>([])
  const [oc, setOc] = useState<Ocorrencia[]>([])
  const [soMinhas, setSoMinhas] = useState(false)
  const [carregando, setCarregando] = useState(true)
  const [nova, setNova] = useState(false)
  const [justificando, setJustificando] = useState<Ocorrencia | null>(null)
  const [concluindo, setConcluindo] = useState<Ocorrencia | null>(null)
  const [fotos, setFotos] = useState<Record<string, string>>({})
  const meuMembroId = app.membro?.id

  const carregar = useCallback(async () => {
    const [t, o, f] = await Promise.all([
      supabase.from('tarefas').select('*').eq('republica_id', rep.id),
      supabase.rpc('ocorrencias', { p_rep: rep.id, p_de: semana, p_ate: somarDias(semana, 6) }),
      supabase.from('execucoes').select('tarefa_id,data,foto_path').eq('republica_id', rep.id).gte('data', semana).lte('data', somarDias(semana, 6)).not('foto_path', 'is', null),
    ])
    setFotos(Object.fromEntries(((f.data || []) as { tarefa_id: string; data: string; foto_path: string }[]).map((x) => [x.tarefa_id + x.data, x.foto_path])))
    if (t.error || o.error) app.avisar((t.error || o.error)!.message, true)
    setTarefas((t.data || []) as Tarefa[])
    setOc((o.data || []) as Ocorrencia[])
    setCarregando(false)
  }, [rep.id, semana]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setCarregando(true)
    carregar()
  }, [carregar])

  const porId = useMemo(() => new Map(tarefas.map((t) => [t.id, t])), [tarefas])

  async function acao(nome: string, args: Record<string, unknown>, ok: string) {
    const { error } = await supabase.rpc(nome, args)
    if (error) return app.avisar(error.message, true)
    app.avisar(ok)
    carregar()
  }

  async function encerrar(t: Tarefa) {
    if (!confirm(`Encerrar "${t.titulo}"? As faltas e o histórico anteriores continuam valendo.`)) return
    acao('encerrar_tarefa', { p_tarefa: t.id }, 'Tarefa encerrada.')
  }

  const dias = Array.from({ length: 7 }, (_, i) => somarDias(semana, i))
  const h = hoje()

  return (
    <>
      <div className="linha entre">
        <span />
        {app.podeGerir && <button className="btn primario" onClick={() => setNova(true)}>+ Nova tarefa</button>}
      </div>

      <div className="linha entre">
        <button className="btn mini" onClick={() => setSemana(somarDias(semana, -7))} aria-label="Semana anterior">‹</button>
        <button className="btn mini" onClick={() => setSemana(segundaDaSemana(h))}>
          {dataCurta(semana)} a {dataCurta(somarDias(semana, 6))}
        </button>
        <button className="btn mini" onClick={() => setSemana(somarDias(semana, 7))} aria-label="Próxima semana">›</button>
      </div>

      <div className="seg" role="group" aria-label="Filtro">
        <button aria-pressed={!soMinhas} onClick={() => setSoMinhas(false)}>Todas</button>
        <button aria-pressed={soMinhas} onClick={() => setSoMinhas(true)}>Só as minhas</button>
      </div>

      {carregando && <p className="muted">Carregando…</p>}

      {!carregando && oc.length === 0 && (
        <div className="card vazio">
          <b>Nenhuma tarefa nesta semana.</b>
          <span>{app.podeGerir ? 'Toque em "+ Nova tarefa" para montar a escala da casa.' : 'O líder ainda não montou a escala.'}</span>
        </div>
      )}

      {dias.map((d) => {
        const lista = oc
          .filter((o) => o.data === d && (!soMinhas || o.membro_id === meuMembroId))
          .sort((a, b) => nomeDoMembro(app, a.membro_id).localeCompare(nomeDoMembro(app, b.membro_id)))
        if (lista.length === 0) return null
        return (
          <section key={d} className={'dia' + (d === h ? ' hoje' : '')}>
            <h3>
              <span>{nomeDia(diaSemana(d))}{d === h ? ' · hoje' : ''}</span>
              <span className="muted small">{dataCurta(d)}</span>
            </h3>
            {lista.map((o) => {
              const t = porId.get(o.tarefa_id)
              const minha = o.membro_id === meuMembroId
              const r = ROTULO[o.status]
              return (
                <div key={o.tarefa_id + o.data} className={'tarefa' + (o.status === 'falta' ? ' falta' : '')}>
                  <div className="linha entre">
                    <div className="grow">
                      <b>{t?.titulo || 'Tarefa'}</b>
                      <div className="muted small">{minha ? 'Você' : nomeDoMembro(app, o.membro_id)}</div>
                    </div>
                    <span className={'chip ' + r.c}>{r.t}</span>
                  </div>
                  {fotos[o.tarefa_id + o.data] && <Comprovante path={fotos[o.tarefa_id + o.data]} />}
                  {o.motivo && (o.status === 'em_analise' || o.status === 'justificada') && (
                    <p className="small muted">Motivo: {o.motivo}</p>
                  )}
                  <div className="acoes">
                    {(o.status === 'pendente' || o.status === 'falta') && (minha && d === h || app.podeGerir) && d <= h && (
                      <button className="btn mini primario" onClick={() => (rep.foto_missao !== 'desligada' && minha ? setConcluindo(o) : acao('marcar_feita', { p_tarefa: o.tarefa_id, p_data: o.data }, 'Marcada como feita.'))}>
                        Marcar como feita
                      </button>
                    )}
                    {minha && (o.status === 'pendente' || o.status === 'falta') && d <= h && (
                      <button className="btn mini" onClick={() => setJustificando(o)}>Justificar</button>
                    )}
                    {app.podeGerir && o.status === 'em_analise' && (
                      <>
                        <button className="btn mini primario" onClick={() => acao('decidir_justificativa', { p_tarefa: o.tarefa_id, p_data: o.data, p_aceitar: true }, 'Justificativa aceita.')}>Aceitar</button>
                        <button className="btn mini perigo" onClick={() => acao('decidir_justificativa', { p_tarefa: o.tarefa_id, p_data: o.data, p_aceitar: false }, 'Justificativa recusada. A falta conta.')}>Recusar</button>
                      </>
                    )}
                    {app.podeGerir && o.status === 'feita' && (
                      <button className="btn mini" onClick={() => acao('desmarcar_feita', { p_tarefa: o.tarefa_id, p_data: o.data }, 'Marcação desfeita.')}>Desfazer</button>
                    )}
                    {app.podeGerir && t && (
                      <button className="btn mini" onClick={() => encerrar(t)}>Encerrar tarefa</button>
                    )}
                  </div>
                </div>
              )
            })}
          </section>
        )
      })}

      {nova && <NovaTarefa onFechar={() => setNova(false)} onCriada={() => { setNova(false); carregar() }} />}
      {concluindo && (
        <Concluir
          oc={concluindo}
          titulo={porId.get(concluindo.tarefa_id)?.titulo || 'Tarefa'}
          onFechar={() => setConcluindo(null)}
          onFeita={() => { setConcluindo(null); carregar() }}
        />
      )}
      {justificando && (
        <Justificar
          oc={justificando}
          titulo={porId.get(justificando.tarefa_id)?.titulo || 'Tarefa'}
          onFechar={() => setJustificando(null)}
          onEnviada={() => { setJustificando(null); carregar() }}
        />
      )}
    </>
  )
}

function Comprovante({ path }: { path: string }) {
  const url = useFotoUrl(path)
  const [grande, setGrande] = useState(false)
  if (!url) return null
  return (
    <>
      <img src={url} alt="Foto da tarefa feita" onClick={() => setGrande(true)} style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 10, cursor: 'zoom-in', marginTop: 6 }} />
      {grande && <Folha titulo="Foto da tarefa" onFechar={() => setGrande(false)}><img src={url} alt="Foto da tarefa feita" style={{ width: '100%', borderRadius: 12 }} /></Folha>}
    </>
  )
}

function Concluir({ oc, titulo, onFechar, onFeita }: { oc: Ocorrencia; titulo: string; onFechar: () => void; onFeita: () => void }) {
  const app = useApp()
  const obrig = app.republica!.foto_missao === 'obrigatoria'
  const [arq, setArq] = useState<File | null>(null)
  const [previa, setPrevia] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  function escolher(f: File | undefined) { setArq(f || null); setPrevia(f ? URL.createObjectURL(f) : null) }
  async function enviar() {
    setOcupado(true)
    try {
      const path = arq ? await enviarFoto(app.republica!.id, 'missoes', arq) : null
      const { error } = await supabase.rpc('marcar_feita_foto', { p_tarefa: oc.tarefa_id, p_data: oc.data, p_path: path })
      if (error) throw new Error(error.message)
      app.avisar('Tarefa marcada como feita.')
      onFeita()
    } catch (e) { app.avisar((e as Error).message, true) }
    setOcupado(false)
  }
  return (
    <Folha titulo="Concluir tarefa" onFechar={onFechar}>
      <p className="muted">{titulo} · {dataCurta(oc.data)}. {obrig ? 'A república pede uma foto para concluir.' : 'A foto é opcional, mas ajuda o líder a conferir.'}</p>
      <input id="foto-tarefa" type="file" accept="image/*" capture="environment" hidden onChange={(e) => escolher(e.target.files?.[0])} />
      <label htmlFor="foto-tarefa" className="btn" style={{ textAlign: 'center' }}>{arq ? 'Trocar foto' : 'Tirar ou escolher foto'}</label>
      {previa && <img src={previa} alt="Prévia" style={{ width: '100%', maxHeight: 280, objectFit: 'cover', borderRadius: 12 }} />}
      <button className="btn primario cheio" disabled={ocupado || (obrig && !arq)} onClick={enviar}>{ocupado ? 'Enviando…' : 'Marcar como feita'}</button>
    </Folha>
  )
}

function Justificar({ oc, titulo, onFechar, onEnviada }: { oc: Ocorrencia; titulo: string; onFechar: () => void; onEnviada: () => void }) {
  const app = useApp()
  const [motivo, setMotivo] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const rapidos = ['Prova ou trabalho da faculdade', 'Problema de saúde', 'Viagem']
  async function enviar() {
    setOcupado(true)
    const { error } = await supabase.rpc('justificar', { p_tarefa: oc.tarefa_id, p_data: oc.data, p_motivo: motivo })
    setOcupado(false)
    if (error) return app.avisar(error.message, true)
    app.avisar('Justificativa enviada ao líder.')
    onEnviada()
  }
  return (
    <Folha titulo="Justificar" onFechar={onFechar}>
      <p className="muted">{titulo} · {dataCurta(oc.data)}. O líder decide se a justificativa é justa. Se for recusada, a falta conta.</p>
      <div className="linha quebra">
        {rapidos.map((r) => (
          <button key={r} className="btn mini" onClick={() => setMotivo(r)}>{r}</button>
        ))}
      </div>
      <Campo rotulo="Motivo">
        <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={300} />
      </Campo>
      <button className="btn primario cheio" disabled={ocupado || motivo.trim().length < 3} onClick={enviar}>Enviar justificativa</button>
    </Folha>
  )
}

export function NovaTarefa({ onFechar, onCriada }: { onFechar: () => void; onCriada: () => void }) {
  const app = useApp()
  const rep = app.republica!
  const [membroId, setMembroId] = useState(app.membros.find((m) => m.ativo)?.id || '')
  const [titulo, setTitulo] = useState('')
  const [descricao, setDescricao] = useState('')
  const [dias, setDias] = useState<number[]>([])
  const [quando, setQuando] = useState<'proxima' | 'semana' | 'data'>('proxima')
  const [data, setData] = useState(hoje())
  const [rep_, setRep] = useState<'semanal' | 'uma_vez' | 'n_vezes'>('semanal')
  const [vezes, setVezes] = useState(4)
  const [ocupado, setOcupado] = useState(false)
  const ordem = [1, 2, 3, 4, 5, 6, 0]

  const inicio = quando === 'proxima' ? hoje() : quando === 'semana' ? somarDias(segundaDaSemana(hoje()), 7) : data

  async function criar() {
    setOcupado(true)
    const { error } = await supabase.rpc('criar_tarefas', {
      p_rep: rep.id, p_membro: membroId, p_titulo: titulo, p_descricao: descricao || null,
      p_dias: dias, p_inicio: inicio, p_repeticao: rep_, p_vezes: rep_ === 'n_vezes' ? vezes : null,
    })
    setOcupado(false)
    if (error) return app.avisar(error.message, true)
    app.avisar('Tarefa criada.')
    onCriada()
  }

  return (
    <Folha titulo="Nova tarefa" onFechar={onFechar}>
      <Campo rotulo="Quem faz">
        <select value={membroId} onChange={(e) => setMembroId(e.target.value)}>
          {app.membros.filter((m) => m.ativo).map((m) => (
            <option key={m.id} value={m.id}>{app.nomes[m.user_id] || 'Integrante'}</option>
          ))}
        </select>
      </Campo>
      <Campo rotulo="Tarefa">
        <input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex.: Lavar a louça" maxLength={80} />
      </Campo>
      <Campo rotulo="Detalhes (opcional)">
        <input value={descricao} onChange={(e) => setDescricao(e.target.value)} maxLength={200} />
      </Campo>
      <div className="campo" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ fontWeight: 700, fontSize: 13 }} className="muted">Em quais dias</span>
        <div className="dias-sel">
          {ordem.map((d) => (
            <label key={d}>
              <input type="checkbox" checked={dias.includes(d)} onChange={(e) => setDias(e.target.checked ? [...dias, d] : dias.filter((x) => x !== d))} />
              <span>{nomeDiaCurto(d)}</span>
            </label>
          ))}
        </div>
      </div>
      <Campo rotulo="Quando começa">
        <select value={quando} onChange={(e) => setQuando(e.target.value as typeof quando)}>
          <option value="proxima">Na próxima ocorrência (a partir de hoje)</option>
          <option value="semana">Semana que vem</option>
          <option value="data">Data específica</option>
        </select>
      </Campo>
      {quando === 'data' && (
        <Campo rotulo="A partir de">
          <input type="date" value={data} min={hoje()} onChange={(e) => setData(e.target.value)} />
        </Campo>
      )}
      <Campo rotulo="Repetição">
        <select value={rep_} onChange={(e) => setRep(e.target.value as typeof rep_)}>
          <option value="semanal">Toda semana</option>
          <option value="uma_vez">Só uma vez</option>
          <option value="n_vezes">Algumas vezes</option>
        </select>
      </Campo>
      {rep_ === 'n_vezes' && (
        <Campo rotulo="Quantas semanas">
          <input type="number" min={2} max={52} value={vezes} onChange={(e) => setVezes(Number(e.target.value))} />
        </Campo>
      )}
      <p className="small muted">Tarefa que ainda não começou não gera falta. Criada para hoje, vale hoje.</p>
      <button className="btn primario cheio" disabled={ocupado || !titulo.trim() || dias.length === 0 || !membroId} onClick={criar}>Criar tarefa</button>
    </Folha>
  )
}
