import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAdm } from './AdminApp'
import { hojeISO, reais } from './util'

interface Taxa { republica_id: string; republica: string; ingressos: number; valor: number; estornadas: number; cobradas: number }

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
const nomeMes = (d: string) => MESES[Number(d.slice(5, 7)) - 1] + ' de ' + d.slice(0, 4)
function somaMes(d: string, n: number) {
  const dt = new Date(Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1 + n, 1))
  return dt.toISOString().slice(0, 10)
}

export default function Ingressos() {
  const { avisar } = useAdm()
  const [mes, setMes] = useState(hojeISO().slice(0, 7) + '-01')
  const [linhas, setLinhas] = useState<Taxa[]>([])

  const carregar = useCallback(async () => {
    const { data, error } = await supabase.rpc('admin_taxas', { p_mes: mes })
    if (error) avisar(error.message, true)
    setLinhas(((data || []) as Taxa[]).map((t) => ({ ...t, ingressos: Number(t.ingressos), valor: Number(t.valor), estornadas: Number(t.estornadas), cobradas: Number(t.cobradas) })))
  }, [mes]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { carregar() }, [carregar])

  async function marcar(t: Taxa) {
    if (!confirm(`Marcar as taxas de ${t.republica} (${nomeMes(mes)}) como cobradas?`)) return
    const { error } = await supabase.rpc('admin_marcar_taxas_cobradas', { p_rep: t.republica_id, p_mes: mes })
    if (error) return avisar(error.message, true)
    avisar('Taxas marcadas como cobradas.'); carregar()
  }

  const total = linhas.reduce((s, t) => s + t.valor, 0)
  const aCobrar = linhas.reduce((s, t) => s + (t.ingressos - t.cobradas) * 0.25, 0)
  return (
    <>
      <h1>Ingressos</h1>
      <div className="card">
        <span className="small muted">Taxa de R$ 0,25 por ingresso confirmado. Ela é somada na mensalidade do mês seguinte à venda. Aqui você vê, mês a mês, quanto cobrar de cada república (repúblicas de demonstração ficam de fora).</span>
      </div>
      <div className="linha entre">
        <button className="btn mini" onClick={() => setMes(somaMes(mes, -1))} aria-label="Mês anterior">‹</button>
        <h2>Cobrança de {nomeMes(mes)}</h2>
        <button className="btn mini" onClick={() => setMes(somaMes(mes, 1))} aria-label="Próximo mês">›</button>
      </div>
      <div className="grade2">
        <div className="card"><span className="small muted">Total de taxas</span><span className="num">{reais(total)}</span></div>
        <div className="card"><span className="small muted">Ainda a cobrar</span><span className="num">{reais(aCobrar)}</span></div>
      </div>
      {linhas.length === 0 && <div className="card vazio">Nenhuma taxa para cobrar neste mês.</div>}
      {linhas.map((t) => {
        const pend = t.ingressos - t.cobradas
        return (
          <div className="card" key={t.republica_id}>
            <div className="linha entre"><b>{t.republica}</b><span className={'chip ' + (pend > 0 ? 'aviso' : 'ok')}>{pend > 0 ? `${pend} a cobrar` : 'Cobrado'}</span></div>
            <span className="small muted">{t.ingressos} ingresso(s) · {reais(t.valor)}{t.estornadas ? ` · ${t.estornadas} estornada(s) (cancelados em até 7 dias)` : ''}</span>
            {pend > 0 && <div><button className="btn mini primario" onClick={() => marcar(t)}>Marcar como cobrada</button></div>}
          </div>
        )
      })}
    </>
  )
}
