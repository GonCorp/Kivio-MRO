import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../lib/contexto'
import { dataCurta, hoje, mesAnterior, mesSeguinte, nomeMes, primeiroDoMes, reais, somarDias } from '../lib/datas'
import { Folha } from '../components'

interface Resumo {
  integrantes: number
  tarefas?: { feitas: number; faltas: number; justificadas: number; em_analise: number }
  por_integrante?: { nome: string; feitas: number; faltas: number; multa: number }[]
  multas_total?: number
  financas?: { receitas: number; despesas: number; saldo_total: number; cobrancas_abertas: number; valor_em_aberto: number; inadimplentes: { nome: string; valor: number }[] }
  festas?: { titulo: string; data: string; vendidos: number; entradas: number; arrecadado: number }[]
}
interface Atv { id: number; quando: string; quem: string; acao: string; detalhe: Record<string, unknown> }

function frase(a: Atv): string {
  const d = a.detalhe || {}
  const s = (k: string) => (d[k] !== undefined && d[k] !== null ? String(d[k]) : '')
  switch (a.acao) {
    case 'republica_criada': return 'criou a república'
    case 'integrante_entrou': return 'entrou na república'
    case 'integrante_saiu': return 'saiu da república'
    case 'integrante_removido': return 'removeu um integrante'
    case 'lideranca_transferida': return 'passou a liderança'
    case 'convite_renovado': return 'gerou um novo código de convite'
    case 'tarefa_criada': return `criou a tarefa ${s('titulo') || s('nome')}`.trim()
    case 'tarefa_feita': return 'marcou uma tarefa como feita'
    case 'tarefa_desmarcada': return 'desfez a marcação de uma tarefa'
    case 'tarefa_encerrada': return 'encerrou uma tarefa'
    case 'justificativa_enviada': return 'enviou uma justificativa'
    case 'multas_configuradas': return 'configurou as multas'
    case 'conta_criada': return `criou a conta ${s('nome')}`.trim()
    case 'conta_removida': return `removeu a conta ${s('nome')}`.trim()
    case 'lancamento_criado': return `lançou ${s('tipo') === 'receita' ? 'uma receita' : 'uma despesa'}${s('descricao') ? ': ' + s('descricao') : ''}${d.valor ? ' (' + reais(Number(d.valor)) + ')' : ''}`
    case 'lancamento_removido': return 'removeu um lançamento'
    case 'cobranca_criada': return `criou a cobrança ${s('titulo')}`.trim()
    case 'cobranca_removida': return 'removeu uma cobrança'
    case 'cobranca_paga': return 'marcou uma cobrança como paga'
    case 'cobranca_desfeita': return 'desfez um pagamento de cobrança'
    case 'festa_marcada': return `marcou a festa ${s('titulo')}`.trim()
    case 'festa_cancelada': return `cancelou a festa ${s('titulo')}`.trim()
    case 'espacamento_definido': return 'ajustou o pedido de espaçamento entre festas'
    case 'ingressos_configurados': return `configurou os ingressos de ${s('festa')}`.trim()
    case 'ingresso_pedido': return `pediu ingresso para ${s('comprador')}`.trim()
    case 'ingresso_confirmado': return `confirmou o pagamento do ingresso de ${s('comprador')}`.trim()
    case 'ingresso_cancelado': return `cancelou o ingresso de ${s('comprador')}`.trim()
    case 'ingresso_usado': return `deu baixa no ingresso de ${s('comprador')}`.trim()
    default: return a.acao.replace(/_/g, ' ')
  }
}

export default function Relatorios({ onFechar }: { onFechar: () => void }) {
  const app = useApp()
  const rep = app.republica!
  const [aba, setAba] = useState<'resumo' | 'atividade'>('resumo')
  const [mes, setMes] = useState(primeiroDoMes(hoje()))
  const [r, setR] = useState<Resumo | null>(null)
  const [atv, setAtv] = useState<Atv[] | null>(null)

  const carregar = useCallback(async () => {
    setR(null); setAtv(null)
    if (aba === 'resumo') {
      const { data, error } = await supabase.rpc('resumo_mensal', { p_rep: rep.id, p_mes: mes })
      if (error) return app.avisar(error.message, true)
      setR(data as Resumo)
    } else {
      const fim = primeiroDoMes(mesSeguinte(mes))
      const { data, error } = await supabase.rpc('relatorio_atividades', { p_rep: rep.id, p_de: mes, p_ate: somarDias(fim, -1) })
      if (error) return app.avisar(error.message, true)
      setAtv((data || []) as Atv[])
    }
  }, [aba, mes, rep.id]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { carregar() }, [carregar])

  const quando = (t: string) => new Date(t).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })

  return (
    <Folha titulo="Relatórios" onFechar={onFechar}>
      <div className="seg" role="group" aria-label="Tipo de relatório">
        <button aria-pressed={aba === 'resumo'} onClick={() => setAba('resumo')}>Resumo do mês</button>
        <button aria-pressed={aba === 'atividade'} onClick={() => setAba('atividade')}>Atividades</button>
      </div>
      <div className="linha entre">
        <button className="btn mini" onClick={() => setMes(mesAnterior(mes))} aria-label="Mês anterior">‹</button>
        <b>{nomeMes(mes)}</b>
        <button className="btn mini" onClick={() => setMes(mesSeguinte(mes))} aria-label="Próximo mês">›</button>
      </div>

      {aba === 'resumo' && r && (
        <>
          <span className="small muted">Pronto para a reunião mensal. {r.integrantes} integrante(s) ativo(s).</span>
          {r.tarefas && (
            <div className="card">
              <b>Tarefas</b>
              <span className="small">{r.tarefas.feitas} feitas · {r.tarefas.faltas} faltas · {r.tarefas.justificadas} justificadas{r.tarefas.em_analise ? ` · ${r.tarefas.em_analise} em análise` : ''}</span>
              {r.multas_total !== undefined && <span className="small">Multas do mês: <b>{reais(r.multas_total)}</b></span>}
              {(r.por_integrante || []).map((p) => (
                <div className="linha entre small" key={p.nome}><span>{p.nome}</span><span className="muted">{p.feitas} feitas · {p.faltas} faltas{p.multa ? ' · ' + reais(p.multa) : ''}</span></div>
              ))}
            </div>
          )}
          {r.financas && (
            <div className="card">
              <b>Finanças</b>
              <span className="small">Receitas {reais(r.financas.receitas)} · despesas {reais(r.financas.despesas)}</span>
              <span className="small">Saldo atual das contas: <b>{reais(r.financas.saldo_total)}</b></span>
              <span className="small">Cobranças em aberto: {r.financas.cobrancas_abertas} ({reais(r.financas.valor_em_aberto)})</span>
              {r.financas.inadimplentes.length > 0 && (
                <>
                  <span className="small muted">Atrasadas (venceram e não foram pagas):</span>
                  {r.financas.inadimplentes.map((i) => <div className="linha entre small" key={i.nome}><span>{i.nome}</span><b>{reais(i.valor)}</b></div>)}
                </>
              )}
            </div>
          )}
          {r.festas && (
            <div className="card">
              <b>Festas do mês</b>
              {r.festas.length === 0 && <span className="small muted">Nenhuma festa neste mês.</span>}
              {r.festas.map((f) => (
                <div className="linha entre small" key={f.titulo + f.data}>
                  <span>{f.titulo} · {dataCurta(f.data)}</span>
                  <span className="muted">{f.vendidos} vendidos · {f.entradas} entradas · {reais(f.arrecadado)}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {aba === 'atividade' && atv && (
        <>
          <span className="small muted">Quem fez o quê e quando. Mostra até as 300 ações mais recentes do mês.</span>
          {atv.length === 0 && <div className="card vazio">Nenhuma atividade neste mês.</div>}
          {atv.map((a) => (
            <div className="card" key={a.id}>
              <span className="small"><b>{a.quem}</b> {frase(a)}</span>
              <span className="small muted">{quando(a.quando)}</span>
            </div>
          ))}
        </>
      )}
    </Folha>
  )
}
