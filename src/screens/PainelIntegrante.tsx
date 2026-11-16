import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { nomeDoMembro, useApp } from '../lib/contexto'
import type { Faixa, MinhaCobranca, Ocorrencia } from '../lib/tipos'
import { dataCurta, hoje, nomeMes, primeiroDoMes, reais } from '../lib/datas'
import type { Vista } from '../nav'

const PALETA = ['#7c9cff', '#2fb27a', '#e0a21f', '#e5535f', '#b79cff', '#4cc3d9', '#ec4899', '#14b8a6']
type Grafico = 'barras' | 'colunas' | 'anel'

export default function PainelIntegrante({ ir }: { ir: (v: Vista) => void }) {
  const app = useApp()
  const rep = app.republica!
  const meuId = app.membro!.id
  const mes = primeiroDoMes(hoje())
  const [oc, setOc] = useState<Ocorrencia[]>([])
  const [faixas, setFaixas] = useState<Faixa[]>([])
  const [cobs, setCobs] = useState<MinhaCobranca[]>([])
  const [grafico, setGrafico] = useState<Grafico>('barras')

  useEffect(() => {
    const fim = new Date(mes + 'T00:00:00Z'); fim.setUTCMonth(fim.getUTCMonth() + 1); fim.setUTCDate(0)
    Promise.all([
      supabase.rpc('ocorrencias', { p_rep: rep.id, p_de: mes, p_ate: fim.toISOString().slice(0, 10) }),
      supabase.from('faixas_multa').select('faixa,valor').eq('republica_id', rep.id).order('faixa'),
      supabase.rpc('minhas_cobrancas', { p_rep: rep.id }),
    ]).then(([o, f, c]) => {
      setOc((o.data || []) as Ocorrencia[])
      setFaixas(((f.data || []) as Faixa[]).map((x) => ({ ...x, valor: Number(x.valor) })))
      setCobs(((c.data || []) as MinhaCobranca[]).map((x) => ({ ...x, valor: Number(x.valor) })))
    })
  }, [rep.id, mes])

  const valorFalta = (n: number) => (faixas.length ? faixas[Math.min(n, faixas.length) - 1].valor : 0)
  const multaDe = (faltas: number) => Array.from({ length: faltas }, (_, i) => valorFalta(i + 1)).reduce((a, b) => a + b, 0)

  const pessoas = useMemo(() => {
    const ativos = app.membros.filter((m) => m.ativo)
    return ativos.map((m, i) => {
      const meus = oc.filter((o) => o.membro_id === m.id && o.status !== 'pendente')
      const feitas = meus.filter((o) => o.status === 'feita' || o.status === 'justificada').length
      const faltas = meus.filter((o) => o.status === 'falta').length
      const total = meus.length
      return { id: m.id, cor: PALETA[i % PALETA.length], feitas, faltas, total, pct: total ? Math.round((feitas / total) * 100) : null as number | null, multa: multaDe(faltas) }
    })
  }, [app.membros, oc, faixas]) // eslint-disable-line react-hooks/exhaustive-deps

  const eu = pessoas.find((p) => p.id === meuId)
  const media = (f: (p: (typeof pessoas)[number]) => number | null) => { const v = pessoas.map(f).filter((x): x is number => x !== null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0 }
  const mediaPct = media((p) => p.pct), mediaFaltas = media((p) => p.faltas), mediaMulta = media((p) => p.multa)
  const pagas = cobs.filter((c) => c.pago).length
  const abertas = cobs.filter((c) => !c.pago)
  const devo = abertas.reduce((s, c) => s + c.valor, 0)

  const nomeColega = (id: string, idx: number) => (id === meuId ? 'Você' : rep.comparar_nomes ? nomeDoMembro(app, id) : `Colega ${idx}`)
  let seq = 0
  const linhas = [...pessoas].sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1)).map((p) => ({ ...p, rotulo: p.id === meuId ? 'Você' : nomeColega(p.id, ++seq) }))
  const comPct = linhas.filter((l) => l.pct !== null)
  const pos = comPct.findIndex((l) => l.id === meuId) + 1

  const tag = (v: number, m: number, maiorMelhor: boolean) => {
    const perto = Math.abs(v - m) <= (maiorMelhor ? 3 : 0.5)
    if (perto) return ['Na média da casa', 'neutro'] as const
    return (maiorMelhor ? v > m : v < m) ? ['Melhor que a média', 'ok'] as const : ['Abaixo da média', 'aviso'] as const
  }
  const barras = eu ? [
    { rotulo: 'Missões cumpridas', voce: eu.pct ?? 0, casa: mediaPct, max: 100, txt: (v: number) => Math.round(v) + '%', t: tag(eu.pct ?? 0, mediaPct, true) },
    { rotulo: 'Faltas no mês', voce: eu.faltas, casa: mediaFaltas, max: Math.max(1, eu.faltas, mediaFaltas), txt: (v: number) => String(Math.round(v * 10) / 10).replace('.', ','), t: tag(eu.faltas, mediaFaltas, false) },
    { rotulo: 'Multas', voce: eu.multa, casa: mediaMulta, max: Math.max(1, eu.multa, mediaMulta), txt: (v: number) => reais(v), t: tag(eu.multa, mediaMulta, false) },
  ] : []
  const totalMultasCasa = pessoas.reduce((s, p) => s + p.multa, 0)
  const parte = totalMultasCasa > 0 && eu ? Math.round((eu.multa / totalMultasCasa) * 100) : 0

  const dicas: string[] = []
  if (eu && eu.faltas > mediaFaltas) dicas.push(`Você tem mais faltas que a média da casa. A próxima falta custa ${reais(valorFalta(eu.faltas + 1))}.`)
  if (eu && eu.total > 0 && eu.faltas === 0) dicas.push('Nenhuma falta neste mês. Continue assim.')
  if (abertas.length) dicas.push(`Você tem ${abertas.length} cobrança(s) em aberto, somando ${reais(devo)}.`)
  if (!dicas.length) dicas.push('Tudo certo por aqui. Quando houver missões e cobranças, o resumo aparece neste quadro.')

  const Cartao = ({ r, v, s }: { r: string; v: string; s?: string }) => <div className="bloco"><span className="muted small">{r}</span><span className="grande">{v}</span>{s && <span className="small muted">{s}</span>}</div>
  const letra = (nomeDoMembro(app, meuId) || 'V').charAt(0).toUpperCase()

  return (
    <div className="pilha">
      <div className="bloco" style={{ flexDirection: 'row', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <span style={{ width: 56, height: 56, borderRadius: '50%', background: eu?.cor || PALETA[0], color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 22, flex: 'none' }}>{letra}</span>
        <div className="grow" style={{ flex: '1 1 180px', display: 'flex', flexDirection: 'column' }}><b style={{ fontSize: 17 }}>{nomeDoMembro(app, meuId)}</b><span className="small muted">{nomeMes(mes)} · como você está na casa</span></div>
        <button className="btn" onClick={() => ir('perfil')}>Personalizar</button>
      </div>

      <div className="cartoes">
        <Cartao r="Missões feitas" v={eu && eu.total ? `${eu.feitas} de ${eu.total}` : '—'} s={eu?.pct != null ? `${eu.pct}% cumpridas` : 'Sem missões no mês'} />
        <Cartao r="Faltas no mês" v={String(eu?.faltas ?? 0)} />
        <Cartao r="Multas" v={reais(eu?.multa ?? 0)} s={faixas.length ? `Próxima falta: ${reais(valorFalta((eu?.faltas ?? 0) + 1))}` : 'Sem valor de multa definido'} />
        <Cartao r="Cobranças pagas" v={cobs.length ? `${pagas} de ${cobs.length}` : '—'} s={abertas.length ? `Faltam ${reais(devo)}` : cobs.length ? 'Tudo em dia' : 'Nenhuma cobrança'} />
      </div>

      <div className="cartoes" style={{ alignItems: 'flex-start' }}>
        <div className="bloco" style={{ flex: '1 1 340px' }}>
          <h2>Você e a média da casa</h2>
          <span className="small muted">Barra colorida = você. Barra cinza = média dos integrantes.</span>
          {barras.map((b) => (
            <div key={b.rotulo} className="pilha" style={{ gap: 6 }}>
              <div className="linha entre quebra"><b className="small">{b.rotulo}</b><span className={'chip ' + (b.t[1] === 'neutro' ? '' : b.t[1])}>{b.t[0]}</span></div>
              <div className="linha"><div className="barra grow"><i style={{ width: (b.voce / b.max) * 100 + '%' }} /></div><b className="small" style={{ width: 80, textAlign: 'right' }}>{b.txt(b.voce)}</b></div>
              <div className="linha"><div className="barra grow"><i style={{ width: (b.casa / b.max) * 100 + '%', background: 'var(--linha)' }} /></div><span className="small muted" style={{ width: 80, textAlign: 'right' }}>{b.txt(b.casa)}</span></div>
            </div>
          ))}
        </div>

        <div className="pilha" style={{ flex: '1 1 340px' }}>
          <div className="bloco">
            <h2>Sua parte nas multas da casa</h2>
            <div className="barra" style={{ height: 14 }}><i style={{ width: parte + '%', background: parte > 50 ? 'var(--ruim-fg)' : 'var(--acento)' }} /></div>
            <span className="small" style={{ fontWeight: 600 }}>{totalMultasCasa > 0 ? `Você responde por ${parte}% das multas da casa neste mês (${reais(eu?.multa ?? 0)} de ${reais(totalMultasCasa)}).` : 'Ainda não há multas na casa neste mês.'}</span>
          </div>

          <div className="bloco">
            <div className="linha entre quebra"><h2>Comparação com os colegas</h2>
              <div className="seg" role="group" aria-label="Tipo de gráfico" style={{ width: 'auto' }}>
                {([['barras', 'Barras'], ['colunas', 'Colunas'], ['anel', 'Anel']] as [Grafico, string][]).map(([k, n]) => <button key={k} aria-pressed={grafico === k} onClick={() => setGrafico(k)}>{n}</button>)}
              </div>
            </div>
            <span className="small muted">{pessoas.length < 2 ? 'Ainda não há colegas para comparar.' : comPct.length === 0 || pos === 0 ? 'Quando você tiver missões, o ranking aparece aqui.' : `Você está em ${pos}º lugar de ${comPct.length} nas missões cumpridas.`} Cada pessoa tem a sua cor.{!rep.comparar_nomes && pessoas.length > 1 ? ' Os colegas aparecem sem nome.' : ''}</span>
            {grafico === 'barras' && linhas.map((l) => (
              <div className="linha" key={l.id}>
                <span className="small" style={{ width: 84, fontWeight: l.id === meuId ? 800 : 500 }}>{l.rotulo}</span>
                <div className="barra grow" style={{ border: l.id === meuId ? '2px solid var(--texto)' : undefined }}><i style={{ width: (l.pct ?? 0) + '%', background: l.cor }} /></div>
                <b className="small" style={{ width: 44, textAlign: 'right' }}>{l.pct === null ? '—' : l.pct + '%'}</b>
              </div>
            ))}
            {grafico === 'colunas' && (
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, height: 170 }}>
                {linhas.map((l) => (
                  <div key={l.id} style={{ flex: '1 1 0', minWidth: 0, height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
                    <span style={{ fontSize: 11, fontWeight: 700 }}>{l.pct === null ? '—' : l.pct + '%'}</span>
                    <div style={{ width: '100%', maxWidth: 44, height: Math.max(4, l.pct ?? 0) + '%', background: l.cor, borderRadius: '6px 6px 0 0', border: l.id === meuId ? '2px solid var(--texto)' : undefined }} />
                    <span style={{ fontSize: 11, fontWeight: l.id === meuId ? 800 : 500, overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>{l.rotulo.slice(0, 7)}</span>
                  </div>
                ))}
              </div>
            )}
            {grafico === 'anel' && (() => {
              const soma = comPct.reduce((s, l) => s + l.feitas, 0)
              let acc = 0
              const fatias = soma ? comPct.map((l) => { const a = acc; acc += (l.feitas / soma) * 100; return `${l.cor} ${a}% ${acc}%` }).join(', ') : 'var(--linha) 0% 100%'
              return <div style={{ display: 'flex', justifyContent: 'center' }}><div style={{ position: 'relative', width: 170, height: 170, borderRadius: '50%', background: `conic-gradient(${fatias})` }}>
                <div style={{ position: 'absolute', inset: 25, borderRadius: '50%', background: 'var(--card)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13, textAlign: 'center' }}><span>{soma} feitas</span><span className="muted" style={{ fontSize: 11, fontWeight: 600 }}>missões da casa</span></div></div></div>
            })()}
            {grafico === 'anel' && linhas.map((l) => (
              <div className="linha" key={l.id}><span style={{ width: 12, height: 12, borderRadius: 3, background: l.cor, flex: 'none' }} /><span className="grow small" style={{ fontWeight: l.id === meuId ? 800 : 500 }}>{l.rotulo}</span><b className="small">{l.pct === null ? '—' : l.pct + '%'}</b></div>
            ))}
          </div>
        </div>
      </div>

      {abertas.length > 0 && (
        <div className="bloco">
          <h2>Cobranças para você</h2>
          <span className="small muted">Se apareceu uma cobrança, é só pagar ao responsável e avisar.</span>
          {abertas.slice(0, 4).map((c) => <div className="lista-linha" key={c.item_id}><b className="grow">{c.titulo}</b><span className="small muted">{c.vencimento ? 'vence ' + dataCurta(c.vencimento) : ''}</span><b>{reais(c.valor)}</b></div>)}
          <button className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => ir('cobr')}>Ver minhas cobranças</button>
        </div>
      )}

      <div className="bloco" style={{ borderStyle: 'dashed', background: 'var(--suave)' }}>
        <b>Está dentro do esperado?</b>
        {dicas.map((d) => <span className="small" key={d}>{d}</span>)}
      </div>
    </div>
  )
}
