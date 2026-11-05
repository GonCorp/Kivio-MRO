import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAdm } from './AdminApp'
import { vars } from './Contatos'
import type { Interessada, Modelo, PlanoCfg, RepAdmin } from './tipos'
import { preencher, waLink } from './util'

const EXEMPLO = { lider: 'Maria', republica: 'República Exemplo', plano: 'Básico', valor: 'R$ 29,90', vencimento: '10/12/2026' }

export default function Automacoes() {
  const { avisar } = useAdm()
  const [modelos, setModelos] = useState<Modelo[]>([])
  const [reps, setReps] = useState<RepAdmin[]>([])
  const [planos, setPlanos] = useState<PlanoCfg[]>([])
  const [inter, setInter] = useState<Interessada[]>([])

  const carregar = useCallback(async () => {
    const [m, r, p, i] = await Promise.all([
      supabase.from('mensagens_modelo').select('*').order('id'), supabase.rpc('admin_listar_republicas'),
      supabase.from('planos').select('*'), supabase.from('interessadas').select('*'),
    ])
    setModelos((m.data || []) as Modelo[]); setReps((r.data || []) as RepAdmin[])
    setPlanos((p.data || []) as PlanoCfg[]); setInter((i.data || []) as Interessada[])
  }, [])
  useEffect(() => { carregar() }, [carregar])

  async function salvar(m: Modelo) {
    const { error } = await supabase.from('mensagens_modelo').update({ texto: m.texto, ativo: m.ativo }).eq('id', m.id)
    if (error) return avisar(error.message, true)
    avisar('Mensagem salva.')
  }
  const mudar = (id: string, c: Partial<Modelo>) => setModelos((l) => l.map((x) => (x.id === id ? { ...x, ...c } : x)))

  function destinos(id: string): { nome: string; link: string | null }[] {
    const m = modelos.find((x) => x.id === id)
    if (!m) return []
    if (id === 'interessada') {
      return inter.filter((i) => !i.convertida).map((i) => ({ nome: i.republica, link: waLink(i.telefone, preencher(m.texto, { lider: (i.lider || 'tudo bem').split(' ')[0], republica: i.republica })) }))
    }
    const alvo = reps.filter((r) => r.ativo && (id === 'venc' ? r.situacao === 'vence_em_breve' : id === 'atraso' ? r.situacao === 'atrasada' : !r.contatado))
    return alvo.map((r) => ({ nome: r.nome, link: waLink(r.whatsapp_lider, preencher(m.texto, vars(r, planos))) }))
  }

  return (
    <>
      <h1>Automações</h1>
      <p className="muted small">Mensagens prontas para cobrança e relacionamento. Por enquanto o envio é manual: o botão abre o WhatsApp já com o texto pronto, você só confere e envia. (Envio automático exigiria a API paga do WhatsApp; fica para depois, com sua aprovação.)</p>
      <p className="small">Campos que o texto aceita: <code>{'{lider}'}</code> <code>{'{republica}'}</code> <code>{'{plano}'}</code> <code>{'{valor}'}</code> <code>{'{vencimento}'}</code></p>
      <div className="grade-cards">
        {modelos.map((m) => {
          const d = destinos(m.id)
          return (
            <div className="card" key={m.id}>
              <div className="linha entre"><h2>{m.titulo}</h2><label className="linha small"><input type="checkbox" checked={m.ativo} onChange={(e) => mudar(m.id, { ativo: e.target.checked })} />Ativa</label></div>
              <span className="small muted">{m.quando}</span>
              <textarea value={m.texto} onChange={(e) => mudar(m.id, { texto: e.target.value })} />
              <span className="small muted">Prévia:</span>
              <div className="pre">{preencher(m.texto, EXEMPLO)}</div>
              <button className="btn primario" onClick={() => salvar(m)}>Salvar texto</button>
              {m.ativo && (
                <>
                  <b className="small">Quem receberia agora ({d.length})</b>
                  {d.length === 0 && <span className="small muted">Ninguém no momento.</span>}
                  {d.map((x) => (
                    <div className="linha entre" key={x.nome}>
                      <span className="small">{x.nome}</span>
                      {x.link ? <a className="btn mini" href={x.link} target="_blank" rel="noreferrer">Enviar no WhatsApp</a> : <span className="chip aviso">Sem WhatsApp</span>}
                    </div>
                  ))}
                </>
              )}
            </div>
          )
        })}
      </div>
    </>
  )
}
