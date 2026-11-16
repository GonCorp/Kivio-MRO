import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../lib/contexto'
import type { Faixa } from '../lib/tipos'
import { reais } from '../lib/datas'
import { lerValor } from '../lib/dinheiro'

interface Motivo { id: string; motivo: string; acao: 'aceitar' | 'analisar' | 'recusar' }
const ACOES: [Motivo['acao'], string][] = [['aceitar', 'Aceitar direto'], ['analisar', 'Analisar'], ['recusar', 'Não aceitar']]
const FOTO: [string, string][] = [['desligada', 'Desligada'], ['opcional', 'Opcional'], ['obrigatoria', 'Obrigatória']]

function useRegras() {
  const app = useApp()
  const rep = app.republica!
  const [faixas, setFaixas] = useState<Faixa[]>([])
  const [motivos, setMotivos] = useState<Motivo[]>([])
  const carregar = useCallback(async () => {
    const [f, m] = await Promise.all([
      supabase.from('faixas_multa').select('faixa,valor').eq('republica_id', rep.id).order('faixa'),
      supabase.from('motivos_justificativa').select('id,motivo,acao').eq('republica_id', rep.id).order('created_at'),
    ])
    setFaixas(((f.data || []) as Faixa[]).map((x) => ({ ...x, valor: Number(x.valor) })))
    setMotivos((m.data || []) as Motivo[])
  }, [rep.id])
  useEffect(() => { carregar() }, [carregar])
  return { faixas, motivos, carregar }
}

/* ------------------------------------------------------------ Líder: editar */
export default function Regras() {
  const app = useApp()
  const rep = app.republica!
  const { faixas, motivos, carregar } = useRegras()
  const lider = app.membro?.papel === 'lider'
  const [valores, setValores] = useState<string[] | null>(null)
  const [tetoOn, setTetoOn] = useState(false)
  const [tetoTxt, setTetoTxt] = useState('')
  const [foto, setFoto] = useState(rep.foto_missao || 'desligada')
  const [dias, setDias] = useState(String(rep.espacamento_dias ?? 3))
  const [novo, setNovo] = useState('')
  const [novaAcao, setNovaAcao] = useState<Motivo['acao']>('analisar')

  useEffect(() => { setValores((v) => v ?? faixas.map((f) => String(f.valor))) }, [faixas])
  useEffect(() => { setTetoOn(rep.teto_multa != null); setTetoTxt(rep.teto_multa != null ? String(rep.teto_multa) : '') }, [rep.teto_multa])
  const lista = valores ?? []
  const num = (s: string) => lerValor(s) ?? 0

  if (!lider) return <RegrasLeitura />

  async function salvarMultas() {
    if (lista.length < 1) return app.avisar('Defina ao menos uma faixa.', true)
    const { error } = await supabase.rpc('salvar_faixas', { p_rep: rep.id, p_valores: lista.map(num), p_teto: tetoOn ? num(tetoTxt) : 0 })
    if (error) return app.avisar(error.message, true)
    app.avisar('Regras de multa salvas.'); await app.recarregar(); carregar()
  }
  async function salvarGerais() {
    const { error } = await supabase.rpc('salvar_regras_gerais', { p_rep: rep.id, p_foto: foto, p_dias: Math.max(0, Math.min(30, Number(dias) || 0)) })
    if (error) return app.avisar(error.message, true)
    app.avisar('Regras salvas.'); await app.recarregar()
  }
  async function motivo(m: Motivo | null, texto: string, acao: Motivo['acao']) {
    const { error } = await supabase.rpc('salvar_motivo', { p_rep: rep.id, p_motivo: texto, p_acao: acao, p_id: m?.id ?? null })
    if (error) return app.avisar(error.message, true)
    if (!m) setNovo('')
    carregar()
  }
  async function tirar(m: Motivo) {
    const { error } = await supabase.rpc('remover_motivo', { p_id: m.id })
    if (error) return app.avisar(error.message, true)
    carregar()
  }
  const resumo = lista.length === 0 ? 'Nenhuma faixa definida: as faltas ainda não geram multa.'
    : lista.map((v, i) => `${i + 1}ª falta: ${reais(num(v))}`).join(' · ') + (lista.length > 1 ? ` (depois repete ${reais(num(lista[lista.length - 1]))})` : ' (fixa)')

  return (
    <div className="cartoes" style={{ alignItems: 'flex-start' }}>
      <div className="bloco" style={{ flex: '1 1 340px' }}>
        <h2>Valor da multa por falta</h2>
        <span className="small muted">Cada falta no mês tem seu valor. Depois da última faixa, o valor dela se repete. Para multa fixa, deixe só uma faixa.</span>
        {lista.map((v, i) => (
          <div className="linha" key={i}>
            <span className="small grow" style={{ fontWeight: 700 }}>{i + 1}ª falta</span>
            <span className="muted">R$</span>
            <input style={{ width: 100 }} inputMode="decimal" value={v} aria-label={`Valor da ${i + 1}ª falta`} onChange={(e) => setValores(lista.map((x, j) => (j === i ? e.target.value : x)))} />
            <button className="btn mini" aria-label="Remover faixa" onClick={() => setValores(lista.filter((_, j) => j !== i))}>-</button>
          </div>
        ))}
        {lista.length < 8 && <button className="btn" style={{ borderStyle: 'dashed' }} onClick={() => setValores([...lista, lista[lista.length - 1] || ''])}>Adicionar faixa</button>}
        <div className="card" style={{ background: 'var(--suave)' }}><span className="small">Resumo: {resumo}</span></div>

        <h3>Teto mensal de multas (opcional)</h3>
        <span className="small muted">Define quanto a república aceita arrecadar em multas por mês. O resumo da reunião avisa quando o teto estoura.</span>
        <div className="linha">
          <button className={'btn mini' + (!tetoOn ? ' primario' : '')} onClick={() => setTetoOn(false)}>Sem teto</button>
          <button className={'btn mini' + (tetoOn ? ' primario' : '')} onClick={() => setTetoOn(true)}>Com teto</button>
          {tetoOn && <><span className="muted">R$</span><input style={{ width: 110 }} inputMode="decimal" value={tetoTxt} aria-label="Valor do teto mensal" onChange={(e) => setTetoTxt(e.target.value)} /><span className="muted small">por mês</span></>}
        </div>
        <button className="btn primario" onClick={salvarMultas}>Salvar regras de multa</button>
      </div>

      <div className="pilha" style={{ flex: '1 1 340px' }}>
        <div className="bloco">
          <h2>Foto de comprovação</h2>
          <span className="small muted">O integrante manda uma foto ao concluir a tarefa, como no grupo do WhatsApp. O líder vê a foto no quadro de missões.</span>
          <div className="linha quebra">{FOTO.map(([k, n]) => <button key={k} className={'btn mini' + (foto === k ? ' primario' : '')} onClick={() => setFoto(k as typeof foto)}>{n}</button>)}</div>
          {foto !== 'desligada' && <span className="small" style={{ color: 'var(--aviso-fg)' }}>A regra já fica salva. O envio da foto pelo app está sendo preparado e chega em breve.</span>}
        </div>
        <div className="bloco">
          <h2>Pedido de espaçamento entre festas</h2>
          <span className="small muted">Peça para as outras repúblicas não marcarem festa perto das suas. O pedido aparece para todo mundo na hora de marcar.</span>
          <div className="linha"><label className="small grow" style={{ fontWeight: 700 }} htmlFor="buf">Dias antes e depois da nossa festa</label>
            <input id="buf" style={{ width: 90 }} inputMode="numeric" value={dias} onChange={(e) => setDias(e.target.value.replace(/\D/g, ''))} /></div>
          <div className="card" style={{ background: 'var(--suave)' }}><span className="small">{Number(dias) > 0 ? `Pedimos que ninguém marque festa até ${dias} dia(s) antes ou depois da nossa.` : 'Sem pedido de espaçamento.'}</span></div>
          <span className="small muted">É um pedido, não um bloqueio. Outras repúblicas ainda podem marcar mais perto se quiserem.</span>
          <button className="btn primario" onClick={salvarGerais}>Salvar foto e espaçamento</button>
        </div>
      </div>

      <div className="bloco" style={{ flex: '1 1 100%' }}>
        <h2>Justificativas: o que a república aceita</h2>
        <span className="small muted">Aceitar direto: vira falta justificada sem você precisar olhar. Analisar: chega no seu painel para você decidir. Não aceitar: conta como falta na hora.</span>
        {motivos.length === 0 && <span className="small muted">Nenhum motivo combinado ainda. Adicione abaixo (ex.: Prova, Consulta médica).</span>}
        {motivos.map((m) => (
          <div className="lista-linha" key={m.id}>
            <b className="grow">{m.motivo}</b>
            <div className="linha quebra">{ACOES.map(([k, n]) => <button key={k} className={'btn mini' + (m.acao === k ? ' primario' : '')} onClick={() => motivo(m, m.motivo, k)}>{n}</button>)}</div>
            <button className="btn mini" onClick={() => tirar(m)}>Remover</button>
          </div>
        ))}
        <span className="small muted">Outro motivo (texto livre): sempre vai para o líder analisar.</span>
        <div className="linha quebra">
          <input style={{ flex: '1 1 180px' }} value={novo} placeholder="Novo motivo, ex.: Estágio" aria-label="Novo motivo" onChange={(e) => setNovo(e.target.value)} />
          <select style={{ width: 'auto' }} aria-label="Resposta" value={novaAcao} onChange={(e) => setNovaAcao(e.target.value as Motivo['acao'])}>{ACOES.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select>
          <button className="btn primario" onClick={() => motivo(null, novo, novaAcao)}>Adicionar motivo</button>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------ Integrante: só leitura */
export function RegrasLeitura() {
  const app = useApp()
  const rep = app.republica!
  const { faixas, motivos } = useRegras()
  const meuId = app.membro?.id
  const [faltas, setFaltas] = useState(0)
  useEffect(() => {
    const mes = new Date(); mes.setDate(1)
    supabase.rpc('multas_do_mes', { p_rep: rep.id, p_mes: mes.toISOString().slice(0, 10) }).then(({ data }) => setFaltas(((data || []) as { membro_id: string }[]).filter((x) => x.membro_id === meuId).length))
  }, [rep.id, meuId])
  const prox = faixas.length ? faixas[Math.min(faltas + 1, faixas.length) - 1].valor : null
  const fotoTxt = rep.foto_missao === 'obrigatoria' ? 'Ao concluir uma tarefa, você precisa mandar uma foto.' : rep.foto_missao === 'opcional' ? 'Mandar foto ao concluir a tarefa é opcional.' : 'A república não pede foto ao concluir tarefas.'
  const tag = (a: Motivo['acao']) => a === 'aceitar' ? ['Aceito direto', 'ok'] : a === 'recusar' ? ['Não aceito', 'ruim'] : ['Líder analisa', 'aviso']
  return (
    <div className="pilha">
      <div className="bloco" style={{ background: 'color-mix(in srgb, var(--acento) 12%, var(--card))' }}>
        <span className="small" style={{ fontWeight: 800, letterSpacing: '.04em', color: 'var(--acento)' }}>SOMENTE LEITURA</span>
        <span>Estas regras foram definidas pelo líder. Se achar que alguma precisa mudar, converse com ele na reunião.</span>
        <span className="small muted">{prox != null ? `Sua próxima falta neste mês custa ${reais(prox)}.` : 'Ainda não há valor de multa definido.'}</span>
      </div>
      <div className="cartoes" style={{ alignItems: 'flex-start' }}>
        <div className="bloco" style={{ flex: '1 1 340px' }}>
          <h2>Valor da multa por falta</h2>
          {faixas.length === 0 && <span className="small muted">Nenhuma faixa definida ainda.</span>}
          {faixas.map((f) => <div className="lista-linha" key={f.faixa}><span className="grow small" style={{ fontWeight: 600 }}>{f.faixa}ª falta</span><b>{reais(f.valor)}</b></div>)}
          <span className="small muted">Depois da última faixa, o valor dela se repete a cada nova falta no mês.{rep.teto_multa != null ? ` Teto mensal da casa: ${reais(rep.teto_multa)}.` : ''}</span>
        </div>
        <div className="pilha" style={{ flex: '1 1 340px' }}>
          <div className="bloco"><h2>Prazo das tarefas</h2><span className="small">A tarefa vale até o fim do dia marcado na escala. Se o prazo acabar sem você marcar como feita, a falta conta, a não ser que você justifique ao líder.</span></div>
          <div className="bloco"><h2>Foto de comprovação</h2><span className="small">{fotoTxt}</span></div>
          <div className="bloco"><h2>Festas</h2><span className="small">{rep.espacamento_dias > 0 ? `A república pede que ninguém marque festa até ${rep.espacamento_dias} dia(s) antes ou depois da nossa.` : 'Sem pedido de espaçamento entre festas.'}</span></div>
        </div>
      </div>
      <div className="bloco">
        <h2>Justificativas: o que a república aceita</h2>
        <span className="small muted">Ao justificar uma falta, estes motivos já têm resposta definida pelo líder.</span>
        {motivos.length === 0 && <span className="small muted">Nenhum motivo combinado ainda.</span>}
        {motivos.map((m) => <div className="lista-linha" key={m.id}><b className="grow">{m.motivo}</b><span className={'chip ' + tag(m.acao)[1]}>{tag(m.acao)[0]}</span></div>)}
        <span className="small muted">Outro motivo (texto livre): sempre vai para o líder analisar.</span>
      </div>
    </div>
  )
}
