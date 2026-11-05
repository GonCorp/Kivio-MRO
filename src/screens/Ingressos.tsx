import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../lib/contexto'
import type { Conta, FestaIng, IngressoItem, MeuIngresso } from '../lib/tipos'
import { dataCurta, hoje, reais } from '../lib/datas'
import { lerValor } from '../lib/dinheiro'
import { Campo, Folha } from '../components'

const ROTULO = { pendente: 'Aguardando pagamento', pago: 'Pago', usado: 'Usado', cancelado: 'Cancelado' } as const
const CHIP = { pendente: 'aviso', pago: 'ok', usado: '', cancelado: 'ruim' } as const

const zap = (tel: string | null, texto: string) => (tel ? `https://wa.me/55${tel.replace(/^55/, '')}?text=${encodeURIComponent(texto)}` : null)

async function copiar(txt: string, avisar: (t: string, e?: boolean) => void) {
  try { await navigator.clipboard.writeText(txt); avisar('Copiado.') } catch { avisar('Não consegui copiar. Selecione e copie manualmente.', true) }
}

/* ============================================================ Ingressos */
export default function Ingressos() {
  const app = useApp()
  const rep = app.republica!
  const gerente = app.funcao('ingressos')
  const [festas, setFestas] = useState<FestaIng[]>([])
  const [meus, setMeus] = useState<MeuIngresso[]>([])
  const [contas, setContas] = useState<Conta[]>([])
  const [config, setConfig] = useState<FestaIng | null>(null)
  const [pegar, setPegar] = useState<FestaIng | null>(null)
  const [vender, setVender] = useState<FestaIng | null>(null)
  const [ver, setVer] = useState<FestaIng | null>(null)
  const [pedido, setPedido] = useState<{ festa: FestaIng; codigo: string; comprador: string } | null>(null)

  const carregar = useCallback(async () => {
    const [a, b] = await Promise.all([
      supabase.rpc('festas_ingressos', { p_rep: rep.id }),
      supabase.rpc('meus_ingressos', { p_rep: rep.id }),
    ])
    setFestas(((a.data || []) as FestaIng[]).map((f) => ({ ...f, pendentes: Number(f.pendentes), vendidos: Number(f.vendidos), usados: Number(f.usados), ingresso_preco: f.ingresso_preco === null ? null : Number(f.ingresso_preco) })))
    setMeus(((b.data || []) as MeuIngresso[]).map((m) => ({ ...m, valor: Number(m.valor) })))
    if (gerente && app.tem('financas')) {
      const c = await supabase.from('contas').select('*').eq('republica_id', rep.id).order('created_at')
      setContas((c.data || []) as Conta[])
    }
  }, [rep.id, gerente]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { carregar() }, [carregar])

  const h = hoje()
  const proximas = festas.filter((f) => f.data >= h)
  const passadas = festas.filter((f) => f.data < h)

  async function cancelarMeu(m: MeuIngresso) {
    if (!confirm(`Cancelar o pedido de ingresso de ${m.comprador}?`)) return
    const { error } = await supabase.rpc('cancelar_ingresso', { p_ingresso: m.id })
    if (error) return app.avisar(error.message, true)
    app.avisar('Pedido cancelado.'); carregar()
  }

  const cartao = (f: FestaIng) => {
    const aberta = f.ingressos_abertos && f.ingresso_preco !== null && f.data >= h
    const esgotado = f.limite_ingressos !== null && f.vendidos + f.pendentes >= f.limite_ingressos
    return (
      <div className="card" key={f.id}>
        <div className="linha entre"><b>{f.titulo}</b><span className="chip">{dataCurta(f.data)}</span></div>
        <span className="small muted">{f.local || 'Local a definir'}</span>
        {f.ingresso_preco === null
          ? <span className="small muted">{gerente ? 'Vendas ainda não configuradas.' : 'As vendas ainda não foram abertas.'}</span>
          : (
            <>
              <div className="linha quebra">
                <span className="chip">{reais(f.ingresso_preco ?? 0)}</span>
                <span className={'chip ' + (aberta && !esgotado ? 'ok' : 'ruim')}>{esgotado ? 'Esgotado' : aberta ? 'Vendas abertas' : 'Vendas fechadas'}</span>
              </div>
              {gerente && (
                <span className="small muted">
                  {f.vendidos} pago(s) · {f.pendentes} aguardando · {f.usados} entrada(s) dada(s){f.limite_ingressos ? ` · limite ${f.limite_ingressos}` : ''}
                </span>
              )}
            </>
          )}
        <div className="linha quebra">
          {aberta && !esgotado && <button className="btn mini primario" onClick={() => setPegar(f)}>Pegar ingresso</button>}
          {gerente && f.data >= h && <button className="btn mini" onClick={() => setConfig(f)}>Configurar</button>}
          {gerente && f.ingresso_preco !== null && f.data >= h && <button className="btn mini" onClick={() => setVender(f)}>Vender direto</button>}
          {gerente && f.ingresso_preco !== null && <button className="btn mini" onClick={() => setVer(f)}>Ver ingressos{f.pendentes ? ` (${f.pendentes} p/ confirmar)` : ''}</button>}
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="card">
        <span className="small muted">
          {gerente
            ? 'Cada ingresso é pago por Pix direto na conta da república. Você confirma o pagamento aqui e a portaria dá baixa na entrada. Taxa do app: R$ 0,25 por ingresso confirmado, somada na mensalidade do mês seguinte.'
            : 'Peça seu ingresso, pague por Pix na chave da república e aguarde a confirmação. Na portaria, mostre o código.'}
        </span>
      </div>

      {meus.length > 0 && (
        <>
          <h2>Meus ingressos</h2>
          {meus.map((m) => (
            <div className="card" key={m.id}>
              <div className="linha entre"><b>{m.festa}</b><span className={'chip ' + CHIP[m.status]}>{ROTULO[m.status]}</span></div>
              <span className="small muted">{dataCurta(m.data)} · em nome de {m.comprador}</span>
              <span className="num" style={{ letterSpacing: 2 }}>{m.codigo}</span>
              {m.status === 'pendente' && (
                <>
                  <span className="small">Pague <b>{reais(m.valor)}</b> por Pix para <b>{m.pix_chave}</b> e avise o responsável.</span>
                  <div className="linha quebra">
                    {m.pix_chave && <button className="btn mini" onClick={() => copiar(m.pix_chave!, app.avisar)}>Copiar chave Pix</button>}
                    {zap(m.contato_whatsapp, `Oi! Paguei o ingresso ${m.codigo} (${m.comprador}) da festa ${m.festa}.`) &&
                      <a className="btn mini" href={zap(m.contato_whatsapp, `Oi! Paguei o ingresso ${m.codigo} (${m.comprador}) da festa ${m.festa}.`)!} target="_blank" rel="noreferrer">Avisar no WhatsApp</a>}
                    <button className="btn mini perigo" onClick={() => cancelarMeu(m)}>Cancelar pedido</button>
                  </div>
                </>
              )}
              {m.status === 'pago' && <span className="small">Pagamento confirmado. Mostre o código na portaria.</span>}
            </div>
          ))}
        </>
      )}

      <h2>Próximas festas</h2>
      {proximas.length === 0 && <div className="card vazio">Nenhuma festa futura. {app.ehLider && app.tem('calendario') ? 'Marque uma no Calendário para vender ingressos.' : ''}</div>}
      {proximas.map(cartao)}
      {gerente && passadas.length > 0 && (<><h2>Festas recentes</h2>{passadas.map(cartao)}</>)}

      {config && <Configurar festa={config} contas={contas} onFechar={() => setConfig(null)} onOk={() => { setConfig(null); carregar() }} />}
      {pegar && <Pegar festa={pegar} onFechar={() => setPegar(null)} onOk={(codigo, comprador) => { setPedido({ festa: pegar, codigo, comprador }); setPegar(null); carregar() }} />}
      {vender && <Vender festa={vender} onFechar={() => setVender(null)} onOk={() => { setVender(null); carregar() }} />}
      {ver && <Lista festa={ver} onFechar={() => { setVer(null); carregar() }} />}
      {pedido && (
        <Folha titulo="Ingresso pedido" onFechar={() => setPedido(null)}>
          <span className="num" style={{ letterSpacing: 2 }}>{pedido.codigo}</span>
          <span className="small">Para entrar, pague <b>{reais(pedido.festa.ingresso_preco ?? 0)}</b> por Pix e avise o responsável. Só vale depois da confirmação.</span>
          <div className="card"><span className="small muted">Chave Pix</span><b style={{ wordBreak: 'break-all' }}>{pedido.festa.pix_chave}</b></div>
          <div className="linha quebra">
            {pedido.festa.pix_chave && <button className="btn primario" onClick={() => copiar(pedido.festa.pix_chave!, app.avisar)}>Copiar chave Pix</button>}
            {zap(pedido.festa.contato_whatsapp, `Oi! Paguei o ingresso ${pedido.codigo} (${pedido.comprador}) da festa ${pedido.festa.titulo}.`) &&
              <a className="btn" href={zap(pedido.festa.contato_whatsapp, `Oi! Paguei o ingresso ${pedido.codigo} (${pedido.comprador}) da festa ${pedido.festa.titulo}.`)!} target="_blank" rel="noreferrer">Avisar no WhatsApp</a>}
          </div>
        </Folha>
      )}
    </>
  )
}

/* ------------------------------------------------ Configurar vendas */
function Configurar({ festa, contas, onFechar, onOk }: { festa: FestaIng; contas: Conta[]; onFechar: () => void; onOk: () => void }) {
  const app = useApp()
  const [f, setF] = useState({
    preco: festa.ingresso_preco === null ? '' : String(festa.ingresso_preco).replace('.', ','),
    pix: festa.pix_chave || '', contato: festa.contato_whatsapp || '', limite: festa.limite_ingressos ? String(festa.limite_ingressos) : '',
    conta: festa.conta_id || '', abertos: festa.ingressos_abertos,
  })
  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    const preco = lerValor(f.preco)
    if (preco === null || preco <= 0) return app.avisar('Informe o preço do ingresso.', true)
    const { error } = await supabase.rpc('configurar_ingressos', {
      p_festa: festa.id, p_preco: preco, p_pix: f.pix, p_contato: f.contato, p_abertos: f.abertos,
      p_limite: f.limite ? Number(f.limite) : 0, p_conta: f.conta || null,
    })
    if (error) return app.avisar(error.message, true)
    app.avisar('Ingressos configurados.'); onOk()
  }
  return (
    <Folha titulo={'Ingressos · ' + festa.titulo} onFechar={onFechar}>
      <form className="pilha" onSubmit={salvar}>
        <Campo rotulo="Preço do ingresso (R$)"><input inputMode="decimal" value={f.preco} onChange={(e) => setF({ ...f, preco: e.target.value })} placeholder="30,00" required /></Campo>
        <Campo rotulo="Chave Pix da república"><input value={f.pix} onChange={(e) => setF({ ...f, pix: e.target.value })} placeholder="CPF, e-mail, celular ou aleatória" /></Campo>
        <Campo rotulo="WhatsApp para enviar o comprovante (opcional)"><input inputMode="tel" value={f.contato} onChange={(e) => setF({ ...f, contato: e.target.value })} placeholder="(31) 99999-9999" /></Campo>
        <Campo rotulo="Limite de ingressos (vazio = sem limite)"><input inputMode="numeric" value={f.limite} onChange={(e) => setF({ ...f, limite: e.target.value.replace(/\D/g, '') })} /></Campo>
        {app.tem('financas') && (
          <Campo rotulo="Conta que recebe o dinheiro">
            <select value={f.conta} onChange={(e) => setF({ ...f, conta: e.target.value })}>
              <option value="">Não lançar nas finanças</option>
              {contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </Campo>
        )}
        <label className="linha" style={{ gap: 8 }}><input type="checkbox" style={{ width: 'auto' }} checked={f.abertos} onChange={(e) => setF({ ...f, abertos: e.target.checked })} /> Vendas abertas para os integrantes</label>
        <span className="small muted">Ao confirmar cada pagamento, o valor entra na conta escolhida e o app registra a taxa de R$ 0,25.</span>
        <button className="btn primario">Salvar</button>
      </form>
    </Folha>
  )
}

/* ------------------------------------------------ Pegar ingresso */
function Pegar({ festa, onFechar, onOk }: { festa: FestaIng; onFechar: () => void; onOk: (codigo: string, comprador: string) => void }) {
  const app = useApp()
  const [nome, setNome] = useState(app.perfil.nome || '')
  const [contato, setContato] = useState('')
  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    const { data, error } = await supabase.rpc('pedir_ingresso', { p_festa: festa.id, p_comprador: nome, p_contato: contato })
    if (error) return app.avisar(error.message, true)
    onOk(data as string, nome)
  }
  return (
    <Folha titulo={'Pegar ingresso · ' + festa.titulo} onFechar={onFechar}>
      <form className="pilha" onSubmit={enviar}>
        <span className="small muted">Valor: <b>{reais(festa.ingresso_preco ?? 0)}</b>. Pode pedir para você ou para um convidado: mude o nome.</span>
        <Campo rotulo="Nome de quem vai usar o ingresso"><input value={nome} onChange={(e) => setNome(e.target.value)} required /></Campo>
        <Campo rotulo="Telefone do convidado (opcional)"><input inputMode="tel" value={contato} onChange={(e) => setContato(e.target.value)} /></Campo>
        <button className="btn primario">Pedir ingresso</button>
      </form>
    </Folha>
  )
}

/* ------------------------------------------------ Vender direto */
function Vender({ festa, onFechar, onOk }: { festa: FestaIng; onFechar: () => void; onOk: () => void }) {
  const app = useApp()
  const [f, setF] = useState({ nome: '', contato: '', pago: true })
  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    const { data, error } = await supabase.rpc('emitir_ingresso', { p_festa: festa.id, p_comprador: f.nome, p_contato: f.contato, p_pago: f.pago })
    if (error) return app.avisar(error.message, true)
    app.avisar('Ingresso ' + data + (f.pago ? ' emitido e pago.' : ' emitido, aguardando pagamento.')); onOk()
  }
  return (
    <Folha titulo={'Vender direto · ' + festa.titulo} onFechar={onFechar}>
      <form className="pilha" onSubmit={enviar}>
        <span className="small muted">Para quem pagou na mão ou por fora do app. Valor: <b>{reais(festa.ingresso_preco ?? 0)}</b>.</span>
        <Campo rotulo="Nome do comprador"><input value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} required /></Campo>
        <Campo rotulo="Telefone (opcional)"><input inputMode="tel" value={f.contato} onChange={(e) => setF({ ...f, contato: e.target.value })} /></Campo>
        <label className="linha" style={{ gap: 8 }}><input type="checkbox" style={{ width: 'auto' }} checked={f.pago} onChange={(e) => setF({ ...f, pago: e.target.checked })} /> Já recebi o pagamento</label>
        <button className="btn primario">Emitir ingresso</button>
      </form>
    </Folha>
  )
}

/* ------------------------------------------------ Lista (gerente) */
function Lista({ festa, onFechar }: { festa: FestaIng; onFechar: () => void }) {
  const app = useApp()
  const [lista, setLista] = useState<IngressoItem[] | null>(null)
  const [q, setQ] = useState('')
  const carregar = useCallback(async () => {
    const { data, error } = await supabase.rpc('ingressos_da_festa', { p_festa: festa.id })
    if (error) app.avisar(error.message, true)
    setLista(((data || []) as IngressoItem[]).map((i) => ({ ...i, valor: Number(i.valor) })))
  }, [festa.id]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { carregar() }, [carregar])

  async function acao(rpc: 'confirmar_pagamento' | 'cancelar_ingresso', i: IngressoItem, msg: string) {
    if (rpc === 'cancelar_ingresso' && !confirm(`Cancelar o ingresso de ${i.comprador}?${i.status === 'pago' ? ' Lembre-se de devolver o Pix.' : ''}`)) return
    const { error } = await supabase.rpc(rpc, { p_ingresso: i.id })
    if (error) return app.avisar(error.message, true)
    app.avisar(msg); carregar()
  }
  const f = (lista || []).filter((i) => !q || (i.comprador + i.codigo).toLowerCase().includes(q.toLowerCase()))
  return (
    <Folha titulo={'Ingressos · ' + festa.titulo} onFechar={onFechar}>
      <input placeholder="Buscar por nome ou código" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar" />
      {lista && f.length === 0 && <div className="card vazio">Nenhum ingresso {q ? 'encontrado' : 'ainda'}.</div>}
      {f.map((i) => (
        <div className="card" key={i.id}>
          <div className="linha entre"><b>{i.comprador}</b><span className={'chip ' + CHIP[i.status]}>{ROTULO[i.status]}</span></div>
          <span className="small muted">{i.codigo} · {reais(i.valor)}{i.vendedor ? ` · pedido por ${i.vendedor}` : ''}{i.contato ? ` · ${i.contato}` : ''}</span>
          <div className="linha quebra">
            {i.status === 'pendente' && <button className="btn mini primario" onClick={() => acao('confirmar_pagamento', i, 'Pagamento confirmado.')}>Confirmar pagamento</button>}
            {(i.status === 'pendente' || i.status === 'pago') && <button className="btn mini perigo" onClick={() => acao('cancelar_ingresso', i, 'Ingresso cancelado.')}>Cancelar</button>}
          </div>
        </div>
      ))}
    </Folha>
  )
}

/* ============================================================ Portaria */
export function Portaria() {
  const app = useApp()
  const rep = app.republica!
  const [festas, setFestas] = useState<FestaIng[]>([])
  const [fid, setFid] = useState('')
  const [lista, setLista] = useState<IngressoItem[]>([])
  const [q, setQ] = useState('')
  const [ultimo, setUltimo] = useState<{ ok: boolean; txt: string } | null>(null)

  useEffect(() => {
    supabase.rpc('festas_ingressos', { p_rep: rep.id }).then(({ data }) => {
      const l = ((data || []) as FestaIng[]).filter((x) => x.ingresso_preco !== null)
      setFestas(l)
      const h = hoje()
      setFid((cur) => cur || (l.find((x) => x.data >= h) || l[l.length - 1])?.id || '')
    })
  }, [rep.id])

  const carregar = useCallback(async () => {
    if (!fid) return setLista([])
    const { data } = await supabase.rpc('ingressos_da_festa', { p_festa: fid })
    setLista(((data || []) as IngressoItem[]).map((i) => ({ ...i, valor: Number(i.valor) })))
  }, [fid])
  useEffect(() => { carregar() }, [carregar])

  async function baixa(i: IngressoItem) {
    const { data, error } = await supabase.rpc('dar_baixa', { p_ingresso: i.id })
    if (error) setUltimo({ ok: false, txt: i.comprador + ': ' + error.message })
    else setUltimo({ ok: true, txt: 'Entrada liberada: ' + data })
    carregar()
  }

  const entradas = lista.filter((i) => i.status === 'usado').length
  const validos = lista.filter((i) => i.status === 'pago' || i.status === 'usado').length
  const busca = q.trim().toLowerCase()
  const f = lista.filter((i) => i.status !== 'cancelado' && (!busca || (i.comprador + i.codigo).toLowerCase().includes(busca)))
  const uso = (i: IngressoItem) => (i.usado_em ? new Date(i.usado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }) : '')

  return (
    <>
      <select aria-label="Festa" value={fid} onChange={(e) => setFid(e.target.value)}>
        {festas.length === 0 && <option value="">Nenhuma festa com ingressos</option>}
        {festas.map((x) => <option key={x.id} value={x.id}>{x.titulo} · {dataCurta(x.data)}</option>)}
      </select>
      <div className="card">
        <span className="small muted">Entradas dadas</span>
        <span className="num">{entradas} <span className="muted" style={{ fontSize: 16 }}>de {validos} ingressos pagos</span></span>
      </div>
      <input placeholder="Buscar por nome ou código" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar ingresso" autoComplete="off" />
      {ultimo && <div className="card" role="status" style={{ background: ultimo.ok ? 'var(--ok-bg)' : 'var(--ruim-bg)', color: ultimo.ok ? 'var(--ok-fg)' : 'var(--ruim-fg)', fontWeight: 700 }}>{ultimo.txt}</div>}
      {f.length === 0 && <div className="card vazio">{fid ? 'Nenhum ingresso encontrado.' : 'Escolha uma festa.'}</div>}
      {f.map((i) => (
        <div className="card" key={i.id}>
          <div className="linha entre"><b>{i.comprador}</b><span className={'chip ' + CHIP[i.status]}>{ROTULO[i.status]}</span></div>
          <span className="small muted">{i.codigo}{i.status === 'usado' ? ` · entrou às ${uso(i)}` : ''}</span>
          {i.status === 'pago' && <button className="btn primario" onClick={() => baixa(i)}>Dar baixa (liberar entrada)</button>}
          {i.status === 'pendente' && <span className="small muted">Pagamento ainda não confirmado. Não liberar.</span>}
        </div>
      ))}
    </>
  )
}
