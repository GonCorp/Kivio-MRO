import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { nomeDoMembro, useApp } from '../lib/contexto'
import type { Faixa, Multa, Tarefa } from '../lib/tipos'
import { dataCurta, hoje, mesAnterior, mesSeguinte, nomeMes, primeiroDoMes, reais } from '../lib/datas'
import { Campo, Folha } from '../components'

export default function Multas() {
  const app = useApp()
  const rep = app.republica!
  const [mes, setMes] = useState(primeiroDoMes(hoje()))
  const [multas, setMultas] = useState<Multa[]>([])
  const [faixas, setFaixas] = useState<Faixa[]>([])
  const [tarefas, setTarefas] = useState<Record<string, string>>({})
  const [editando, setEditando] = useState(false)

  const carregar = useCallback(async () => {
    const [m, f, t] = await Promise.all([
      supabase.rpc('multas_do_mes', { p_rep: rep.id, p_mes: mes }),
      supabase.from('faixas_multa').select('faixa,valor').eq('republica_id', rep.id).order('faixa'),
      supabase.from('tarefas').select('id,titulo').eq('republica_id', rep.id),
    ])
    if (m.error) app.avisar(m.error.message, true)
    setMultas(((m.data || []) as Multa[]).map((x) => ({ ...x, valor: Number(x.valor) })))
    setFaixas(((f.data || []) as Faixa[]).map((x) => ({ ...x, valor: Number(x.valor) })))
    setTarefas(Object.fromEntries(((t.data || []) as Pick<Tarefa, 'id' | 'titulo'>[]).map((x) => [x.id, x.titulo])))
  }, [rep.id, mes]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { carregar() }, [carregar])

  const meuId = app.membro?.id
  const minhas = multas.filter((m) => m.membro_id === meuId)
  const totalMinhas = minhas.reduce((s, m) => s + m.valor, 0)
  const totalCasa = multas.reduce((s, m) => s + m.valor, 0)
  const teto = rep.teto_multa
  const ultima = faixas.length ? faixas[faixas.length - 1].valor : 0
  const proxima = (n: number) => (faixas[Math.min(n, faixas.length) - 1]?.valor ?? ultima)

  // agrupa por integrante
  const porPessoa = new Map<string, Multa[]>()
  multas.forEach((m) => porPessoa.set(m.membro_id, [...(porPessoa.get(m.membro_id) || []), m]))

  return (
    <>
      <div className="linha entre">
        <span />
        {app.podeGerir && <button className="btn" onClick={() => setEditando(true)}>Regras</button>}
      </div>

      <div className="linha entre">
        <button className="btn mini" onClick={() => setMes(mesAnterior(mes))} aria-label="Mês anterior">‹</button>
        <b>{nomeMes(mes)}</b>
        <button className="btn mini" onClick={() => setMes(mesSeguinte(mes))} aria-label="Próximo mês" disabled={mes >= primeiroDoMes(hoje())}>›</button>
      </div>

      <div className="grade2">
        <div className="card">
          <span className="muted small">Suas multas</span>
          <span className={'num' + (totalMinhas > 0 ? ' ruim' : '')}>{reais(totalMinhas)}</span>
        </div>
        <div className="card">
          <span className="muted small">{app.podeGerir ? 'Total da casa' : 'Faltas suas'}</span>
          <span className={'num' + (app.podeGerir && totalCasa > 0 ? ' ruim' : '')}>{app.podeGerir ? reais(totalCasa) : minhas.length}</span>
        </div>
      </div>

      {app.podeGerir && teto != null && totalCasa > teto && (
        <div className="card" style={{ borderColor: 'var(--aviso-fg)' }}>
          <b>Teto de multas ultrapassado</b>
          <span className="small muted">A casa definiu um teto de {reais(teto)} por mês e o total já chegou a {reais(totalCasa)}.</span>
        </div>
      )}

      <div className="card">
        <b>Sua próxima falta no mês</b>
        <span>Vai custar <b>{reais(proxima(minhas.length + 1))}</b>. {minhas.length === 0 ? 'Você não tem faltas neste mês.' : `Você já tem ${minhas.length} falta(s).`}</span>
        <span className="small muted">A multa segue a regra combinada pela república. Pague direto ao líder.</span>
      </div>

      <h2>{app.podeGerir ? 'Faltas do mês, por pessoa' : 'Suas faltas'}</h2>
      {porPessoa.size === 0 && <div className="card vazio">Nenhuma falta neste mês.</div>}
      {[...porPessoa.entries()].map(([mid, lista]) => (
        <div className="card" key={mid}>
          <div className="linha entre">
            <b>{mid === meuId ? 'Você' : nomeDoMembro(app, mid)}</b>
            <span className="chip ruim">{reais(lista.reduce((s, x) => s + x.valor, 0))}</span>
          </div>
          {lista.sort((a, b) => a.numero - b.numero).map((x) => (
            <div className="linha entre small" key={x.tarefa_id + x.data}>
              <span>{x.numero}ª falta · {tarefas[x.tarefa_id] || 'Tarefa'} · {dataCurta(x.data)}</span>
              <b>{reais(x.valor)}</b>
            </div>
          ))}
        </div>
      ))}

      <div className="card">
        <b>Valor da multa por falta</b>
        {faixas.map((f, i) => (
          <div className="linha entre small" key={f.faixa}>
            <span>{f.faixa}ª falta{i === faixas.length - 1 ? ' em diante' : ''}</span>
            <b>{reais(f.valor)}</b>
          </div>
        ))}
        {teto != null && <span className="small muted">Teto mensal da casa: {reais(teto)}</span>}
      </div>

      {editando && <EditarRegras faixas={faixas} teto={teto} onFechar={() => setEditando(false)} onSalvo={async () => { setEditando(false); await app.recarregar(); carregar() }} />}
    </>
  )
}

function EditarRegras({ faixas, teto, onFechar, onSalvo }: { faixas: Faixa[]; teto: number | null; onFechar: () => void; onSalvo: () => void }) {
  const app = useApp()
  const [valores, setValores] = useState<string[]>(faixas.length ? faixas.map((f) => String(f.valor)) : ['10'])
  const [tetoTxt, setTetoTxt] = useState(teto ? String(teto) : '')
  const [ocupado, setOcupado] = useState(false)
  const num = (s: string) => Number(s.replace(',', '.')) || 0

  async function salvar() {
    setOcupado(true)
    const { error } = await supabase.rpc('salvar_faixas', { p_rep: app.republica!.id, p_valores: valores.map(num), p_teto: num(tetoTxt) })
    setOcupado(false)
    if (error) return app.avisar(error.message, true)
    app.avisar('Regras de multa salvas.')
    onSalvo()
  }

  return (
    <Folha titulo="Regras de multa" onFechar={onFechar}>
      <p className="muted small">Cada falta no mês tem seu valor. Depois da última faixa, o valor dela se repete. Para multa fixa, deixe só uma faixa. As regras valem para faltas novas e para o mês em andamento.</p>
      {valores.map((v, i) => (
        <div className="linha" key={i}>
          <span style={{ width: 90 }} className="small muted">{i + 1}ª falta</span>
          <input inputMode="decimal" value={v} onChange={(e) => setValores(valores.map((x, j) => (j === i ? e.target.value : x)))} aria-label={`Valor da ${i + 1}ª falta`} />
          {valores.length > 1 && <button className="btn mini perigo" onClick={() => setValores(valores.filter((_, j) => j !== i))}>Tirar</button>}
        </div>
      ))}
      {valores.length < 8 && <button className="btn mini" onClick={() => setValores([...valores, valores[valores.length - 1] || '10'])}>+ Adicionar faixa</button>}
      <Campo rotulo="Teto mensal de multas da casa (opcional)">
        <input inputMode="decimal" value={tetoTxt} onChange={(e) => setTetoTxt(e.target.value)} placeholder="Sem teto" />
      </Campo>
      <button className="btn primario cheio" disabled={ocupado} onClick={salvar}>Salvar</button>
    </Folha>
  )
}
