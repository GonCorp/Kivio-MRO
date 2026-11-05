import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Campo } from '../components'
import { useAdm } from './AdminApp'
import type { Aviso, Cidade } from './tipos'
import { dataBR } from './util'

export default function Regioes() {
  const { avisar } = useAdm()
  const [cidades, setCidades] = useState<Cidade[]>([])
  const [avisos, setAvisos] = useState<Aviso[]>([])
  const [nova, setNova] = useState('')
  const [texto, setTexto] = useState('')
  const [link, setLink] = useState('')
  const [dest, setDest] = useState('')
  const [dias, setDias] = useState('7')

  const carregar = useCallback(async () => {
    const [c, a] = await Promise.all([supabase.from('cidades').select('*').order('nome'), supabase.from('avisos').select('*').order('created_at', { ascending: false })])
    setCidades((c.data || []) as Cidade[])
    setAvisos((a.data || []) as Aviso[])
  }, [])
  useEffect(() => { carregar() }, [carregar])

  async function rpc(fn: string, args: Record<string, unknown>, ok: string) {
    const { error } = await supabase.rpc(fn, args)
    if (error) return avisar(error.message, true)
    avisar(ok); carregar()
  }

  async function publicar(e: React.FormEvent) {
    e.preventDefault()
    if (texto.trim().length < 3) return avisar('Escreva o aviso.', true)
    const expira = dias === '0' ? null : new Date(Date.now() + Number(dias) * 86400000).toISOString()
    const { error } = await supabase.from('avisos').insert({ texto: texto.trim(), link: link.trim() || null, cidade: dest || null, expira_em: expira })
    if (error) return avisar(error.message, true)
    setTexto(''); setLink(''); avisar('Aviso publicado.'); carregar()
  }

  async function apagar(id: string) {
    const { error } = await supabase.from('avisos').delete().eq('id', id)
    if (error) return avisar(error.message, true)
    avisar('Aviso removido.'); carregar()
  }

  const vigente = (a: Aviso) => !a.expira_em || Date.parse(a.expira_em) > Date.now()

  return (
    <>
      <h1>Regiões e avisos</h1>

      <section className="pilha">
        <h2>Regiões</h2>
        <p className="muted small">Só as regiões ligadas aparecem para quem cria república. Hoje só Itabira/MG deve estar ligada.</p>
        <div className="card">
          {cidades.map((c) => (
            <label key={c.nome} className="linha entre">
              <span>{c.nome} <span className={'chip ' + (c.ativa ? 'ok' : '')}>{c.ativa ? 'ligada' : 'desligada'}</span></span>
              <input type="checkbox" checked={c.ativa} onChange={(e) => rpc('admin_ativar_cidade', { p_cidade: c.nome, p_ativa: e.target.checked }, 'Região atualizada.')} />
            </label>
          ))}
          <form className="linha" onSubmit={(e) => { e.preventDefault(); if (nova.trim()) rpc('admin_adicionar_cidade', { p_nome: nova }, 'Região adicionada (desligada).').then(() => setNova('')) }}>
            <input className="grow" placeholder="Nova região, ex.: Ouro Preto/MG" value={nova} onChange={(e) => setNova(e.target.value)} />
            <button className="btn">Adicionar</button>
          </form>
        </div>
      </section>

      <section className="pilha">
        <h2>Avisos por região</h2>
        <p className="muted small">Aparecem no início do app das repúblicas da região escolhida, até o prazo acabar.</p>
        <form className="card" onSubmit={publicar}>
          <Campo rotulo="Aviso"><textarea value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={300} placeholder="Ex.: Manutenção do app sábado às 8h." /></Campo>
          <div className="grade2">
            <Campo rotulo="Para quem">
              <select value={dest} onChange={(e) => setDest(e.target.value)}>
                <option value="">Todas as regiões</option>
                {cidades.map((c) => <option key={c.nome} value={c.nome}>{c.nome}</option>)}
              </select>
            </Campo>
            <Campo rotulo="Fica no ar por">
              <select value={dias} onChange={(e) => setDias(e.target.value)}>
                <option value="1">1 dia</option><option value="3">3 dias</option><option value="7">7 dias</option><option value="30">30 dias</option><option value="0">Sem prazo</option>
              </select>
            </Campo>
          </div>
          <Campo rotulo="Link (opcional)"><input type="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://" /></Campo>
          <button className="btn primario">Publicar aviso</button>
        </form>
        <div className="grade-cards">
          {avisos.length === 0 && <div className="card vazio">Nenhum aviso publicado.</div>}
          {avisos.map((a) => (
            <div className="card" key={a.id}>
              <div className="linha entre"><span className={'chip ' + (vigente(a) ? 'ok' : '')}>{vigente(a) ? 'no ar' : 'expirado'}</span><span className="small muted">{a.cidade || 'Todas as regiões'}</span></div>
              <p>{a.texto}</p>
              {a.link && <a className="small" href={a.link} target="_blank" rel="noreferrer">{a.link}</a>}
              <div className="linha entre"><span className="small muted">{a.expira_em ? 'até ' + dataBR(a.expira_em) : 'sem prazo'}</span><button className="btn mini perigo" onClick={() => apagar(a.id)}>Remover</button></div>
            </div>
          ))}
        </div>
      </section>
    </>
  )
}
