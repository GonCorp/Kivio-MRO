import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Campo } from '../components'
import { useAdm } from './AdminApp'
import type { Cidade, Fonte, Preco, Produto } from './tipos'
import { dataBR, diasDesde, hojeISO, reais } from './util'

export default function Precos() {
  const { avisar } = useAdm()
  const [cidades, setCidades] = useState<Cidade[]>([])
  const [cidade, setCidade] = useState('')
  const [fontes, setFontes] = useState<Fonte[]>([])
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [precos, setPrecos] = useState<Preco[]>([])
  const [nf, setNf] = useState('')
  const [np, setNp] = useState({ nome: '', unidade: '', categoria: 'Geral' })

  useEffect(() => {
    supabase.from('cidades').select('*').order('nome').then(({ data }) => {
      const l = (data || []) as Cidade[]
      setCidades(l); setCidade((c) => c || l.find((x) => x.ativa)?.nome || l[0]?.nome || '')
    })
  }, [])

  const carregar = useCallback(async () => {
    if (!cidade) return
    const [f, p] = await Promise.all([
      supabase.from('fontes_preco').select('*').eq('cidade', cidade).order('nome'),
      supabase.from('produtos_preco').select('*').eq('cidade', cidade).order('categoria').order('nome'),
    ])
    const fs = (f.data || []) as Fonte[]
    setFontes(fs); setProdutos((p.data || []) as Produto[])
    if (fs.length) {
      const { data } = await supabase.from('precos').select('*').in('fonte_id', fs.map((x) => x.id))
      setPrecos((data || []) as Preco[])
    } else setPrecos([])
  }, [cidade])
  useEffect(() => { carregar() }, [carregar])

  const valor = (f: string, p: string) => precos.find((x) => x.fonte_id === f && x.produto_id === p)?.valor
  const totais = useMemo(() => Object.fromEntries(fontes.map((f) => [f.id, produtos.reduce((s, p) => s + (valor(f.id, p.id) ?? 0), 0)])), [fontes, produtos, precos]) // eslint-disable-line react-hooks/exhaustive-deps
  const completas = fontes.filter((f) => produtos.length > 0 && produtos.every((p) => valor(f.id, p.id) !== undefined))
  const melhor = completas.length > 1 ? completas.reduce((a, b) => (totais[a.id] <= totais[b.id] ? a : b)).id : null

  async function gravar(f: Fonte, p: Produto, txt: string) {
    const t = txt.trim().replace(',', '.')
    if (t === '') {
      await supabase.from('precos').delete().eq('fonte_id', f.id).eq('produto_id', p.id)
    } else {
      const v = Number(t)
      if (Number.isNaN(v) || v < 0) return avisar('Preço inválido.', true)
      const { error } = await supabase.from('precos').upsert({ fonte_id: f.id, produto_id: p.id, valor: v })
      if (error) return avisar(error.message, true)
      await supabase.from('fontes_preco').update({ atualizado_em: hojeISO() }).eq('id', f.id)
    }
    carregar()
  }

  async function addFonte(e: React.FormEvent) {
    e.preventDefault()
    if (!nf.trim()) return
    const { error } = await supabase.from('fontes_preco').insert({ cidade, nome: nf.trim() })
    if (error) return avisar(error.message, true)
    setNf(''); carregar()
  }
  async function addProduto(e: React.FormEvent) {
    e.preventDefault()
    if (!np.nome.trim()) return
    const { error } = await supabase.from('produtos_preco').insert({ cidade, nome: np.nome.trim(), unidade: np.unidade.trim() || null, categoria: np.categoria.trim() || 'Geral' })
    if (error) return avisar(error.message, true)
    setNp({ ...np, nome: '', unidade: '' }); carregar()
  }
  async function apagar(tabela: 'fontes_preco' | 'produtos_preco', id: string, nome: string) {
    if (!confirm(`Remover ${nome}? Os preços ligados a ele também somem.`)) return
    const { error } = await supabase.from(tabela).delete().eq('id', id)
    if (error) return avisar(error.message, true)
    carregar()
  }

  return (
    <>
      <h1>Base de preços</h1>
      <p className="muted small">Compare quanto custa a cesta de produtos em cada mercado da região. Preencha os preços na tabela; o total por mercado aparece embaixo.</p>
      <Campo rotulo="Região">
        <select value={cidade} onChange={(e) => setCidade(e.target.value)}>{cidades.map((c) => <option key={c.nome} value={c.nome}>{c.nome}</option>)}</select>
      </Campo>

      <div className="grade-cards">
        <form className="card" onSubmit={addFonte}>
          <b>Novo mercado/fonte</b>
          <div className="linha"><input className="grow" placeholder="Ex.: Supermercado Central" value={nf} onChange={(e) => setNf(e.target.value)} /><button className="btn">Adicionar</button></div>
        </form>
        <form className="card" onSubmit={addProduto}>
          <b>Novo produto</b>
          <div className="grade2">
            <input placeholder="Nome (ex.: Arroz 5kg)" value={np.nome} onChange={(e) => setNp({ ...np, nome: e.target.value })} />
            <input placeholder="Unidade (ex.: pacote)" value={np.unidade} onChange={(e) => setNp({ ...np, unidade: e.target.value })} />
          </div>
          <div className="linha"><input className="grow" placeholder="Categoria" value={np.categoria} onChange={(e) => setNp({ ...np, categoria: e.target.value })} /><button className="btn">Adicionar</button></div>
        </form>
      </div>

      {fontes.length === 0 || produtos.length === 0 ? (
        <div className="card vazio">Cadastre ao menos um mercado e um produto para montar a tabela.</div>
      ) : (
        <div className="rolagem">
          <table className="tabela">
            <thead>
              <tr>
                <th>Produto</th>
                {fontes.map((f) => {
                  const velho = diasDesde(f.atualizado_em) > 30
                  return (
                    <th key={f.id}>
                      {f.nome}<br /><span className={'chip ' + (velho ? 'aviso' : '')}>{velho ? 'desatualizado · ' : ''}{dataBR(f.atualizado_em)}</span><br />
                      <button className="btn mini perigo" style={{ marginTop: 4 }} onClick={() => apagar('fontes_preco', f.id, f.nome)}>Remover</button>
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {produtos.map((p) => (
                <tr key={p.id}>
                  <td>{p.nome}<br /><span className="small muted">{p.categoria}{p.unidade ? ' · ' + p.unidade : ''} · <button className="btn mini" onClick={() => apagar('produtos_preco', p.id, p.nome)}>remover</button></span></td>
                  {fontes.map((f) => (
                    <td key={f.id}><input inputMode="decimal" aria-label={`${p.nome} em ${f.nome}`} defaultValue={valor(f.id, p.id) ?? ''} key={f.id + p.id + (valor(f.id, p.id) ?? '')} onBlur={(e) => { if (e.target.value !== String(valor(f.id, p.id) ?? '')) gravar(f, p, e.target.value) }} /></td>
                  ))}
                </tr>
              ))}
              <tr>
                <td><b>Total da cesta</b></td>
                {fontes.map((f) => <td key={f.id} className={f.id === melhor ? 'menor' : ''}><b>{reais(totais[f.id])}</b>{f.id === melhor && <><br /><span className="small">mais barato</span></>}</td>)}
              </tr>
            </tbody>
          </table>
        </div>
      )}
      <span className="small muted">Mercado só entra na comparação de “mais barato” quando todos os produtos têm preço nele.</span>
    </>
  )
}
