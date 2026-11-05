import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Campo, Folha } from '../components'
import { useAdm } from './AdminApp'
import type { Interessada, Modelo, PlanoCfg, RepAdmin } from './tipos'
import { NOME_PLANO, SITUACAO, dataBR, preencher, reais, waLink } from './util'

const FILTROS = [
  { id: '', nome: 'Todas' }, { id: 'em_dia', nome: 'Em dia' }, { id: 'vence_em_breve', nome: 'Vence em breve' },
  { id: 'atrasada', nome: 'Atrasadas' }, { id: 'sem_vencimento', nome: 'Sem vencimento' }, { id: 'gratis', nome: 'Grátis' },
  { id: 'whatsapp', nome: 'WhatsApp pendente' }, { id: 'bloqueada', nome: 'Bloqueadas' }, { id: 'interessadas', nome: 'Interessadas' },
]

export function vars(r: RepAdmin, planos: PlanoCfg[]): Record<string, string> {
  const p = planos.find((x) => x.id === r.plano)
  return {
    lider: (r.lider_nome || 'tudo bem').split(' ')[0], republica: r.nome, plano: NOME_PLANO[r.plano],
    valor: reais(r.valor_mensalidade ?? p?.preco_mensal ?? 0), vencimento: dataBR(r.vencimento),
  }
}

export default function Contatos() {
  const { avisar, filtro } = useAdm()
  const [reps, setReps] = useState<RepAdmin[]>([])
  const [inter, setInter] = useState<Interessada[]>([])
  const [modelos, setModelos] = useState<Modelo[]>([])
  const [planos, setPlanos] = useState<PlanoCfg[]>([])
  const [busca, setBusca] = useState('')
  const [fil, setFil] = useState(filtro)
  const [edit, setEdit] = useState<RepAdmin | null>(null)
  const [novaInt, setNovaInt] = useState<Partial<Interessada> | null>(null)

  const carregar = useCallback(async () => {
    const [a, b, c, d] = await Promise.all([
      supabase.rpc('admin_listar_republicas'), supabase.from('interessadas').select('*').order('created_at', { ascending: false }),
      supabase.from('mensagens_modelo').select('*'), supabase.from('planos').select('*'),
    ])
    if (a.error) avisar(a.error.message, true)
    setReps((a.data || []) as RepAdmin[]); setInter((b.data || []) as Interessada[])
    setModelos((c.data || []) as Modelo[]); setPlanos((d.data || []) as PlanoCfg[])
  }, [avisar])
  useEffect(() => { carregar() }, [carregar])

  async function rpc(fn: string, args: Record<string, unknown>, ok: string) {
    const { error } = await supabase.rpc(fn, args)
    if (error) return avisar(error.message, true)
    avisar(ok); await carregar()
  }

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return reps.filter((r) => {
      if (q && !(r.nome + ' ' + (r.lider_nome || '') + ' ' + r.cidade).toLowerCase().includes(q)) return false
      if (!fil || fil === 'interessadas') return true
      if (fil === 'whatsapp') return r.whatsapp_status !== 'verificado'
      if (fil === 'bloqueada') return !r.ativo
      return r.situacao === fil
    })
  }, [reps, busca, fil])

  const modelo = (id: string) => modelos.find((m) => m.id === id)
  function msgPara(r: RepAdmin): string {
    const id = r.situacao === 'atrasada' ? 'atraso' : r.situacao === 'vence_em_breve' ? 'venc' : 'boas_vindas'
    return preencher(modelo(id)?.texto || 'Oi, {lider}!', vars(r, planos))
  }

  async function salvarInteressada(e: React.FormEvent) {
    e.preventDefault()
    if (!novaInt?.republica?.trim()) return avisar('Informe o nome da república.', true)
    const { id, created_at, ...resto } = novaInt as Interessada
    void created_at
    const { error } = id ? await supabase.from('interessadas').update(resto).eq('id', id) : await supabase.from('interessadas').insert(resto)
    if (error) return avisar(error.message, true)
    setNovaInt(null); avisar('Salvo.'); carregar()
  }
  async function marcar(i: Interessada, campos: Partial<Interessada>) {
    const { error } = await supabase.from('interessadas').update(campos).eq('id', i.id)
    if (error) return avisar(error.message, true)
    carregar()
  }
  async function remover(i: Interessada) {
    if (!confirm(`Remover ${i.republica} da lista?`)) return
    await supabase.from('interessadas').delete().eq('id', i.id)
    carregar()
  }

  return (
    <>
      <h1>Repúblicas e contatos</h1>
      <div className="linha quebra">
        <input className="grow" style={{ minWidth: 200 }} placeholder="Buscar por república, líder ou cidade" value={busca} onChange={(e) => setBusca(e.target.value)} />
      </div>
      <div className="linha quebra">
        {FILTROS.map((f) => <button key={f.id} className={'btn mini' + (fil === f.id ? ' primario' : '')} onClick={() => setFil(f.id)}>{f.nome}</button>)}
      </div>

      {fil !== 'interessadas' && (
        <div className="grade-cards">
          {lista.length === 0 && <div className="card vazio">Nenhuma república nesse filtro.</div>}
          {lista.map((r) => {
            const link = waLink(r.whatsapp_lider, msgPara(r))
            return (
              <div className="card" key={r.id} style={r.ativo ? undefined : { borderColor: 'var(--ruim-fg)' }}>
                <div className="linha entre">
                  <b>{r.nome}</b>
                  <span className={'chip ' + (r.ativo ? SITUACAO[r.situacao].chip : 'ruim')}>{r.ativo ? SITUACAO[r.situacao].nome : 'Bloqueada'}</span>
                </div>
                <span className="small muted">{r.cidade} · líder {r.lider_nome || '—'} · {r.integrantes}/{r.limite_membros} integrante(s)</span>
                <span className="small">Plano <b>{NOME_PLANO[r.plano]}</b>{r.plano !== 'gratis' && <> · vence {dataBR(r.vencimento)} · {reais(r.valor_mensalidade ?? planos.find((p) => p.id === r.plano)?.preco_mensal)}</>}</span>
                {r.nota_admin && <span className="small muted">“{r.nota_admin}”</span>}
                <div className="linha quebra">
                  <span className={'chip ' + (r.whatsapp_status === 'verificado' ? 'ok' : 'aviso')}>{r.whatsapp_status === 'verificado' ? 'WhatsApp verificado' : 'WhatsApp pendente'}</span>
                  {r.contatado && <span className="chip ok">Contatado</span>}
                </div>
                <div className="linha quebra">
                  {link && <a className="btn mini" href={link} target="_blank" rel="noreferrer">Chamar no WhatsApp</a>}
                  <button className="btn mini" onClick={() => setEdit(r)}>Detalhes</button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {(fil === '' || fil === 'interessadas') && (
        <section className="pilha">
          <div className="linha entre"><h2>Interessadas ({inter.filter((i) => !i.convertida).length})</h2>
            <button className="btn mini primario" onClick={() => setNovaInt({ republica: '', contatado: false, convertida: false })}>Adicionar</button></div>
          <p className="muted small">Repúblicas que demonstraram interesse mas ainda não criaram conta.</p>
          <div className="grade-cards">
            {inter.length === 0 && <div className="card vazio">Ninguém na lista.</div>}
            {inter.map((i) => {
              const link = waLink(i.telefone, preencher(modelo('interessada')?.texto || 'Oi, {lider}!', { lider: (i.lider || 'tudo bem').split(' ')[0], republica: i.republica }))
              return (
                <div className="card" key={i.id}>
                  <div className="linha entre"><b>{i.republica}</b>{i.convertida ? <span className="chip ok">Virou assinante</span> : i.contatado ? <span className="chip">Contatada</span> : <span className="chip aviso">Sem contato</span>}</div>
                  <span className="small muted">{[i.lider, i.cidade, i.telefone, i.email].filter(Boolean).join(' · ') || 'Sem dados de contato'}</span>
                  {i.nota && <span className="small">“{i.nota}”</span>}
                  <div className="linha quebra">
                    {link && <a className="btn mini" href={link} target="_blank" rel="noreferrer">Chamar</a>}
                    {!i.contatado && <button className="btn mini" onClick={() => marcar(i, { contatado: true })}>Marcar contatada</button>}
                    {!i.convertida && <button className="btn mini primario" onClick={() => marcar(i, { convertida: true, contatado: true })}>Virou assinante</button>}
                    <button className="btn mini" onClick={() => setNovaInt(i)}>Editar</button>
                    <button className="btn mini perigo" onClick={() => remover(i)}>Remover</button>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {novaInt && (
        <Folha titulo={novaInt.id ? 'Editar interessada' : 'Nova interessada'} onFechar={() => setNovaInt(null)}>
          <form className="pilha" onSubmit={salvarInteressada}>
            <Campo rotulo="República"><input value={novaInt.republica || ''} onChange={(e) => setNovaInt({ ...novaInt, republica: e.target.value })} required /></Campo>
            <Campo rotulo="Nome do contato"><input value={novaInt.lider || ''} onChange={(e) => setNovaInt({ ...novaInt, lider: e.target.value })} /></Campo>
            <div className="grade2">
              <Campo rotulo="WhatsApp"><input inputMode="tel" value={novaInt.telefone || ''} onChange={(e) => setNovaInt({ ...novaInt, telefone: e.target.value })} /></Campo>
              <Campo rotulo="Cidade"><input value={novaInt.cidade || ''} onChange={(e) => setNovaInt({ ...novaInt, cidade: e.target.value || null })} placeholder="Itabira/MG" /></Campo>
            </div>
            <Campo rotulo="E-mail"><input type="email" value={novaInt.email || ''} onChange={(e) => setNovaInt({ ...novaInt, email: e.target.value })} /></Campo>
            <Campo rotulo="Anotação"><textarea value={novaInt.nota || ''} onChange={(e) => setNovaInt({ ...novaInt, nota: e.target.value })} /></Campo>
            <button className="btn primario">Salvar</button>
          </form>
        </Folha>
      )}

      {edit && (
        <Detalhe r={reps.find((x) => x.id === edit.id) || edit} planos={planos} msg={msgPara(edit)} rpc={rpc} onFechar={() => setEdit(null)} />
      )}
    </>
  )
}

function Detalhe({ r, planos, msg, rpc, onFechar }: {
  r: RepAdmin; planos: PlanoCfg[]; msg: string; onFechar: () => void
  rpc: (fn: string, args: Record<string, unknown>, ok: string) => Promise<void>
}) {
  const [nota, setNota] = useState(r.nota_admin || '')
  const [contatado, setContatado] = useState(r.contatado)
  const [venc, setVenc] = useState(r.vencimento || '')
  const [valor, setValor] = useState(r.valor_mensalidade != null ? String(r.valor_mensalidade) : '')
  const link = waLink(r.whatsapp_lider, msg)

  return (
    <Folha titulo={r.nome} onFechar={onFechar}>
      <span className="small muted">{r.cidade} · líder {r.lider_nome || '—'} · WhatsApp {r.whatsapp_lider || '—'} · criada em {dataBR(r.created_at)}</span>

      <Campo rotulo="Plano">
        <select value={r.plano} onChange={(e) => {
          const p = planos.find((x) => x.id === e.target.value)
          rpc('admin_set_plano', { p_rep: r.id, p_plano: e.target.value, p_limite: p?.limite_membros ?? (e.target.value === 'gratis' ? 7 : 30) }, 'Plano alterado.')
        }}>
          {planos.map((p) => <option key={p.id} value={p.id}>{p.nome} (até {p.limite_membros})</option>)}
        </select>
      </Campo>

      <div className="grade2">
        <Campo rotulo="Vencimento"><input type="date" value={venc} onChange={(e) => setVenc(e.target.value)} /></Campo>
        <Campo rotulo="Valor combinado (R$)"><input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="usa o do plano" /></Campo>
      </div>
      <Campo rotulo="Anotações suas (só você vê)"><textarea value={nota} onChange={(e) => setNota(e.target.value)} /></Campo>
      <label className="linha"><input type="checkbox" checked={contatado} onChange={(e) => setContatado(e.target.checked)} /> Já entrei em contato</label>
      <button className="btn primario" onClick={() => {
        const v = valor.trim() === '' ? null : Number(valor.replace(',', '.'))
        if (v !== null && Number.isNaN(v)) return alert('Valor inválido.')
        rpc('admin_atualizar_republica', { p_rep: r.id, p_nota: nota, p_contatado: contatado, p_vencimento: venc || null, p_valor: v }, 'Salvo.')
      }}>Salvar dados</button>

      {r.plano !== 'gratis' && (
        <button className="btn" onClick={() => rpc('admin_registrar_pagamento', { p_rep: r.id }, 'Pagamento registrado: vencimento +1 mês.').then(onFechar)}>Marcar como pago (+1 mês)</button>
      )}

      <div className="pre">{msg}</div>
      <div className="linha quebra">
        {link && <a className="btn" href={link} target="_blank" rel="noreferrer">Enviar no WhatsApp</a>}
        {r.whatsapp_status !== 'verificado' && (
          <button className="btn" onClick={() => rpc('admin_verificar_whatsapp', { p_rep: r.id, p_ok: true }, 'WhatsApp verificado.')}>Marcar WhatsApp verificado</button>
        )}
      </div>
      {r.whatsapp_status !== 'verificado' && <span className="small muted">Código que o líder deve enviar para o número oficial: <b style={{ letterSpacing: '0.12em' }}>{r.codigo_verificacao}</b></span>}

      <button className={'btn ' + (r.ativo ? 'perigo' : 'primario')} onClick={() => confirm(r.ativo ? `Bloquear ${r.nome}? Ninguém da república conseguirá usar o app.` : `Liberar ${r.nome}?`) &&
        rpc('admin_set_ativo', { p_rep: r.id, p_ativo: !r.ativo }, r.ativo ? 'República bloqueada.' : 'República liberada.')}>
        {r.ativo ? 'Bloquear acesso' : 'Liberar acesso'}
      </button>
    </Folha>
  )
}
