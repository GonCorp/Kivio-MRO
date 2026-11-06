import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../lib/contexto'
import type { FestaCal, Lancamento, Multa, Ocorrencia } from '../lib/tipos'
import { dataCurta, hoje, primeiroDoMes, reais, somarDias, diasNoMes, nomeDiaExtenso } from '../lib/datas'
import type { Vista } from '../nav'

type Bloco = 'proxima' | 'saldo' | 'missoes' | 'multas' | 'atencao' | 'festas' | 'situacao' | 'ultimos' | 'graficos'
const ORDEM: Bloco[] = ['proxima', 'saldo', 'missoes', 'multas', 'atencao', 'festas', 'situacao', 'ultimos', 'graficos']
const NOME: Record<Bloco, string> = {
  proxima: 'Próxima festa da república', saldo: 'Saldo do caixa', missoes: 'Missões cumpridas', multas: 'Multas do mês',
  atencao: 'Precisa de você', festas: 'Próximas festas na cidade', situacao: 'Situação das missões', ultimos: 'Últimos lançamentos', graficos: 'Meus gráficos',
}
const LARGOS: Bloco[] = ['atencao', 'festas', 'situacao', 'ultimos', 'graficos']

interface Graf { id: number; fonte: string; tipo: 'barras' | 'colunas' | 'pizza' }
interface Prefs { ordem: Bloco[]; ocultos: Bloco[]; ultN: number; graficos: Graf[] }
const FONTES = [['es', 'Entradas e saídas'], ['receber', 'Cobranças: pago e a receber'], ['multas', 'Multas por integrante'], ['missoes', 'Missões por situação']] as const
const TIPOS = [['barras', 'Barras'], ['colunas', 'Colunas'], ['pizza', 'Pizza']] as const
const PALETA = ['#7c9cff', '#2fb27a', '#e0a21f', '#e5535f', '#b79cff', '#4cc3d9']

function lerPrefs(uid: string): Prefs {
  try {
    const p = JSON.parse(localStorage.getItem('mro-painel-' + uid) || 'null')
    if (p) return { ordem: p.ordem || ORDEM, ocultos: p.ocultos || [], ultN: p.ultN || 5, graficos: p.graficos || [] }
  } catch { /* sem armazenamento */ }
  return { ordem: ORDEM, ocultos: [], ultN: 5, graficos: [] }
}

interface Item { rotulo: string; valor: number; cor: string }

export default function Painel({ ir }: { ir: (v: Vista, intencao?: string) => void }) {
  const app = useApp()
  const rep = app.republica!
  const h = hoje()
  const mes = primeiroDoMes(h)
  const [prefs, setPrefs] = useState<Prefs>(() => lerPrefs(app.userId))
  const [cfg, setCfg] = useState(false)
  const [menu, setMenu] = useState<Bloco | null>(null)
  const [rapido, setRapido] = useState(false)
  const [fonte, setFonte] = useState('es')
  const [tipo, setTipo] = useState<Graf['tipo']>('barras')

  const [oc, setOc] = useState<Ocorrencia[]>([])
  const [semana, setSemana] = useState<Ocorrencia[]>([])
  const [multas, setMultas] = useState<Multa[]>([])
  const [lanc, setLanc] = useState<Lancamento[]>([])
  const [contas, setContas] = useState<Record<string, string>>({})
  const [itens, setItens] = useState<{ valor: number; pago: boolean }[]>([])
  const [festas, setFestas] = useState<FestaCal[]>([])
  const [pend, setPend] = useState(0)

  const salvar = (p: Prefs) => { setPrefs(p); try { localStorage.setItem('mro-painel-' + app.userId, JSON.stringify(p)) } catch { /* ok */ } }

  const carregar = useCallback(async () => {
    const t = app.tem
    const seg = somarDias(h, -((new Date(h + 'T12:00:00Z').getUTCDay() + 6) % 7))
    const [a, b, m, l, c, i, f, g] = await Promise.all([
      t('escala') ? supabase.rpc('ocorrencias', { p_rep: rep.id, p_de: mes, p_ate: somarDias(mes, diasNoMes(mes) - 1) }) : { data: [] },
      t('escala') ? supabase.rpc('ocorrencias', { p_rep: rep.id, p_de: seg, p_ate: somarDias(seg, 6) }) : { data: [] },
      t('escala') && t('multas') ? supabase.rpc('multas_do_mes', { p_rep: rep.id, p_mes: mes }) : { data: [] },
      t('financas') ? supabase.from('lancamentos').select('*').eq('republica_id', rep.id).order('data', { ascending: false }).order('created_at', { ascending: false }).limit(300) : { data: [] },
      t('financas') ? supabase.from('contas').select('id,nome').eq('republica_id', rep.id) : { data: [] },
      t('financas') ? supabase.from('cobranca_itens').select('valor,pago').eq('republica_id', rep.id) : { data: [] },
      t('calendario') || t('calendario_ver') ? supabase.rpc('calendario', { p_rep: rep.id, p_de: h, p_ate: somarDias(h, 180) }) : { data: [] },
      t('ingressos') ? supabase.rpc('festas_ingressos', { p_rep: rep.id }) : { data: [] },
    ])
    setOc((a.data || []) as Ocorrencia[]); setSemana((b.data || []) as Ocorrencia[]); setMultas((m.data || []) as Multa[])
    setLanc(((l.data || []) as Lancamento[]).map((x) => ({ ...x, valor: Number(x.valor) })))
    setContas(Object.fromEntries(((c.data || []) as { id: string; nome: string }[]).map((x) => [x.id, x.nome])))
    setItens(((i.data || []) as { valor: number; pago: boolean }[]).map((x) => ({ valor: Number(x.valor), pago: x.pago })))
    setFestas((f.data || []) as FestaCal[])
    setPend(((g.data || []) as { pendentes: number; data: string }[]).filter((x) => x.data >= h).reduce((s, x) => s + Number(x.pendentes), 0))
  }, [rep.id, h]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { carregar() }, [carregar])

  const lancMes = lanc.filter((x) => x.data.slice(0, 7) === mes.slice(0, 7))
  const entradas = lancMes.filter((x) => x.tipo === 'receita').reduce((s, x) => s + x.valor, 0)
  const saidas = lancMes.filter((x) => x.tipo === 'despesa').reduce((s, x) => s + x.valor, 0)
  const feitas = oc.filter((x) => x.status === 'feita').length
  const base = oc.filter((x) => ['feita', 'falta', 'justificada', 'em_analise'].includes(x.status)).length
  const analise = oc.filter((x) => x.status === 'em_analise').length
  const multaTotal = multas.reduce((s, x) => s + Number(x.valor), 0)
  const minhas = festas.filter((x) => x.minha)
  const proxima = minhas[0]
  const outras = festas.filter((x) => !x.minha).slice(0, 5)
  const nomeMembro = (id: string) => { const m = app.membros.find((x) => x.id === id); return (m && app.nomes[m.user_id]) || 'Integrante' }

  const alertas: { t: string; d: string; btn: string; go: () => void }[] = []
  if (analise > 0) alertas.push({ t: `${analise} justificativa(s) para decidir`, d: 'O integrante explicou a falta e espera a sua resposta.', btn: 'Decidir', go: () => ir('mis') })
  if (pend > 0) alertas.push({ t: `${pend} ingresso(s) esperando confirmação`, d: 'Confira o Pix recebido e marque como pago.', btn: 'Confirmar', go: () => ir('tickets') })
  if (rep.whatsapp_status !== 'verificado') alertas.push({ t: 'WhatsApp ainda não verificado', d: 'Mande o código para o número oficial para liberar a verificação.', btn: 'Ver código', go: () => ir('membros') })

  const situacao: Item[] = [
    { rotulo: 'Feitas', valor: semana.filter((x) => x.status === 'feita').length, cor: '#2fb27a' },
    { rotulo: 'Pendentes', valor: semana.filter((x) => x.status === 'pendente').length, cor: '#8795b3' },
    { rotulo: 'Em análise', valor: semana.filter((x) => x.status === 'em_analise').length, cor: '#7c9cff' },
    { rotulo: 'Justificadas', valor: semana.filter((x) => x.status === 'justificada').length, cor: '#e0a21f' },
    { rotulo: 'Não fez', valor: semana.filter((x) => x.status === 'falta').length, cor: '#e5535f' },
  ]
  const totalSem = situacao.reduce((s, x) => s + x.valor, 0)

  const dados = (f: string): { titulo: string; dinheiro: boolean; itens: Item[] } => {
    if (f === 'receber') return { titulo: 'Cobranças: pago e a receber', dinheiro: true, itens: [
      { rotulo: 'Já pago', valor: itens.filter((x) => x.pago).reduce((s, x) => s + x.valor, 0), cor: '#2fb27a' },
      { rotulo: 'A receber', valor: itens.filter((x) => !x.pago).reduce((s, x) => s + x.valor, 0), cor: '#e0a21f' }] }
    if (f === 'multas') {
      const por: Record<string, number> = {}
      multas.forEach((m) => { por[m.membro_id] = (por[m.membro_id] || 0) + Number(m.valor) })
      return { titulo: 'Multas por integrante', dinheiro: true, itens: Object.entries(por).map(([k, v], i) => ({ rotulo: nomeMembro(k), valor: v, cor: PALETA[i % PALETA.length] })) }
    }
    if (f === 'missoes') return { titulo: 'Missões por situação (semana)', dinheiro: false, itens: situacao.filter((x) => x.valor > 0) }
    return { titulo: 'Entradas e saídas (mês)', dinheiro: true, itens: [{ rotulo: 'Entradas', valor: entradas, cor: '#2fb27a' }, { rotulo: 'Saídas', valor: saidas, cor: '#e5535f' }] }
  }

  const visiveis = prefs.ordem.filter((b) => !prefs.ocultos.includes(b))
  const mover = (b: Bloco, d: -1 | 1) => {
    const o = [...prefs.ordem]; const i = o.indexOf(b); const j = i + d
    if (j < 0 || j >= o.length) return
    ;[o[i], o[j]] = [o[j], o[i]]
    salvar({ ...prefs, ordem: o }); setMenu(null)
  }
  const ocultar = (b: Bloco) => { salvar({ ...prefs, ocultos: [...prefs.ocultos, b] }); setMenu(null) }
  const alternar = (b: Bloco) => salvar({ ...prefs, ocultos: prefs.ocultos.includes(b) ? prefs.ocultos.filter((x) => x !== b) : [...prefs.ocultos, b] })

  const Moldura = ({ b, children }: { b: Bloco; children: React.ReactNode }) => (
    <div className={'bloco' + (LARGOS.includes(b) ? ' largo' : '')} style={{ order: visiveis.indexOf(b) }}>
      <button className="dots" aria-label={'Opções de ' + NOME[b]} onClick={() => setMenu(menu === b ? null : b)}>⋮</button>
      {menu === b && (
        <div className="menu">
          {b === 'ultimos' && [5, 10, 20].map((n) => <button key={n} onClick={() => { salvar({ ...prefs, ultN: n }); setMenu(null) }}>{prefs.ultN === n ? '✓ ' : ''}Últimos {n} lançamentos</button>)}
          <button onClick={() => mover(b, -1)}>Mover para antes</button>
          <button onClick={() => mover(b, 1)}>Mover para depois</button>
          <button onClick={() => ocultar(b)}>Ocultar este bloco</button>
        </div>
      )}
      {children}
    </div>
  )
  const Rot = ({ children }: { children: React.ReactNode }) => <span className="small muted" style={{ fontWeight: 600 }}>{children}</span>

  const Grafico = ({ g, tit, d, remover }: { g: Pick<Graf, 'tipo'>; tit: string; d: Item[]; remover?: () => void }) => {
    const tot = d.reduce((s, x) => s + x.valor, 0)
    const max = Math.max(...d.map((x) => x.valor), 1)
    const money = tit.includes('Entradas') || tit.includes('Cobranças') || tit.includes('Multas')
    const fmt = (v: number) => (money ? reais(v) : String(v))
    let cone = ''
    if (g.tipo === 'pizza' && tot > 0) { let a = 0; cone = d.map((x) => { const p = (x.valor / tot) * 100; const s = `${x.cor} ${a}% ${a + p}%`; a += p; return s }).join(', ') }
    return (
      <div className="card">
        <div className="linha entre"><h3>{tit}</h3>{remover && <button className="btn mini" onClick={remover} aria-label="Remover gráfico">Remover</button>}</div>
        {tot === 0 ? <span className="small muted">Ainda não há dados para este gráfico.</span> : (
          <>
            {g.tipo === 'pizza' && <div style={{ width: 140, height: 140, borderRadius: '50%', background: `conic-gradient(${cone})`, alignSelf: 'center', display: 'grid', placeItems: 'center' }}><div style={{ width: 80, height: 80, borderRadius: '50%', background: 'var(--card)', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 13, textAlign: 'center' }}>{fmt(tot)}</div></div>}
            {g.tipo === 'colunas' && <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, height: 120, padding: '0 8px' }}>{d.map((x) => <div key={x.rotulo} style={{ flex: 1, background: x.cor, height: Math.max(4, (x.valor / max) * 100) + '%', borderRadius: '6px 6px 0 0' }} title={x.rotulo + ': ' + fmt(x.valor)} />)}</div>}
            {d.map((x) => (
              <div className="linha" key={x.rotulo}>
                <i style={{ width: 10, height: 10, borderRadius: 3, background: x.cor, flex: 'none' }} />
                <span className="small" style={{ flex: '0 0 110px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{x.rotulo}</span>
                {g.tipo === 'barras' && <div className="barra"><i style={{ width: (x.valor / max) * 100 + '%', background: x.cor }} /></div>}
                <b className="small" style={{ marginLeft: 'auto' }}>{fmt(x.valor)}</b>
              </div>
            ))}
          </>
        )}
      </div>
    )
  }

  const ultimos = useMemo(() => lanc.slice(0, prefs.ultN), [lanc, prefs.ultN])
  const mostrar = (b: Bloco) => {
    if (!visiveis.includes(b)) return false
    if (b === 'saldo' || b === 'ultimos') return app.tem('financas')
    if (b === 'missoes' || b === 'situacao') return app.tem('escala')
    if (b === 'multas') return app.tem('escala') && app.tem('multas')
    if (b === 'proxima' || b === 'festas') return app.tem('calendario') || app.tem('calendario_ver')
    return true
  }

  return (
    <>
      <div className="acao-fixa">
        <button className="btn" onClick={() => setCfg(!cfg)}>{cfg ? 'Fechar configuração' : 'Configurar visão geral'}</button>
        {app.tem('financas') && <button className="btn primario" onClick={() => setRapido(!rapido)}>+ Lançar</button>}
        {rapido && (
          <div className="bloco menu" style={{ top: 52, right: 0, minWidth: 250, padding: 8 }}>
            {[['Despesa', 'despesa', '−'], ['Receita', 'receita', '+'], ['Nova cobrança', 'cobranca', '$'], ['Nova categoria', 'categoria', '#']].map(([n, k, s]) => (
              <button key={k} onClick={() => { setRapido(false); ir('fin', k) }}><b style={{ display: 'inline-block', width: 28 }}>{s}</b>{n}</button>
            ))}
          </div>
        )}
      </div>

      {cfg && (
        <div className="card" style={{ borderColor: 'var(--acento)' }}>
          <h2>Configurar visão geral</h2>
          <span className="small muted">Marque o que aparece no painel. Para mudar a posição, use os três pontinhos de cada bloco.</span>
          {ORDEM.map((b) => (
            <label key={b} className="linha entre" style={{ borderTop: '1px solid var(--linha)', paddingTop: 10 }}>
              <span>{NOME[b]}</span>
              <input type="checkbox" checked={!prefs.ocultos.includes(b)} onChange={() => alternar(b)} />
            </label>
          ))}
        </div>
      )}

      <div className="cartoes">
        {mostrar('proxima') && <Moldura b="proxima"><Rot>Próxima festa da república</Rot>
          <span className="grande">{proxima ? dataCurta(proxima.data) : '—'}</span>
          <span className="small muted">{proxima ? `${proxima.titulo} · ${nomeDiaExtenso(proxima.data)}` : 'Nenhuma festa marcada'}</span>
          <button className="btn mini" style={{ alignSelf: 'flex-start' }} onClick={() => ir('cal')}>Veja os detalhes no calendário</button></Moldura>}

        {mostrar('saldo') && <Moldura b="saldo"><Rot>Saldo do caixa</Rot>
          <span className={'grande' + (entradas - saidas < 0 ? ' num ruim' : '')}>{reais(entradas - saidas)}</span>
          <span className="small muted">Entradas menos saídas do mês</span></Moldura>}

        {mostrar('missoes') && <Moldura b="missoes"><Rot>Missões cumpridas</Rot>
          <span className="grande">{base ? Math.round((feitas / base) * 100) + '%' : '—'}</span>
          <span className="small muted">{analise ? `${analise} justificativa(s) para revisar` : `${feitas} de ${base} no mês`}</span></Moldura>}

        {mostrar('multas') && <Moldura b="multas"><Rot>Multas do mês</Rot>
          <span className="grande">{reais(multaTotal)}</span>
          <span className="small muted">Segundo as regras da sua república</span></Moldura>}

        {mostrar('atencao') && <Moldura b="atencao"><h2>Precisa de você</h2>
          {alertas.length === 0 && <span className="small muted">Tudo em dia. Nada esperando por você.</span>}
          {alertas.map((a) => (
            <div className="lista-linha" key={a.t}>
              <div style={{ flex: 1 }}><b className="small">{a.t}</b><br /><span className="small muted">{a.d}</span></div>
              <button className="btn mini primario" onClick={a.go}>{a.btn}</button>
            </div>
          ))}</Moldura>}

        {mostrar('festas') && <Moldura b="festas"><h2>Próximas festas na cidade</h2>
          {outras.length === 0 && <span className="small muted">Nenhuma outra república marcou festa ainda.</span>}
          {outras.map((u) => <div className="lista-linha" key={u.id}><b className="small" style={{ flex: 1 }}>{u.republica}</b><span className="small muted">{nomeDiaExtenso(u.data)}</span></div>)}</Moldura>}

        {mostrar('situacao') && <Moldura b="situacao"><h2>Situação das missões</h2><Rot>Semana atual</Rot>
          {totalSem === 0 && <span className="small muted">Nenhuma tarefa na escala desta semana.</span>}
          {totalSem > 0 && situacao.map((x) => (
            <div className="linha" key={x.rotulo}><span className="small" style={{ flex: '0 0 90px' }}>{x.rotulo}</span>
              <div className="barra"><i style={{ width: (x.valor / totalSem) * 100 + '%', background: x.cor }} /></div><b className="small">{x.valor}</b></div>
          ))}</Moldura>}

        {mostrar('ultimos') && <Moldura b="ultimos"><h2>Últimos lançamentos</h2>
          {ultimos.length === 0 && <span className="small muted">Nenhum lançamento ainda. Use o botão + Lançar.</span>}
          {ultimos.map((u) => (
            <div className="lista-linha" key={u.id}>
              <div style={{ flex: 1, minWidth: 0 }}><b className="small">{u.descricao}</b><br /><span className="small muted">{u.categoria || 'Sem categoria'} · {contas[u.conta_id] || 'Conta'}</span></div>
              <span className="small muted">{dataCurta(u.data)}</span>
              <b className="small" style={{ color: u.tipo === 'receita' ? 'var(--ok-fg)' : 'var(--ruim-fg)' }}>{u.tipo === 'receita' ? '+' : '−'}{reais(u.valor)}</b>
            </div>
          ))}</Moldura>}

        {mostrar('graficos') && <Moldura b="graficos"><h2>Meus gráficos</h2>
          <span className="small muted">Escolha o dado e o tipo de gráfico para montar o seu painel.</span>
          <div className="linha quebra">{FONTES.map(([k, n]) => <button key={k} className="chip" style={{ minHeight: 36, border: 0, cursor: 'pointer', background: fonte === k ? 'var(--acento)' : undefined, color: fonte === k ? 'var(--sobre-acento)' : undefined }} onClick={() => setFonte(k)}>{n}</button>)}</div>
          <div className="linha quebra">{TIPOS.map(([k, n]) => <button key={k} className="chip" style={{ minHeight: 36, border: 0, cursor: 'pointer', background: tipo === k ? 'var(--acento)' : undefined, color: tipo === k ? 'var(--sobre-acento)' : undefined }} onClick={() => setTipo(k)}>{n}</button>)}
            <button className="btn mini primario" onClick={() => salvar({ ...prefs, graficos: [...prefs.graficos, { id: Date.now(), fonte, tipo }] })}>Adicionar gráfico</button></div>
          {prefs.graficos.length === 0 && <div className="card vazio">Nenhum gráfico ainda. Escolha um dado e um tipo acima e toque em Adicionar gráfico.</div>}
          <div className="cartoes">{prefs.graficos.map((g) => { const d = dados(g.fonte); return <div key={g.id} style={{ flex: '1 1 280px' }}><Grafico g={g} tit={d.titulo} d={d.itens} remover={() => salvar({ ...prefs, graficos: prefs.graficos.filter((x) => x.id !== g.id) })} /></div> })}</div></Moldura>}
      </div>
    </>
  )
}
