import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { nomeDoMembro, useApp } from '../lib/contexto'
import type { Multa, Ocorrencia, Tarefa } from '../lib/tipos'
import { dataCurta, hoje, primeiroDoMes, reais, somarDias } from '../lib/datas'

type Aba = 'inicio' | 'escala' | 'multas' | 'financas' | 'casa'

export default function Inicio({ ir }: { ir: (a: Aba) => void }) {
  const app = useApp()
  const rep = app.republica!
  const [oc, setOc] = useState<Ocorrencia[]>([])
  const [analise, setAnalise] = useState<Ocorrencia[]>([])
  const [titulos, setTitulos] = useState<Record<string, string>>({})
  const [multas, setMultas] = useState<Multa[]>([])
  const [devo, setDevo] = useState<{ n: number; total: number }>({ n: 0, total: 0 })
  const [avisos, setAvisos] = useState<{ id: string; texto: string; link: string | null }[]>([])
  const h = hoje()
  const temEscala = app.tem('escala')
  const temMultas = app.tem('escala') && app.tem('multas')

  useEffect(() => {
    ;(async () => {
      const [o, a, m, t, av, cb] = await Promise.all([
        temEscala ? supabase.rpc('ocorrencias', { p_rep: rep.id, p_de: h, p_ate: h }) : { data: [] },
        temEscala ? supabase.rpc('ocorrencias', { p_rep: rep.id, p_de: somarDias(h, -30), p_ate: h }) : { data: [] },
        temMultas ? supabase.rpc('multas_do_mes', { p_rep: rep.id, p_mes: primeiroDoMes(h) }) : { data: [] },
        supabase.from('tarefas').select('id,titulo').eq('republica_id', rep.id),
        supabase.from('avisos').select('id,texto,link').order('created_at', { ascending: false }).limit(3),
        app.tem('financas') ? supabase.rpc('minhas_cobrancas', { p_rep: rep.id }) : { data: [] },
      ])
      const abertas = ((cb.data || []) as { pago: boolean; valor: number }[]).filter((x) => !x.pago)
      setDevo({ n: abertas.length, total: abertas.reduce((s, x) => s + Number(x.valor), 0) })
      setAvisos((av.data || []) as { id: string; texto: string; link: string | null }[])
      setOc((o.data || []) as Ocorrencia[])
      setAnalise(((a.data || []) as Ocorrencia[]).filter((x) => x.status === 'em_analise'))
      setMultas((m.data || []) as Multa[])
      setTitulos(Object.fromEntries(((t.data || []) as Pick<Tarefa, 'id' | 'titulo'>[]).map((x) => [x.id, x.titulo])))
    })()
  }, [rep.id, h, temEscala, temMultas]) // eslint-disable-line react-hooks/exhaustive-deps

  const minhasHoje = oc.filter((o) => o.membro_id === app.membro?.id)
  const minhasMultas = multas.filter((m) => m.membro_id === app.membro?.id).reduce((s, m) => s + Number(m.valor), 0)
  const totalCasa = multas.reduce((s, m) => s + Number(m.valor), 0)
  const paraAnalisar = app.podeGerir ? analise : []

  return (
    <>
      <h1>Olá, {app.perfil.nome.split(' ')[0]}!</h1>

      {avisos.map((a) => (
        <div className="card" key={a.id} style={{ borderColor: 'var(--aviso-fg)' }}>
          <b>Aviso da Kivio</b>
          <span className="small">{a.texto}</span>
          {a.link && <a className="small" href={a.link} target="_blank" rel="noreferrer">Saiba mais</a>}
        </div>
      ))}

      {app.ehLider && rep.whatsapp_status !== 'verificado' && (
        <button className="card" style={{ textAlign: 'left', borderColor: 'var(--aviso-fg)' }} onClick={() => ir('casa')}>
          <b>Falta verificar seu WhatsApp</b>
          <span className="small muted">Toque para ver o código de verificação.</span>
        </button>
      )}

      {paraAnalisar.length > 0 && (
        <button className="card" style={{ textAlign: 'left', borderColor: 'var(--aviso-fg)' }} onClick={() => ir('escala')}>
          <b>{paraAnalisar.length} justificativa(s) para analisar</b>
          {paraAnalisar.slice(0, 3).map((o) => (
            <span className="small muted" key={o.tarefa_id + o.data}>{nomeDoMembro(app, o.membro_id)} · {titulos[o.tarefa_id] || 'Tarefa'} · {dataCurta(o.data)}</span>
          ))}
        </button>
      )}

      {devo.n > 0 && (
        <button className="card" style={{ textAlign: 'left', borderColor: 'var(--aviso-fg)' }} onClick={() => ir('financas')}>
          <b>Você tem {devo.n} cobrança(s) em aberto</b>
          <span className="small muted">Total: {reais(devo.total)}</span>
        </button>
      )}

      {temEscala && <h2>Suas tarefas de hoje</h2>}
      {!temEscala ? null : minhasHoje.length === 0 ? (
        <div className="card vazio">Nada para você hoje.</div>
      ) : (
        minhasHoje.map((o) => (
          <button key={o.tarefa_id} className="card" style={{ textAlign: 'left' }} onClick={() => ir('escala')}>
            <div className="linha entre">
              <b>{titulos[o.tarefa_id] || 'Tarefa'}</b>
              <span className={'chip ' + (o.status === 'feita' ? 'ok' : o.status === 'pendente' ? '' : 'aviso')}>{o.status === 'feita' ? 'Feita' : o.status === 'pendente' ? 'Pendente' : 'Em análise'}</span>
            </div>
          </button>
        ))
      )}

      <div className="grade2">
        {temMultas && <button className="card" style={{ textAlign: 'left' }} onClick={() => ir('multas')}>
          <span className="muted small">Suas multas no mês</span>
          <span className={'num' + (minhasMultas > 0 ? ' ruim' : '')}>{reais(minhasMultas)}</span>
        </button>}
        {app.podeGerir && temMultas ? (
          <button className="card" style={{ textAlign: 'left' }} onClick={() => ir('multas')}>
            <span className="muted small">Multas da casa</span>
            <span className={'num' + (totalCasa > 0 ? ' ruim' : '')}>{reais(totalCasa)}</span>
          </button>
        ) : (
          <button className="card" style={{ textAlign: 'left' }} onClick={() => ir('casa')}>
            <span className="muted small">Integrantes</span>
            <span className="num">{app.membros.filter((m) => m.ativo).length}</span>
          </button>
        )}
      </div>
    </>
  )
}
