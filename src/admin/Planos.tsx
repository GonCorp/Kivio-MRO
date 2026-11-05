import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Campo } from '../components'
import { useAdm } from './AdminApp'
import type { PlanoCfg, RepAdmin } from './tipos'
import { RECURSOS, reais } from './util'

export default function Planos() {
  const { avisar } = useAdm()
  const [planos, setPlanos] = useState<PlanoCfg[]>([])
  const [reps, setReps] = useState<RepAdmin[]>([])
  const [sim, setSim] = useState<Record<string, string>>({})

  const carregar = useCallback(async () => {
    const [a, b] = await Promise.all([supabase.from('planos').select('*'), supabase.rpc('admin_listar_republicas')])
    const ordem = ['gratis', 'basico', 'completo']
    setPlanos(((a.data || []) as PlanoCfg[]).sort((x, y) => ordem.indexOf(x.id) - ordem.indexOf(y.id)))
    setReps((b.data || []) as RepAdmin[])
  }, [])
  useEffect(() => { carregar() }, [carregar])

  function mudar(id: string, campos: Partial<PlanoCfg>) { setPlanos((p) => p.map((x) => (x.id === id ? { ...x, ...campos } : x))) }

  async function salvar(p: PlanoCfg) {
    const { data, error } = await supabase.rpc('admin_salvar_plano', {
      p_id: p.id, p_nome: p.nome, p_preco: p.preco_mensal, p_limite: p.limite_membros, p_desc: p.descricao, p_recursos: p.recursos,
    })
    if (error) return avisar(error.message, true)
    avisar(`Plano salvo. Já vale para as ${contagem(p.id)} república(s) deste plano` + (Number(data) ? ` (limite atualizado em ${data}).` : '.'))
    carregar()
  }

  const contagem = (id: string) => reps.filter((r) => r.plano === id && r.ativo).length
  const simulado = planos.reduce((s, p) => {
    if (p.id === 'gratis') return s
    const n = sim[p.id] !== undefined && sim[p.id] !== '' ? Number(sim[p.id]) : contagem(p.id)
    return s + (Number.isNaN(n) ? 0 : n) * (p.preco_mensal || 0)
  }, 0)

  return (
    <>
      <h1>Planos</h1>
      <p className="muted small">Tudo que você marca aqui vale na hora para as repúblicas do plano: o que estiver desmarcado some do app delas e o banco recusa a ação. Quem tem valor combinado mantém o combinado. Para liberar ou tirar um recurso de uma única república (por exemplo, só por um mês), use a aba Repúblicas.</p>
      <div className="grade-cards">
        {planos.map((p) => (
          <div className="card" key={p.id}>
            <div className="linha entre"><h2>{p.nome}</h2><span className="chip">{contagem(p.id)} república(s)</span></div>
            <div className="grade2">
              <Campo rotulo="Preço/mês (R$)">
                <input inputMode="decimal" disabled={p.id === 'gratis'} value={p.preco_mensal ?? ''} placeholder="a definir"
                  onChange={(e) => mudar(p.id, { preco_mensal: e.target.value === '' ? null : Number(e.target.value.replace(',', '.')) })} />
              </Campo>
              <Campo rotulo="Limite de integrantes">
                <input inputMode="numeric" value={p.limite_membros} onChange={(e) => mudar(p.id, { limite_membros: Math.max(1, Number(e.target.value) || 1) })} />
              </Campo>
            </div>
            <Campo rotulo="Descrição"><textarea value={p.descricao || ''} onChange={(e) => mudar(p.id, { descricao: e.target.value })} /></Campo>
            <b className="small">O que inclui</b>
            {RECURSOS.map((r) => (
              <label key={r.id} className="linha">
                <input type="checkbox" checked={p.recursos.includes(r.id)}
                  onChange={(e) => mudar(p.id, { recursos: e.target.checked ? [...p.recursos, r.id] : p.recursos.filter((x) => x !== r.id) })} />
                {r.nome}{!r.pronto && <span className="chip" title="Ainda não existe no app">em breve</span>}
              </label>
            ))}
            <button className="btn primario" onClick={() => salvar(p)}>Salvar plano</button>
          </div>
        ))}
      </div>

      <section className="pilha">
        <h2>Simulador de receita</h2>
        <div className="card">
          <p className="muted small">Troque a quantidade para ver quanto entraria por mês. Vem preenchido com as repúblicas ativas de hoje.</p>
          <div className="grade2">
            {planos.filter((p) => p.id !== 'gratis').map((p) => (
              <Campo key={p.id} rotulo={`Repúblicas no ${p.nome} (${reais(p.preco_mensal)})`}>
                <input inputMode="numeric" value={sim[p.id] ?? String(contagem(p.id))} onChange={(e) => setSim({ ...sim, [p.id]: e.target.value })} />
              </Campo>
            ))}
          </div>
          <span className="num">{reais(simulado)}<span className="muted small"> / mês · {reais(simulado * 12)} / ano</span></span>
        </div>
      </section>
    </>
  )
}
