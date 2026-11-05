import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../lib/contexto'
import type { FestaCal } from '../lib/tipos'
import { dataCurta, diasNoMes, diffDias, diaSemana, hoje, nomeDiaExtenso, nomeMes, primeiroDoMes, mesAnterior, mesSeguinte, somarDias } from '../lib/datas'
import { Campo, Folha } from '../components'
import Ingressos, { Portaria } from './Ingressos'

type Sub = 'calendario' | 'ingressos' | 'portaria'

export default function Festas() {
  const app = useApp()
  const temIng = app.tem('ingressos')
  const abas: [Sub, string][] = [['calendario', 'Calendário']]
  if (temIng) abas.push(['ingressos', 'Ingressos'])
  if (temIng && app.funcao('portaria')) abas.push(['portaria', 'Portaria'])
  const [sub, setSub] = useState<Sub>('calendario')
  const atual = abas.some(([id]) => id === sub) ? sub : 'calendario'
  return (
    <>
      <h1>Festas</h1>
      {abas.length > 1 && (
        <div className="seg" role="group" aria-label="Seções">
          {abas.map(([id, nome]) => <button key={id} aria-pressed={atual === id} onClick={() => setSub(id)}>{nome}</button>)}
        </div>
      )}
      {atual === 'calendario' && <Calendario />}
      {atual === 'ingressos' && <Ingressos />}
      {atual === 'portaria' && <Portaria />}
    </>
  )
}

type Nivel = { cor: 'g' | 'y' | 'r'; msg: string }

// Gravidade de um dia para a minha república, olhando as festas das outras
export function nivelDoDia(dia: string, festas: FestaCal[], meuEsp: number): Nivel {
  const outras = festas.filter((f) => !f.minha)
  const iguais = outras.filter((f) => f.data === dia)
  if (iguais.length) return { cor: 'r', msg: `Atenção: dia ${dataCurta(dia)} coincide com outra festa (${iguais.map((f) => f.republica).join(', ')}). Evite marcar nessa data.` }
  const perto = outras
    .map((f) => ({ f, d: Math.abs(diffDias(f.data, dia)) }))
    .filter((x) => x.d <= Math.max(meuEsp, x.f.espacamento_dias))
    .sort((a, b) => a.d - b.d)
  if (perto.length) {
    const p = perto[0]
    return { cor: 'y', msg: `Atenção: a festa da ${p.f.republica} é ${p.d} dia(s) ${diffDias(p.f.data, dia) > 0 ? 'depois' : 'antes'}. Duas festas tão perto podem dividir o público. Vale conferir antes de marcar.` }
  }
  return { cor: 'g', msg: 'Data livre. Nenhuma outra república marcou festa por perto.' }
}

const COR = { g: 'var(--ok-bg)', y: 'var(--aviso-bg)', r: 'var(--ruim-bg)' }
const COR_TXT = { g: 'var(--ok-fg)', y: 'var(--aviso-fg)', r: 'var(--ruim-fg)' }

function Calendario() {
  const app = useApp()
  const rep = app.republica!
  const [mes, setMes] = useState(primeiroDoMes(hoje()))
  const [festas, setFestas] = useState<FestaCal[]>([])
  const [dia, setDia] = useState<string | null>(null)
  const [marcar, setMarcar] = useState<string | null>(null)
  const [f, setF] = useState({ titulo: '', local: '' })
  const [esp, setEsp] = useState(rep.espacamento_dias ?? 3)
  const podeMarcar = app.ehLider && app.tem('calendario')

  const carregar = useCallback(async () => {
    const { data, error } = await supabase.rpc('calendario', { p_rep: rep.id, p_de: somarDias(mes, -30), p_ate: somarDias(mes, diasNoMes(mes) + 30) })
    if (error) app.avisar(error.message, true)
    setFestas((data || []) as FestaCal[])
  }, [rep.id, mes]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { carregar() }, [carregar])

  const celulas = useMemo(() => {
    const vazios = (diaSemana(mes) + 6) % 7 // semana começa na segunda
    const n = diasNoMes(mes)
    return [...Array(vazios).fill(null), ...Array.from({ length: n }, (_, i) => mes.slice(0, 8) + String(i + 1).padStart(2, '0'))] as (string | null)[]
  }, [mes])

  const h = hoje()
  const doMes = festas.filter((x) => x.data.slice(0, 7) === mes.slice(0, 7))
  const msgDia = dia ? nivelDoDia(dia, festas, esp) : null
  const festasDoDia = dia ? festas.filter((x) => x.data === dia) : []

  async function criar(e: React.FormEvent) {
    e.preventDefault()
    const { error } = await supabase.rpc('marcar_festa', { p_rep: rep.id, p_data: marcar, p_titulo: f.titulo, p_local: f.local })
    if (error) return app.avisar(error.message, true)
    setMarcar(null); setF({ titulo: '', local: '' }); app.avisar('Festa marcada.'); carregar()
  }
  async function cancelar(x: FestaCal) {
    if (!confirm(`Cancelar a festa "${x.titulo}" de ${dataCurta(x.data)}?`)) return
    const { error } = await supabase.rpc('cancelar_festa', { p_id: x.id })
    if (error) return app.avisar(error.message, true)
    app.avisar('Festa cancelada.'); carregar()
  }
  async function salvarEsp(v: number) {
    setEsp(v)
    const { error } = await supabase.rpc('definir_espacamento', { p_rep: rep.id, p_dias: v })
    if (error) return app.avisar(error.message, true)
    app.avisar('Pedido de espaçamento salvo.')
  }

  return (
    <>
      <div className="linha entre">
        <button className="btn mini" onClick={() => setMes(mesAnterior(mes))} aria-label="Mês anterior">‹</button>
        <h2>{nomeMes(mes)}</h2>
        <button className="btn mini" onClick={() => setMes(mesSeguinte(mes))} aria-label="Próximo mês">›</button>
      </div>

      <div className="card">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, textAlign: 'center' }}>
          {['S', 'T', 'Q', 'Q', 'S', 'S', 'D'].map((d, i) => <span key={i} className="small muted" style={{ fontWeight: 700 }}>{d}</span>)}
          {celulas.map((d, i) => {
            if (!d) return <span key={i} />
            const passou = d < h
            const n = passou ? null : nivelDoDia(d, festas, esp)
            const minha = festas.some((x) => x.minha && x.data === d)
            const outras = festas.some((x) => !x.minha && x.data === d)
            return (
              <button key={d} onClick={() => setDia(d)} aria-pressed={dia === d} aria-label={nomeDiaExtenso(d)}
                style={{ minHeight: 44, borderRadius: 10, border: dia === d ? '2px solid var(--acento)' : minha ? '2px solid var(--laranja)' : '1px solid var(--linha)',
                  background: n ? COR[n.cor] : 'var(--suave)', color: n ? COR_TXT[n.cor] : 'var(--suave-txt)', fontWeight: 700, position: 'relative' }}>
                {Number(d.slice(8))}
                {(minha || outras) && <span style={{ position: 'absolute', bottom: 3, left: '50%', transform: 'translateX(-50%)', fontSize: 9 }}>{minha ? '★' : '●'}</span>}
              </button>
            )
          })}
        </div>
        <div className="linha quebra small muted">
          <span>🟢 livre</span><span>🟡 perto de outra festa</span><span>🔴 mesma data</span><span>★ sua festa</span>
        </div>
      </div>

      {dia ? (
        <div className="card">
          <b>{nomeDiaExtenso(dia)}</b>
          {festasDoDia.map((x) => <span key={x.id} className="small">{x.minha ? '★ ' : '● '}<b>{x.republica}</b>: {x.titulo}{x.local ? ' · ' + x.local : ''}</span>)}
          {dia >= h && msgDia && <span className="chip" style={{ whiteSpace: 'normal', borderRadius: 12, padding: '8px 12px', background: COR[msgDia.cor], color: COR_TXT[msgDia.cor] }}>{msgDia.msg}</span>}
          {podeMarcar && dia >= h && !festasDoDia.some((x) => x.minha) && <button className="btn primario" onClick={() => setMarcar(dia)}>Marcar festa neste dia</button>}
          {!app.tem('calendario') && <span className="small muted">Marcar festas faz parte dos planos pagos.</span>}
        </div>
      ) : <div className="card vazio">Toque num dia para ver o aviso de proximidade{podeMarcar ? ' e marcar a festa' : ''}.</div>}

      <h2>Festas do mês</h2>
      {doMes.length === 0 && <div className="card vazio">Nenhuma festa marcada neste mês na região.</div>}
      {doMes.map((x) => (
        <div className="card" key={x.id}>
          <div className="linha entre"><b>{x.titulo}</b><span className="chip">{dataCurta(x.data)}</span></div>
          <span className="small muted">{x.minha ? 'Sua república' : x.republica}{x.local ? ' · ' + x.local : ''}</span>
          {x.minha && app.ehLider && <div><button className="btn mini perigo" onClick={() => cancelar(x)}>Cancelar festa</button></div>}
        </div>
      ))}

      {app.ehLider && (
        <div className="card">
          <b>Pedido de espaçamento</b>
          <span className="small muted">Quantos dias você quer entre a sua festa e a de outra república. O calendário avisa quando alguém marca dentro desse prazo.</span>
          <select aria-label="Dias de espaçamento" style={{ width: 'auto' }} value={esp} onChange={(e) => salvarEsp(Number(e.target.value))}>
            {[0, 1, 2, 3, 4, 5, 7, 10, 14].map((n) => <option key={n} value={n}>{n === 0 ? 'Sem pedido' : n + ' dia(s)'}</option>)}
          </select>
        </div>
      )}

      {marcar && (
        <Folha titulo={'Marcar festa · ' + dataCurta(marcar)} onFechar={() => setMarcar(null)}>
          {(() => { const n = nivelDoDia(marcar, festas, esp); return <span className="chip" style={{ whiteSpace: 'normal', borderRadius: 12, padding: '8px 12px', background: COR[n.cor], color: COR_TXT[n.cor] }}>{n.msg}</span> })()}
          <form className="pilha" onSubmit={criar}>
            <Campo rotulo="Nome da festa"><input value={f.titulo} onChange={(e) => setF({ ...f, titulo: e.target.value })} placeholder="Ex.: Festa de abertura" required /></Campo>
            <Campo rotulo="Local (opcional)"><input value={f.local} onChange={(e) => setF({ ...f, local: e.target.value })} /></Campo>
            <button className="btn primario">Marcar festa</button>
          </form>
        </Folha>
      )}
    </>
  )
}
