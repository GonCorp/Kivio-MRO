import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Campo, Folha } from '../components'
import { useAdm } from './AdminApp'
import type { Cidade, PlanoCfg } from './tipos'
import { APP_URL, waLink } from './util'

function gerarSenha(): string {
  const alfabeto = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const v = new Uint32Array(10)
  crypto.getRandomValues(v)
  return Array.from(v, (n) => alfabeto[n % alfabeto.length]).join('')
}

function mais1Mes(): string {
  const d = new Date(); d.setMonth(d.getMonth() + 1)
  return d.toISOString().slice(0, 10)
}

export default function NovaRepublica({ planos, onFechar, onCriada }: { planos: PlanoCfg[]; onFechar: () => void; onCriada: () => void }) {
  const { avisar } = useAdm()
  const [demo, setDemo] = useState(false)
  const [cidades, setCidades] = useState<Cidade[]>([])
  const [f, setF] = useState({ republica: '', cidade: '', nome: '', whatsapp: '', email: '', senha: gerarSenha(), plano: 'basico', vencimento: mais1Mes(), valor: '' })
  const [ocupado, setOcupado] = useState(false)
  const [pronto, setPronto] = useState<{ email: string; senha: string; nome: string; whatsapp: string; republica: string } | null>(null)

  useEffect(() => {
    supabase.from('cidades').select('*').order('nome').then(({ data }) => {
      const l = (data || []) as Cidade[]
      setCidades(l); setF((x) => ({ ...x, cidade: x.cidade || l.find((c) => c.ativa)?.nome || l[0]?.nome || '' }))
    })
  }, [])

  function tipo(d: boolean) {
    setDemo(d)
    setF((x) => d
      ? { ...x, plano: 'completo', vencimento: '', republica: x.republica || 'República Demonstração', nome: x.nome || 'Demonstração', email: x.email || 'goncorp.grupo+demo@gmail.com' }
      : { ...x, plano: 'basico', vencimento: mais1Mes() })
  }

  async function criar(e: React.FormEvent) {
    e.preventDefault()
    setOcupado(true)
    const { data, error } = await supabase.functions.invoke('admin-criar-republica', {
      body: { ...f, valor: f.valor.trim() === '' ? null : Number(f.valor.replace(',', '.')), vencimento: demo || f.plano === 'gratis' ? null : f.vencimento || null, demo },
    })
    setOcupado(false)
    let msg = (data as { erro?: string } | null)?.erro
    if (error && !msg) {
      try { msg = (await (error as unknown as { context: Response }).context.json()).erro } catch { msg = error.message }
    }
    if (msg) return avisar(msg, true)
    setPronto({ email: f.email.trim().toLowerCase(), senha: f.senha, nome: f.nome, whatsapp: f.whatsapp, republica: f.republica })
    onCriada()
  }

  if (pronto) {
    const texto = `Oi, ${pronto.nome.split(' ')[0]}! O acesso da ${pronto.republica} ao MRO está pronto.\n\nEndereço: ${APP_URL}\nE-mail: ${pronto.email}\nSenha: ${pronto.senha}\n\nÉ só entrar. Qualquer dúvida, me chama por aqui.`
    const link = waLink(pronto.whatsapp, texto)
    return (
      <Folha titulo="Acesso criado" onFechar={onFechar}>
        <p>A república <b>{pronto.republica}</b> está pronta. Guarde ou envie os dados agora: <b>a senha não aparece de novo</b>.</p>
        <div className="pre">{texto}</div>
        <div className="linha quebra">
          <button className="btn primario" onClick={() => navigator.clipboard?.writeText(texto).then(() => avisar('Mensagem copiada.'))}>Copiar mensagem</button>
          {link && <a className="btn" href={link} target="_blank" rel="noreferrer">Enviar no WhatsApp</a>}
          <button className="btn" onClick={onFechar}>Concluir</button>
        </div>
      </Folha>
    )
  }

  return (
    <Folha titulo="Nova república" onFechar={onFechar}>
      <div className="seg" role="group" aria-label="Tipo">
        <button type="button" aria-pressed={!demo} onClick={() => tipo(false)}>Cliente</button>
        <button type="button" aria-pressed={demo} onClick={() => tipo(true)}>Demonstração</button>
      </div>
      {demo && <span className="small muted">Para vídeos e testes: plano completo, não entra em receita, assinaturas nem alertas de cobrança.</span>}
      <form className="pilha" onSubmit={criar}>
        <Campo rotulo="Nome da república"><input value={f.republica} onChange={(e) => setF({ ...f, republica: e.target.value })} required /></Campo>
        <div className="grade2">
          <Campo rotulo="Região">
            <select value={f.cidade} onChange={(e) => setF({ ...f, cidade: e.target.value })}>{cidades.map((c) => <option key={c.nome} value={c.nome}>{c.nome}</option>)}</select>
          </Campo>
          <Campo rotulo="Plano">
            <select value={f.plano} onChange={(e) => setF({ ...f, plano: e.target.value })}>{planos.map((p) => <option key={p.id} value={p.id}>{p.nome} (até {p.limite_membros})</option>)}</select>
          </Campo>
        </div>
        <Campo rotulo="Nome do líder"><input value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} required /></Campo>
        <div className="grade2">
          <Campo rotulo="WhatsApp do líder"><input inputMode="tel" value={f.whatsapp} onChange={(e) => setF({ ...f, whatsapp: e.target.value })} placeholder="31 99999-0000" /></Campo>
          <Campo rotulo="E-mail de acesso"><input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required /></Campo>
        </div>
        <Campo rotulo="Senha de acesso (gerada para você)">
          <div className="linha"><input className="grow" value={f.senha} onChange={(e) => setF({ ...f, senha: e.target.value })} required minLength={8} />
            <button type="button" className="btn mini" onClick={() => setF({ ...f, senha: gerarSenha() })}>Gerar outra</button></div>
        </Campo>
        {!demo && f.plano !== 'gratis' && (
          <div className="grade2">
            <Campo rotulo="Vencimento"><input type="date" value={f.vencimento} onChange={(e) => setF({ ...f, vencimento: e.target.value })} /></Campo>
            <Campo rotulo="Valor combinado (R$)"><input inputMode="decimal" value={f.valor} onChange={(e) => setF({ ...f, valor: e.target.value })} placeholder="usa o do plano" /></Campo>
          </div>
        )}
        <button className="btn primario" disabled={ocupado}>{ocupado ? 'Criando…' : 'Criar república e acesso'}</button>
      </form>
    </Folha>
  )
}
