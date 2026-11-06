import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { nomeDoMembro, useApp } from '../lib/contexto'
import type { Cobranca, CobrancaItem, Conta, Lancamento, MinhaCobranca, SaldoConta } from '../lib/tipos'
import { dataCurta, hoje, reais } from '../lib/datas'
import { lerValor } from '../lib/dinheiro'
import { Campo, Folha } from '../components'

type Sub = 'contas' | 'lanc' | 'cobr' | 'minhas'
const TIPOS = { casa: 'Casa', festa: 'Festa', caixinha: 'Caixinha', outro: 'Outro' } as const

export default function Financas({ intencao = '' }: { intencao?: string }) {
  const app = useApp()
  const gerente = app.funcao('financeiro')
  const [sub, setSub] = useState<Sub>(gerente ? (intencao === 'cobranca' ? 'cobr' : intencao === 'despesa' || intencao === 'receita' ? 'lanc' : 'contas') : 'minhas')

  return (
    <>
      <span hidden />
      {gerente && (
        <div className="seg" role="group" aria-label="Seções">
          {([['contas', 'Contas'], ['lanc', 'Lançamentos'], ['cobr', 'Cobranças'], ['minhas', 'Minhas']] as [Sub, string][]).map(([id, nome]) => (
            <button key={id} aria-pressed={sub === id} onClick={() => setSub(id)}>{nome}</button>
          ))}
        </div>
      )}
      {sub === 'contas' && gerente && <Contas />}
      {sub === 'lanc' && gerente && <Lancamentos />}
      {sub === 'cobr' && gerente && <Cobrancas />}
      {sub === 'minhas' && <Minhas />}
    </>
  )
}

/* ------------------------------------------------------------ Contas */
function Contas() {
  const app = useApp()
  const rep = app.republica!
  const [saldos, setSaldos] = useState<SaldoConta[]>([])
  const [nova, setNova] = useState(false)
  const [f, setF] = useState({ nome: '', tipo: 'casa', saldo: '' })

  const carregar = useCallback(async () => {
    const { data } = await supabase.rpc('saldos_contas', { p_rep: rep.id })
    setSaldos(((data || []) as SaldoConta[]).map((s) => ({ ...s, saldo: Number(s.saldo), entradas: Number(s.entradas), saidas: Number(s.saidas), movimentos: Number(s.movimentos) })))
  }, [rep.id])
  useEffect(() => { carregar() }, [carregar])

  async function criar(e: React.FormEvent) {
    e.preventDefault()
    const saldo = f.saldo.trim() === '' ? 0 : lerValor(f.saldo)
    if (saldo === null) return app.avisar('Saldo inicial inválido.', true)
    const { error } = await supabase.rpc('criar_conta', { p_rep: rep.id, p_nome: f.nome, p_tipo: f.tipo, p_saldo: saldo })
    if (error) return app.avisar(error.message, true)
    setNova(false); setF({ nome: '', tipo: 'casa', saldo: '' }); app.avisar('Conta criada.'); carregar()
  }
  async function remover(s: SaldoConta) {
    if (!confirm(`Remover a conta ${s.nome}?`)) return
    const { error } = await supabase.rpc('remover_conta', { p_conta: s.conta_id })
    if (error) return app.avisar(error.message, true)
    app.avisar('Conta removida.'); carregar()
  }

  const total = saldos.reduce((t, s) => t + s.saldo, 0)
  return (
    <>
      <div className="card">
        <span className="muted small">Saldo total das contas</span>
        <span className={'num' + (total < 0 ? ' ruim' : '')}>{reais(total)}</span>
      </div>
      <div className="linha entre"><h2>Saldo por conta</h2><button className="btn mini primario" onClick={() => setNova(true)}>Nova conta</button></div>
      {saldos.length === 0 && <div className="card vazio">Crie a primeira conta (ex.: Caixa da casa, Caixa da festa) para começar a lançar.</div>}
      {saldos.map((s) => (
        <div className="card" key={s.conta_id}>
          <div className="linha entre"><b>{s.nome}</b><span className="chip">{TIPOS[s.tipo]}</span></div>
          <span className={'num' + (s.saldo < 0 ? ' ruim' : '')}>{reais(s.saldo)}</span>
          <span className="small muted">Entradas {reais(s.entradas)} · saídas {reais(s.saidas)} · inicial {reais(s.saldo_inicial)}</span>
          {s.movimentos === 0 && <div><button className="btn mini perigo" onClick={() => remover(s)}>Remover conta</button></div>}
        </div>
      ))}
      {nova && (
        <Folha titulo="Nova conta" onFechar={() => setNova(false)}>
          <form className="pilha" onSubmit={criar}>
            <Campo rotulo="Nome da conta"><input value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} placeholder="Ex.: Caixa da casa" required /></Campo>
            <Campo rotulo="Tipo">
              <select value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })}>{Object.entries(TIPOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            </Campo>
            <Campo rotulo="Saldo inicial (R$)"><input inputMode="decimal" value={f.saldo} onChange={(e) => setF({ ...f, saldo: e.target.value })} placeholder="0,00" /></Campo>
            <button className="btn primario">Criar conta</button>
          </form>
        </Folha>
      )}
    </>
  )
}

/* ------------------------------------------------------- Lançamentos */
function Lancamentos() {
  const app = useApp()
  const rep = app.republica!
  const [contas, setContas] = useState<Conta[]>([])
  const [lancs, setLancs] = useState<Lancamento[]>([])
  const [filtro, setFiltro] = useState('')
  const [novo, setNovo] = useState(false)
  const [f, setF] = useState({ conta: '', tipo: 'despesa', valor: '', desc: '', cat: '', data: hoje() })

  const carregar = useCallback(async () => {
    const [c, l] = await Promise.all([
      supabase.from('contas').select('*').eq('republica_id', rep.id).order('created_at'),
      supabase.from('lancamentos').select('*').eq('republica_id', rep.id).order('data', { ascending: false }).order('created_at', { ascending: false }).limit(200),
    ])
    setContas((c.data || []) as Conta[]); setLancs(((l.data || []) as Lancamento[]).map((x) => ({ ...x, valor: Number(x.valor) })))
  }, [rep.id])
  useEffect(() => { carregar() }, [carregar])

  async function criar(e: React.FormEvent) {
    e.preventDefault()
    const v = lerValor(f.valor)
    if (v === null || v <= 0) return app.avisar('Informe um valor maior que zero.', true)
    const { error } = await supabase.rpc('lancar', { p_rep: rep.id, p_conta: f.conta || contas[0]?.id, p_tipo: f.tipo, p_valor: v, p_desc: f.desc, p_categoria: f.cat, p_data: f.data })
    if (error) return app.avisar(error.message, true)
    setNovo(false); setF({ ...f, valor: '', desc: '', cat: '' }); app.avisar('Lançamento salvo.'); carregar()
  }
  async function remover(l: Lancamento) {
    if (!confirm(`Remover "${l.descricao}"?`)) return
    const { error } = await supabase.rpc('remover_lancamento', { p_id: l.id })
    if (error) return app.avisar(error.message, true)
    app.avisar('Lançamento removido.'); carregar()
  }

  const lista = lancs.filter((l) => !filtro || l.conta_id === filtro)
  const nomeConta = (id: string) => contas.find((c) => c.id === id)?.nome || 'Conta'
  return (
    <>
      <div className="linha entre quebra">
        <select aria-label="Conta" style={{ width: 'auto', minWidth: 160 }} value={filtro} onChange={(e) => setFiltro(e.target.value)}>
          <option value="">Todas as contas</option>{contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
        <button className="btn mini primario" disabled={contas.length === 0} onClick={() => setNovo(true)}>Novo lançamento</button>
      </div>
      {contas.length === 0 && <div className="card vazio">Crie uma conta em “Contas” antes de lançar.</div>}
      {contas.length > 0 && lista.length === 0 && <div className="card vazio">Nenhum lançamento ainda.</div>}
      {lista.map((l) => (
        <div className="card" key={l.id}>
          <div className="linha entre">
            <b>{l.descricao}</b>
            <b style={{ color: l.tipo === 'receita' ? 'var(--ok-fg)' : 'var(--ruim-fg)' }}>{l.tipo === 'receita' ? '+' : '−'} {reais(l.valor)}</b>
          </div>
          <div className="linha entre">
            <span className="small muted">{dataCurta(l.data)} · {nomeConta(l.conta_id)}{l.categoria ? ' · ' + l.categoria : ''}{l.origem !== 'manual' ? ' · automático' : ''}</span>
            {l.origem === 'manual' && <button className="btn mini perigo" onClick={() => remover(l)}>Remover</button>}
          </div>
        </div>
      ))}
      {novo && (
        <Folha titulo="Novo lançamento" onFechar={() => setNovo(false)}>
          <form className="pilha" onSubmit={criar}>
            <div className="seg" role="group" aria-label="Tipo">
              <button type="button" aria-pressed={f.tipo === 'despesa'} onClick={() => setF({ ...f, tipo: 'despesa' })}>Despesa</button>
              <button type="button" aria-pressed={f.tipo === 'receita'} onClick={() => setF({ ...f, tipo: 'receita' })}>Receita</button>
            </div>
            <Campo rotulo="Conta"><select value={f.conta || contas[0]?.id} onChange={(e) => setF({ ...f, conta: e.target.value })}>{contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></Campo>
            <Campo rotulo="Valor (R$)"><input inputMode="decimal" value={f.valor} onChange={(e) => setF({ ...f, valor: e.target.value })} required /></Campo>
            <Campo rotulo="Descrição"><input value={f.desc} onChange={(e) => setF({ ...f, desc: e.target.value })} placeholder="Ex.: Conta de luz" required /></Campo>
            <div className="grade2">
              <Campo rotulo="Categoria (opcional)"><input value={f.cat} onChange={(e) => setF({ ...f, cat: e.target.value })} placeholder="Ex.: Contas" /></Campo>
              <Campo rotulo="Data"><input type="date" value={f.data} onChange={(e) => setF({ ...f, data: e.target.value })} /></Campo>
            </div>
            <button className="btn primario">Salvar lançamento</button>
          </form>
        </Folha>
      )}
    </>
  )
}

/* --------------------------------------------------------- Cobranças */
function Cobrancas() {
  const app = useApp()
  const rep = app.republica!
  const [cobs, setCobs] = useState<Cobranca[]>([])
  const [itens, setItens] = useState<CobrancaItem[]>([])
  const [contas, setContas] = useState<Conta[]>([])
  const [aberta, setAberta] = useState<string | null>(null)
  const [nova, setNova] = useState(false)
  const ativos = useMemo(() => app.membros.filter((m) => m.ativo), [app.membros])
  const [f, setF] = useState({ titulo: '', modo: 'pessoa', valor: '', venc: '', conta: '', sel: [] as string[] })

  const carregar = useCallback(async () => {
    const [c, i, ct] = await Promise.all([
      supabase.from('cobrancas').select('*').eq('republica_id', rep.id).order('created_at', { ascending: false }),
      supabase.from('cobranca_itens').select('*').eq('republica_id', rep.id),
      supabase.from('contas').select('*').eq('republica_id', rep.id).order('created_at'),
    ])
    setCobs(((c.data || []) as Cobranca[]).map((x) => ({ ...x, valor: Number(x.valor) })))
    setItens(((i.data || []) as CobrancaItem[]).map((x) => ({ ...x, valor: Number(x.valor) })))
    setContas((ct.data || []) as Conta[])
  }, [rep.id])
  useEffect(() => { carregar() }, [carregar])

  function abrirNova() {
    setF({ titulo: '', modo: 'pessoa', valor: '', venc: '', conta: contas[0]?.id || '', sel: ativos.map((m) => m.id) })
    setNova(true)
  }
  async function criar(e: React.FormEvent) {
    e.preventDefault()
    const v = lerValor(f.valor)
    if (v === null || v <= 0) return app.avisar('Informe o valor.', true)
    if (f.sel.length === 0) return app.avisar('Escolha ao menos um integrante.', true)
    const porPessoa = f.modo === 'total' ? Math.round((v / f.sel.length) * 100) / 100 : v
    const { error } = await supabase.rpc('criar_cobranca', { p_rep: rep.id, p_titulo: f.titulo, p_valor: porPessoa, p_venc: f.venc || null, p_conta: f.conta || contas[0]?.id, p_membros: f.sel })
    if (error) return app.avisar(error.message, true)
    setNova(false); app.avisar(`Cobrança criada: ${reais(porPessoa)} por pessoa.`); carregar()
  }
  async function pagar(it: CobrancaItem, pago: boolean) {
    const { error } = await supabase.rpc('marcar_pago', { p_item: it.id, p_pago: pago })
    if (error) return app.avisar(error.message, true)
    carregar()
  }
  async function remover(c: Cobranca) {
    if (!confirm(`Remover a cobrança "${c.titulo}"?`)) return
    const { error } = await supabase.rpc('remover_cobranca', { p_cob: c.id })
    if (error) return app.avisar(error.message, true)
    app.avisar('Cobrança removida.'); carregar()
  }

  const previa = (() => { const v = lerValor(f.valor); return v && f.sel.length ? (f.modo === 'total' ? v / f.sel.length : v) : null })()
  return (
    <>
      <div className="linha entre"><h2>Cobranças</h2><button className="btn mini primario" disabled={contas.length === 0} onClick={abrirNova}>Nova cobrança</button></div>
      {contas.length === 0 && <div className="card vazio">Crie uma conta em “Contas”: é nela que o dinheiro das cobranças entra.</div>}
      {contas.length > 0 && cobs.length === 0 && <div className="card vazio">Nenhuma cobrança ainda. Crie a mensalidade ou a caixinha e marque quem já pagou.</div>}
      {cobs.map((c) => {
        const its = itens.filter((i) => i.cobranca_id === c.id)
        const pagos = its.filter((i) => i.pago).length
        const atrasada = c.vencimento && c.vencimento < hoje() && pagos < its.length
        return (
          <div className="card" key={c.id}>
            <button className="linha entre" style={{ background: 'none', border: 0, padding: 0, textAlign: 'left' }} onClick={() => setAberta(aberta === c.id ? null : c.id)}>
              <span className="grow"><b>{c.titulo}</b><br /><span className="small muted">{reais(c.valor)} por pessoa{c.vencimento ? ' · vence ' + dataCurta(c.vencimento) : ''}</span></span>
              <span className={'chip ' + (pagos === its.length ? 'ok' : atrasada ? 'ruim' : 'aviso')}>{pagos}/{its.length} pagos</span>
            </button>
            {aberta === c.id && (
              <>
                {its.map((i) => (
                  <label key={i.id} className="linha entre">
                    <span>{nomeDoMembro(app, i.membro_id)}</span>
                    <span className="linha"><span className="small muted">{i.pago ? 'pago' : 'em aberto'}</span>
                      <input type="checkbox" checked={i.pago} onChange={(e) => pagar(i, e.target.checked)} aria-label={'Pago: ' + nomeDoMembro(app, i.membro_id)} /></span>
                  </label>
                ))}
                {pagos === 0 && <div><button className="btn mini perigo" onClick={() => remover(c)}>Remover cobrança</button></div>}
              </>
            )}
          </div>
        )
      })}
      {nova && (
        <Folha titulo="Nova cobrança" onFechar={() => setNova(false)}>
          <form className="pilha" onSubmit={criar}>
            <Campo rotulo="Nome"><input value={f.titulo} onChange={(e) => setF({ ...f, titulo: e.target.value })} placeholder="Ex.: Mensalidade de novembro" required /></Campo>
            <div className="seg" role="group" aria-label="Como dividir">
              <button type="button" aria-pressed={f.modo === 'pessoa'} onClick={() => setF({ ...f, modo: 'pessoa' })}>Valor por pessoa</button>
              <button type="button" aria-pressed={f.modo === 'total'} onClick={() => setF({ ...f, modo: 'total' })}>Dividir um total</button>
            </div>
            <Campo rotulo={f.modo === 'total' ? 'Valor total (R$)' : 'Valor por pessoa (R$)'}><input inputMode="decimal" value={f.valor} onChange={(e) => setF({ ...f, valor: e.target.value })} required /></Campo>
            {previa !== null && <span className="chip ok" style={{ alignSelf: 'flex-start' }}>{reais(previa)} por pessoa · {f.sel.length} pessoa(s)</span>}
            <div className="grade2">
              <Campo rotulo="Vencimento"><input type="date" value={f.venc} onChange={(e) => setF({ ...f, venc: e.target.value })} /></Campo>
              <Campo rotulo="Entra na conta"><select value={f.conta} onChange={(e) => setF({ ...f, conta: e.target.value })}>{contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></Campo>
            </div>
            <b className="small">Quem paga</b>
            {ativos.map((m) => (
              <label key={m.id} className="linha"><input type="checkbox" checked={f.sel.includes(m.id)} onChange={(e) => setF({ ...f, sel: e.target.checked ? [...f.sel, m.id] : f.sel.filter((x) => x !== m.id) })} />{nomeDoMembro(app, m.id)}</label>
            ))}
            <button className="btn primario">Criar cobrança</button>
          </form>
        </Folha>
      )}
    </>
  )
}

/* ------------------------------------------------------------ Minhas */
function Minhas() {
  const app = useApp()
  const [itens, setItens] = useState<MinhaCobranca[]>([])
  const [carregado, setCarregado] = useState(false)
  useEffect(() => {
    supabase.rpc('minhas_cobrancas', { p_rep: app.republica!.id }).then(({ data }) => {
      setItens(((data || []) as MinhaCobranca[]).map((x) => ({ ...x, valor: Number(x.valor) }))); setCarregado(true)
    })
  }, [app.republica])
  const devendo = itens.filter((i) => !i.pago).reduce((s, i) => s + i.valor, 0)
  return (
    <>
      <div className="card">
        <span className="muted small">Você deve à casa</span>
        <span className={'num' + (devendo > 0 ? ' ruim' : '')}>{reais(devendo)}</span>
      </div>
      <h2>Minhas cobranças</h2>
      {carregado && itens.length === 0 && <div className="card vazio">Nenhuma cobrança para você.</div>}
      {itens.map((i) => {
        const atrasada = !i.pago && i.vencimento && i.vencimento < hoje()
        return (
          <div className="card" key={i.item_id}>
            <div className="linha entre"><b>{i.titulo}</b><span className={'chip ' + (i.pago ? 'ok' : atrasada ? 'ruim' : 'aviso')}>{i.pago ? 'Pago' : atrasada ? 'Atrasada' : 'Em aberto'}</span></div>
            <span className="small muted">{reais(i.valor)}{i.vencimento ? ' · vence ' + dataCurta(i.vencimento) : ''}</span>
          </div>
        )
      })}
      <p className="small muted">O pagamento é combinado com quem cuida das finanças da casa; quando ele marcar, aparece aqui como pago.</p>
    </>
  )
}
