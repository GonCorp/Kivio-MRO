import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAdm } from './AdminApp'
import { dataBR, hojeISO } from './util'

interface FestaAdm { id: string; republica: string; cidade: string; demo: boolean; data: string; titulo: string; local: string | null; vendidos: number; pendentes: number; usados: number }

export default function CalendarioGeral() {
  const { avisar } = useAdm()
  const [festas, setFestas] = useState<FestaAdm[]>([])
  const [cidade, setCidade] = useState('')
  const [passadas, setPassadas] = useState(false)

  useEffect(() => {
    supabase.rpc('admin_festas').then(({ data, error }) => {
      if (error) avisar(error.message, true)
      setFestas(((data || []) as FestaAdm[]).map((f) => ({ ...f, vendidos: Number(f.vendidos), pendentes: Number(f.pendentes), usados: Number(f.usados) })))
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const cidades = [...new Set(festas.map((f) => f.cidade))].sort()
  const h = hojeISO()
  const lista = festas.filter((f) => (!cidade || f.cidade === cidade) && (passadas || f.data >= h))
  return (
    <>
      <h1>Calendário geral</h1>
      <div className="card"><span className="small muted">Todas as festas marcadas pelas repúblicas, por data. Repúblicas de demonstração aparecem sinalizadas e não entram no calendário das repúblicas reais.</span></div>
      <div className="linha quebra">
        <select aria-label="Cidade" style={{ width: 'auto' }} value={cidade} onChange={(e) => setCidade(e.target.value)}>
          <option value="">Todas as cidades</option>
          {cidades.map((c) => <option key={c}>{c}</option>)}
        </select>
        <label className="linha" style={{ gap: 6 }}><input type="checkbox" style={{ width: 'auto' }} checked={passadas} onChange={(e) => setPassadas(e.target.checked)} /> Mostrar festas passadas</label>
      </div>
      {lista.length === 0 && <div className="card vazio">Nenhuma festa marcada.</div>}
      {lista.map((f) => (
        <div className="card" key={f.id}>
          <div className="linha entre"><b>{f.titulo}</b><span className="chip">{dataBR(f.data)}</span></div>
          <span className="small muted">{f.republica} · {f.cidade}{f.local ? ' · ' + f.local : ''}{f.demo ? ' · demonstração' : ''}</span>
          <span className="small">{f.vendidos} ingresso(s) pago(s) · {f.pendentes} aguardando · {f.usados} entrada(s)</span>
        </div>
      ))}
    </>
  )
}
