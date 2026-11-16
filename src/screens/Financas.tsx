import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { nomeDoMembro, useApp } from '../lib/contexto'
import type { Categoria, Cobranca, CobrancaItem, Lancamento, MinhaCobranca, SaldoConta } from '../lib/tipos'
import { dataCurta, hoje, reais } from '../lib/datas'
import { lerValor } from '../lib/dinheiro'
import { Campo, Folha } from '../components'

const TIPOS = { casa: 'Casa', festa: 'Festa', caixinha: 'Caixinha', outro: 'Outro' } as const
const ICONES = ['🏠', '💡', '💧', '🌐', '🛒', '🍕', '🧹', '🎉', '🔧', '🚗', '📦', '🎁']
const CORES = [['Azul', '#3b82f6'], ['Verde', '#22c55e'], ['Laranja', '#f59e0b'], ['Vermelho', '#ef4444'], ['Roxo', '#8b5cf6'], ['Rosa', '#ec4899'], ['Turquesa', '#14b8a6'], ['Cinza', '#6b7280']]
type Modal = null | 'despesa' | 'receita' | 'cobranca' | 'categoria' | 'conta'

export default function Financas({ intencao = '' }: { intencao?: string }) {
  const app = useApp()
  if (!app.funcao('financeiro')) return <Minhas />
  return <Gestao intencao={intencao} />
}

function Gestao({ intencao }: { intencao: string }) {
  const app = useApp()
  const rep = app.republica!
  const ativos = useMemo(() => app.membros.filter((m) => m.ativo), [app.membros])
  const [saldos, setSaldos] = useState<SaldoConta[]>([])
  const [lancs, setLancs] = useState<Lancamento[]>([])
  const [cobs, setCobs] = useState<Cobranca[]>([])
  const [itens, setItens] = useState<CobrancaItem[]>([])
  const [cats, setCats] = useState<Categoria[]>([])
  const [menu, setMenu] = useState(false)
  const [modal, setModal] = useState<Modal>((['despesa', 'receita', 'cobranca', 'categoria'] as const).find((k) => k === intencao) || null)
  const [editando, setEditando] = useState<string | null>(null)
  const [filtroCat, setFiltroCat] = useState('')
  const [grafico, setGrafico] = useState<'pizza' | 'colunas' | 'barras'>('pizza')

  const carregar = useCallback(async () => {
    const [s, l, c, i, k] = await Promise.all([
      supabase.rpc('saldos_contas', { p_rep: rep.id }),
      supabase.from('lancamentos').select('*').eq('republica_id', rep.id).order('data', { ascending: false }).order('created_at', { ascending: false }).limit(200),
      supabase.from('cobrancas').select('*').eq('republica_id', rep.id).order('created_at', { ascending: false }),
      supabase.from('cobranca_itens').select('*').eq('republica_id', rep.id),
      supabase.from('categorias').select('id,nome,icone,cor').eq('republica_id', rep.id).order('created_at'),
    ])
    setSaldos(((s.data || []) as SaldoConta[]).map((x) => ({ ...x, saldo: Number(x.saldo), entradas: Number(x.entradas), saidas: Number(x.saidas), saldo_inicial: Number(x.saldo_inicial), movimentos: Number(x.movimentos) })))
    setLancs(((l.data || []) as Lancamento[]).map((x) => ({ ...x, valor: Number(x.valor) })))
    setCobs(((c.data || []) as Cobranca[]).map((x) => ({ ...x, valor: Number(x.valor) })))
    setItens(((i.data || []) as CobrancaItem[]).map((x) => ({ ...x, valor: Number(x.valor) })))
    setCats((k.data || []) as Categoria[])
  }, [rep.id])
  useEffect(() => { carregar() }, [carregar])

  const arrecadado = saldos.reduce((t, s) => t + s.entradas, 0)
  const gasto = saldos.reduce((t, s) => t + s.saidas, 0)
  const saldoTotal = saldos.reduce((t, s) => t + s.saldo, 0)
  const aReceber = itens.filter((i) => !i.pago).reduce((t, i) => t + i.valor, 0)
  const nomeConta = (id: string) => saldos.find((c) => c.conta_id === id)?.nome || 'Conta'
  const cat = (n: string | null) => cats.find((c) => c.nome === n)

  async function pagar(it: CobrancaItem) {
    const { error } = await supabase.rpc('marcar_pago', { p_item: it.id, p_pago: !it.pago })
    if (error) return app.avisar(error.message, true)
    carregar()
  }
  async function removerCob(c: Cobranca) {
    if (!confirm(`Remover a cobrança "${c.titulo}"?`)) return
    const { error } = await supabase.rpc('remover_cobranca', { p_cob: c.id })
    if (error) return app.avisar(error.message, true)
    app.avisar('Cobrança removida.'); carregar()
  }
  async function removerLanc(l: Lancamento) {
    if (!confirm(`Remover "${l.descricao}"?`)) return
    const { error } = await supabase.rpc('remover_lancamento', { p_id: l.id })
    if (error) return app.avisar(error.message, true)
    app.avisar('Lançamento removido.'); carregar()
  }
  async function removerCat(c: Categoria) {
    if (!confirm(`Remover a categoria ${c.nome}? Os lançamentos antigos continuam, só perdem o ícone e a cor.`)) return
    const { error } = await supabase.rpc('remover_categoria', { p_id: c.id })
    if (error) return app.avisar(error.message, true)
    carregar()
  }
  async function removerConta(s: SaldoConta) {
    if (!confirm(`Remover a conta ${s.nome}?`)) return
    const { error } = await supabase.rpc('remover_conta', { p_conta: s.conta_id })
    if (error) return app.avisar(error.message, true)
    app.avisar('Conta removida.'); carregar()
  }
  async function definirQuemPaga(c: Cobranca, sel: string[]) {
    const { error } = await supabase.rpc('definir_membros_cobranca', { p_cob: c.id, p_membros: sel })
    if (error) return app.avisar(error.message, true)
    carregar()
  }
  const fechar = (ok?: boolean) => { setModal(null); if (ok) carregar() }

  // gráfico de gastos por categoria
  const gastosCat = useMemo(() => {
    const m = new Map<string, number>()
    lancs.filter((l) => l.tipo === 'despesa').forEach((l) => m.set(l.categoria || 'Sem categoria', (m.get(l.categoria || 'Sem categoria') || 0) + l.valor))
    return [...m.entries()].map(([nome, valor], i) => ({ nome, valor, cor: cats.find((c) => c.nome === nome)?.cor || CORES[i % CORES.length][1], icone: cats.find((c) => c.nome === nome)?.icone || '' })).sort((a, b) => b.valor - a.valor)
  }, [lancs, cats])
  const totalGastos = gastosCat.reduce((t, g) => t + g.valor, 0)
  const lista = lancs.filter((l) => !filtroCat || (l.categoria || '') === filtroCat)

  return (
    <>
      <div className="acao-fixa">
        <button className="btn primario" onClick={() => setMenu(!menu)}>+ Lançar</button>
        {menu && (
          <div className="bloco menu" style={{ top: 52, right: 0, minWidth: 250, padding: 8 }}>
            {([['Despesa', 'despesa', '−'], ['Receita', 'receita', '+'], ['Nova cobrança', 'cobranca', '$'], ['Nova categoria', 'categoria', '#']] as [string, Modal, string][]).map(([n, k, s]) => (
              <button key={n} onClick={() => { setMenu(false); setModal(k) }}><b style={{ display: 'inline-block', width: 28 }}>{s}</b>{n}</button>
            ))}
          </div>
        )}
      </div>

      <div className="cartoes">
        <div className="bloco"><span className="muted small">Total arrecadado</span><span className="grande" style={{ color: 'var(--ok-fg)' }}>{reais(arrecadado)}</span><span className="small muted">Cobranças pagas e receitas lançadas</span></div>
        <div className="bloco"><span className="muted small">Total gasto</span><span className="grande" style={{ color: 'var(--ruim-fg)' }}>{reais(gasto)}</span><span className="small muted">Despesas lançadas</span></div>
        <div className="bloco"><span className="muted small">Saldo atual</span><span className="grande">{reais(saldoTotal)}</span><span className="small muted">Soma de todas as contas</span></div>
        <div className="bloco"><span className="muted small">Ainda a receber</span><span className="grande" style={{ color: 'var(--aviso-fg)' }}>{reais(aReceber)}</span><span className="small muted">Cobranças que faltam pagar</span></div>
      </div>

      <div className="bloco" style={{ gap: 14 }}>
        <div><h2>Cobranças dos integrantes</h2><span className="small muted">Aluguel, caixinha ou qualquer valor. Você define o valor, o vencimento e quem paga. Cada integrante só vê as cobranças criadas para ele.</span></div>
        {cobs.length === 0 && <div className="card vazio">Nenhuma cobrança criada ainda. Use “+ Lançar → Nova cobrança”.</div>}
        <div className="cartoes">
          {cobs.map((c) => {
            const its = itens.filter((i) => i.cobranca_id === c.id)
            const pagos = its.filter((i) => i.pago).length
            const atrasada = c.vencimento && c.vencimento < hoje() && pagos < its.length
            return (
              <div className="card" key={c.id} style={{ flex: '1 1 320px', background: 'var(--suave)' }}>
                <div className="linha entre">
                  <b>{c.titulo}</b>
                  <span className="linha">
                    <button className="btn mini" onClick={() => setEditando(editando === c.id ? null : c.id)}>{editando === c.id ? 'Pronto' : 'Quem paga'}</button>
                    {pagos === 0 && <button className="btn mini perigo" onClick={() => removerCob(c)}>Remover</button>}
                  </span>
                </div>
                <span className="small">{reais(c.valor)} por pessoa{c.vencimento ? ' · vence ' + dataCurta(c.vencimento) : ''} · {nomeConta(c.conta_id || '')}</span>
                <div className="barra"><i style={{ width: its.length ? (pagos / its.length) * 100 + '%' : '0%' }} /></div>
                <span className={'small ' + (atrasada ? 'ruim-txt' : 'muted')} style={atrasada ? { color: 'var(--ruim-fg)' } : undefined}>{pagos} de {its.length} pagaram · faltam {reais((its.length - pagos) * c.valor)}{atrasada ? ' · vencida' : ''}</span>
                {editando === c.id && (
                  <div className="card">
                    <span className="small muted">Toque para incluir ou tirar. Quem já pagou não sai.</span>
                    <div className="linha quebra">
                      {ativos.map((m) => {
                        const it = its.find((i) => i.membro_id === m.id)
                        const dentro = !!it
                        return <button key={m.id} className={'btn mini' + (dentro ? ' primario' : '')} disabled={!!it?.pago}
                          onClick={() => definirQuemPaga(c, dentro ? its.filter((i) => i.membro_id !== m.id).map((i) => i.membro_id) : [...its.map((i) => i.membro_id), m.id])}>{nomeDoMembro(app, m.id)}</button>
                      })}
                    </div>
                  </div>
                )}
                <span className="small muted">Toque no nome para marcar quem já pagou.</span>
                <div className="linha quebra">
                  {its.map((i) => (
                    <button key={i.id} className="chip" style={{ minHeight: 36, border: 0, cursor: 'pointer', background: i.pago ? 'var(--ok-bg)' : 'var(--aviso-bg)', color: i.pago ? 'var(--ok-fg)' : 'var(--aviso-fg)' }} onClick={() => pagar(i)}>
                      {nomeDoMembro(app, i.membro_id)} · {i.pago ? 'pagou' : 'falta pagar'}
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="cartoes">
        <div className="bloco" style={{ flex: '1 1 380px' }}>
          <div className="linha entre quebra">
            <h2>Lançamentos</h2>
            {cats.length > 0 && (
              <select aria-label="Categoria" style={{ width: 'auto', minWidth: 150 }} value={filtroCat} onChange={(e) => setFiltroCat(e.target.value)}>
                <option value="">Todas as categorias</option>{cats.map((c) => <option key={c.id} value={c.nome}>{c.nome}</option>)}
              </select>
            )}
          </div>
          {lista.length === 0 && <span className="small muted">Nenhum lançamento ainda. Use “+ Lançar”.</span>}
          {lista.map((l) => {
            const k = cat(l.categoria)
            return (
              <div className="lista-linha" key={l.id}>
                <div className="grow">
                  <b>{k ? k.icone + ' ' : ''}{l.descricao}</b><br />
                  <span className="small muted">{dataCurta(l.data)} · {nomeConta(l.conta_id)}{l.categoria ? ' · ' + l.categoria : ''}{l.origem !== 'manual' ? ' · automático' : ''}</span>
                </div>
                <b style={{ color: l.tipo === 'receita' ? 'var(--ok-fg)' : 'var(--ruim-fg)', whiteSpace: 'nowrap' }}>{l.tipo === 'receita' ? '+' : '−'} {reais(l.valor)}</b>
                {l.origem === 'manual' && <button className="btn mini" aria-label="Remover lançamento" onClick={() => removerLanc(l)}>Remover</button>}
              </div>
            )
          })}
        </div>

        <div className="bloco" style={{ flex: '1 1 380px' }}>
          <div className="linha entre"><h2>Categorias da república</h2><button className="btn mini" onClick={() => setModal('categoria')}>+ Nova</button></div>
          <span className="small muted">Cada categoria tem ícone e cor. A cor é a que aparece nos gráficos.</span>
          {cats.length === 0 && <span className="small muted">Nenhuma categoria ainda. Crie as suas (ex.: Internet, Limpeza).</span>}
          <div className="linha quebra">
            {cats.map((c) => (
              <span key={c.id} className="linha" style={{ background: 'var(--neutro-bg)', borderLeft: `5px solid ${c.cor}`, borderRadius: 10, padding: '4px 6px 4px 12px', gap: 8 }}>
                <span style={{ fontSize: 18 }}>{c.icone}</span><b className="small">{c.nome}</b>
                <button className="btn mini" style={{ minHeight: 32, padding: '0 10px' }} aria-label={'Remover ' + c.nome} onClick={() => removerCat(c)}>x</button>
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="cartoes">
        <div className="bloco" style={{ flex: '1 1 380px' }}>
          <div className="linha entre quebra">
            <h2>Gastos por categoria</h2>
            <div className="seg" role="group" aria-label="Tipo de gráfico" style={{ width: 'auto' }}>
              {([['pizza', 'Pizza'], ['colunas', 'Colunas'], ['barras', 'Barras']] as const).map(([k, n]) => <button key={k} aria-pressed={grafico === k} onClick={() => setGrafico(k)}>{n}</button>)}
            </div>
          </div>
          {gastosCat.length === 0 && <span className="small muted">Ainda não há despesas para este gráfico.</span>}
          {gastosCat.length > 0 && grafico === 'pizza' && (() => {
            let acc = 0
            const fatias = gastosCat.map((g) => { const a = acc; acc += (g.valor / totalGastos) * 100; return `${g.cor} ${a}% ${acc}%` }).join(', ')
            return <div style={{ display: 'flex', justifyContent: 'center' }}><div style={{ position: 'relative', width: 170, height: 170, borderRadius: '50%', background: `conic-gradient(${fatias})` }}>
              <div style={{ position: 'absolute', inset: 40, borderRadius: '50%', background: 'var(--card)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13, textAlign: 'center' }}>{reais(totalGastos)}</div></div></div>
          })()}
          {gastosCat.length > 0 && grafico === 'colunas' && (
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, height: 150 }}>
              {gastosCat.map((g) => (
                <div key={g.nome} style={{ flex: '1 1 0', minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%', gap: 4 }}>
                  <span style={{ fontSize: 11, fontWeight: 700 }}>{reais(g.valor)}</span>
                  <div style={{ width: '100%', maxWidth: 48, height: Math.max(6, (g.valor / gastosCat[0].valor) * 100) + '%', background: g.cor, borderRadius: '6px 6px 0 0' }} />
                </div>
              ))}
            </div>
          )}
          {gastosCat.map((g) => (
            <div className="linha" key={g.nome}>
              <span style={{ width: 12, height: 12, borderRadius: 3, background: g.cor, flex: '0 0 12px' }} />
              <span className="grow small">{g.icone} {g.nome}</span>
              {grafico === 'barras' && <div className="barra" style={{ flex: '2 1 80px' }}><i style={{ width: (g.valor / gastosCat[0].valor) * 100 + '%', background: g.cor }} /></div>}
              <b className="small">{reais(g.valor)} · {Math.round((g.valor / totalGastos) * 100)}%</b>
            </div>
          ))}
        </div>

        <div className="bloco" style={{ flex: '1 1 380px' }}>
          <div className="linha entre"><h2>Saldo por conta</h2><button className="btn mini primario" onClick={() => setModal('conta')}>+ Nova conta</button></div>
          <span className="small muted">Conta é o lugar onde o dinheiro da república fica guardado: caixa em dinheiro, conta do banco, Pix, caixa da festa. Ao lançar você escolhe de qual conta o dinheiro sai ou entra.</span>
          {saldos.length === 0 && <span className="small muted">Nenhuma conta ainda. Toque em + Nova conta para criar a primeira.</span>}
          {saldos.map((s) => (
            <div className="lista-linha" key={s.conta_id}>
              <div className="grow"><b>{s.nome}</b> <span className="chip">{TIPOS[s.tipo]}</span><br /><span className="small muted">Entradas {reais(s.entradas)} · saídas {reais(s.saidas)} · inicial {reais(s.saldo_inicial)}</span></div>
              <b style={{ color: s.saldo < 0 ? 'var(--ruim-fg)' : undefined }}>{reais(s.saldo)}</b>
              {s.movimentos === 0 && <button className="btn mini" onClick={() => removerConta(s)}>Remover</button>}
            </div>
          ))}
        </div>
      </div>

      {(modal === 'despesa' || modal === 'receita') && <FormLancamento tipoInicial={modal} contas={saldos} cats={cats} onFechar={fechar} onNovaConta={() => setModal('conta')} />}
      {modal === 'cobranca' && <FormCobranca contas={saldos} ativos={ativos.map((m) => m.id)} onFechar={fechar} onNovaConta={() => setModal('conta')} />}
      {modal === 'categoria' && <FormCategoria onFechar={fechar} />}
      {modal === 'conta' && <FormConta onFechar={fechar} />}
    </>
  )
}

/* ------------------------------------------------------------ Formulários */
function FormConta({ onFechar }: { onFechar: (ok?: boolean) => void }) {
  const app = useApp()
  const [f, setF] = useState({ nome: '', tipo: 'casa', saldo: '' })
  async function criar(e: React.FormEvent) {
    e.preventDefault()
    const saldo = f.saldo.trim() === '' ? 0 : lerValor(f.saldo)
    if (saldo === null) return app.avisar('Saldo inicial inválido.', true)
    const { error } = await supabase.rpc('criar_conta', { p_rep: app.republica!.id, p_nome: f.nome, p_tipo: f.tipo, p_saldo: saldo })
    if (error) return app.avisar(error.message, true)
    app.avisar('Conta criada.'); onFechar(true)
  }
  return (
    <Folha titulo="Nova conta" onFechar={() => onFechar()}>
      <form className="pilha" onSubmit={criar}>
        <Campo rotulo="Nome da conta"><input value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} placeholder="Ex.: Caixa da festa" required /></Campo>
        <b className="small">Tipo</b>
        <div className="linha quebra">{Object.entries(TIPOS).map(([k, v]) => <button type="button" key={k} className={'btn mini' + (f.tipo === k ? ' primario' : '')} onClick={() => setF({ ...f, tipo: k })}>{v}</button>)}</div>
        <Campo rotulo="Quanto já tem nela hoje (opcional)"><input inputMode="decimal" value={f.saldo} onChange={(e) => setF({ ...f, saldo: e.target.value })} placeholder="Saldo inicial em R$, ex.: 150,00" /></Campo>
        <button className="btn primario">Criar conta</button>
      </form>
    </Folha>
  )
}

function FormCategoria({ onFechar }: { onFechar: (ok?: boolean) => void }) {
  const app = useApp()
  const [nome, setNome] = useState('')
  const [icone, setIcone] = useState(ICONES[0])
  const [cor, setCor] = useState(CORES[0][1])
  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    const { error } = await supabase.rpc('criar_categoria', { p_rep: app.republica!.id, p_nome: nome, p_icone: icone, p_cor: cor })
    if (error) return app.avisar(error.message, true)
    app.avisar('Categoria criada.'); onFechar(true)
  }
  return (
    <Folha titulo="Nova categoria" onFechar={() => onFechar()}>
      <form className="pilha" onSubmit={salvar}>
        <Campo rotulo="Nome"><input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome, ex.: Internet" required /></Campo>
        <b className="small">Ícone</b>
        <div className="linha quebra">{ICONES.map((i) => <button type="button" key={i} aria-label={'Ícone ' + i} onClick={() => setIcone(i)} style={{ minWidth: 44, minHeight: 44, borderRadius: 10, fontSize: 20, border: `2px solid ${icone === i ? 'var(--acento)' : 'var(--linha)'}`, background: 'transparent' }}>{i}</button>)}</div>
        <b className="small">Cor no gráfico</b>
        <div className="cores-sel">{CORES.map(([n, c]) => <button type="button" key={c} aria-label={n} onClick={() => setCor(c)} style={{ width: 44, height: 44, borderRadius: '50%', border: `3px solid ${cor === c ? 'var(--texto)' : 'transparent'}`, background: c }} />)}</div>
        <button className="btn primario">Salvar categoria</button>
      </form>
    </Folha>
  )
}

function FormLancamento({ tipoInicial, contas, cats, onFechar, onNovaConta }: { tipoInicial: 'despesa' | 'receita'; contas: SaldoConta[]; cats: Categoria[]; onFechar: (ok?: boolean) => void; onNovaConta: () => void }) {
  const app = useApp()
  const [f, setF] = useState({ conta: contas[0]?.conta_id || '', tipo: tipoInicial as string, valor: '', desc: '', cat: '', data: hoje() })
  async function criar(e: React.FormEvent) {
    e.preventDefault()
    const v = lerValor(f.valor)
    if (v === null || v <= 0) return app.avisar('Informe um valor maior que zero.', true)
    const { error } = await supabase.rpc('lancar', { p_rep: app.republica!.id, p_conta: f.conta, p_tipo: f.tipo, p_valor: v, p_desc: f.desc, p_categoria: f.cat, p_data: f.data })
    if (error) return app.avisar(error.message, true)
    app.avisar('Lançamento salvo.'); onFechar(true)
  }
  if (contas.length === 0) return (
    <Folha titulo="Novo lançamento" onFechar={() => onFechar()}>
      <p className="muted">Antes de lançar, crie uma conta: é dela que o dinheiro sai ou entra.</p>
      <button className="btn primario" onClick={onNovaConta}>+ Nova conta</button>
    </Folha>
  )
  return (
    <Folha titulo={f.tipo === 'despesa' ? 'Nova despesa' : 'Nova receita'} onFechar={() => onFechar()}>
      <form className="pilha" onSubmit={criar}>
        <div className="seg" role="group" aria-label="Tipo">
          <button type="button" aria-pressed={f.tipo === 'despesa'} onClick={() => setF({ ...f, tipo: 'despesa' })}>Despesa</button>
          <button type="button" aria-pressed={f.tipo === 'receita'} onClick={() => setF({ ...f, tipo: 'receita' })}>Receita</button>
        </div>
        <Campo rotulo="Conta"><select value={f.conta} onChange={(e) => setF({ ...f, conta: e.target.value })}>{contas.map((c) => <option key={c.conta_id} value={c.conta_id}>{c.nome}</option>)}</select></Campo>
        <Campo rotulo="Valor (R$)"><input inputMode="decimal" value={f.valor} onChange={(e) => setF({ ...f, valor: e.target.value })} required /></Campo>
        <Campo rotulo="Descrição"><input value={f.desc} onChange={(e) => setF({ ...f, desc: e.target.value })} placeholder="Ex.: Conta de luz" required /></Campo>
        <div className="grade2">
          <Campo rotulo="Categoria (opcional)">
            <select value={f.cat} onChange={(e) => setF({ ...f, cat: e.target.value })}><option value="">Sem categoria</option>{cats.map((c) => <option key={c.id} value={c.nome}>{c.icone} {c.nome}</option>)}</select>
          </Campo>
          <Campo rotulo="Data"><input type="date" value={f.data} onChange={(e) => setF({ ...f, data: e.target.value })} /></Campo>
        </div>
        <button className="btn primario">Salvar lançamento</button>
      </form>
    </Folha>
  )
}

function FormCobranca({ contas, ativos, onFechar, onNovaConta }: { contas: SaldoConta[]; ativos: string[]; onFechar: (ok?: boolean) => void; onNovaConta: () => void }) {
  const app = useApp()
  const [f, setF] = useState({ titulo: '', modo: 'pessoa', valor: '', venc: '', conta: contas[0]?.conta_id || '', sel: ativos })
  async function criar(e: React.FormEvent) {
    e.preventDefault()
    const v = lerValor(f.valor)
    if (v === null || v <= 0) return app.avisar('Informe o valor.', true)
    if (f.sel.length === 0) return app.avisar('Escolha ao menos um integrante.', true)
    const porPessoa = f.modo === 'total' ? Math.round((v / f.sel.length) * 100) / 100 : v
    const { error } = await supabase.rpc('criar_cobranca', { p_rep: app.republica!.id, p_titulo: f.titulo, p_valor: porPessoa, p_venc: f.venc || null, p_conta: f.conta, p_membros: f.sel })
    if (error) return app.avisar(error.message, true)
    app.avisar(`Cobrança criada: ${reais(porPessoa)} por pessoa.`); onFechar(true)
  }
  if (contas.length === 0) return (
    <Folha titulo="Nova cobrança" onFechar={() => onFechar()}>
      <p className="muted">Antes de cobrar, crie uma conta: é nela que o dinheiro das cobranças entra.</p>
      <button className="btn primario" onClick={onNovaConta}>+ Nova conta</button>
    </Folha>
  )
  const previa = (() => { const v = lerValor(f.valor); return v && f.sel.length ? (f.modo === 'total' ? v / f.sel.length : v) : null })()
  return (
    <Folha titulo="Nova cobrança" onFechar={() => onFechar()}>
      <form className="pilha" onSubmit={criar}>
        <Campo rotulo="1. Nome"><input value={f.titulo} onChange={(e) => setF({ ...f, titulo: e.target.value })} placeholder="Ex.: Aluguel de dezembro" required /></Campo>
        <div className="seg" role="group" aria-label="Como dividir">
          <button type="button" aria-pressed={f.modo === 'pessoa'} onClick={() => setF({ ...f, modo: 'pessoa' })}>Valor por pessoa</button>
          <button type="button" aria-pressed={f.modo === 'total'} onClick={() => setF({ ...f, modo: 'total' })}>Dividir um total</button>
        </div>
        <Campo rotulo={'2. ' + (f.modo === 'total' ? 'Valor total (R$)' : 'Valor por pessoa (R$)')}><input inputMode="decimal" value={f.valor} onChange={(e) => setF({ ...f, valor: e.target.value })} required /></Campo>
        {previa !== null && <span className="chip ok" style={{ alignSelf: 'flex-start' }}>{reais(previa)} por pessoa · {f.sel.length} pessoa(s)</span>}
        <div className="grade2">
          <Campo rotulo="3. Vencimento"><input type="date" value={f.venc} onChange={(e) => setF({ ...f, venc: e.target.value })} /></Campo>
          <Campo rotulo="Entra na conta"><select value={f.conta} onChange={(e) => setF({ ...f, conta: e.target.value })}>{contas.map((c) => <option key={c.conta_id} value={c.conta_id}>{c.nome}</option>)}</select></Campo>
        </div>
        <div className="linha entre"><b className="small">4. Quem paga? Toque para tirar ou voltar a incluir</b><button type="button" className="btn mini" onClick={() => setF({ ...f, sel: ativos })}>Incluir todos</button></div>
        <div className="linha quebra">
          {ativos.map((id) => <button type="button" key={id} className={'btn mini' + (f.sel.includes(id) ? ' primario' : '')} onClick={() => setF({ ...f, sel: f.sel.includes(id) ? f.sel.filter((x) => x !== id) : [...f.sel, id] })}>{nomeDoMembro(app, id)}</button>)}
        </div>
        <button className="btn primario">Criar cobrança</button>
      </form>
    </Folha>
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
