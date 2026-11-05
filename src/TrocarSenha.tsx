import { useState } from 'react'
import { supabase } from './lib/supabase'
import { Campo, Folha } from './components'

// Troca de senha: confere a senha atual (entrando de novo) e só então grava a nova.
export default function TrocarSenha({ email, onFechar, avisar }: { email: string; onFechar: () => void; avisar: (t: string, erro?: boolean) => void }) {
  const [atual, setAtual] = useState('')
  const [nova, setNova] = useState('')
  const [repete, setRepete] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    if (nova.length < 8) return setErro('A nova senha precisa ter pelo menos 8 caracteres.')
    if (nova !== repete) return setErro('As duas senhas novas não são iguais.')
    if (nova === atual) return setErro('A nova senha precisa ser diferente da atual.')
    setOcupado(true)
    const ok = await supabase.auth.signInWithPassword({ email, password: atual })
    if (ok.error) { setOcupado(false); return setErro('A senha atual está incorreta.') }
    const { error } = await supabase.auth.updateUser({ password: nova })
    setOcupado(false)
    if (error) return setErro(error.message)
    avisar('Senha alterada.')
    onFechar()
  }

  return (
    <Folha titulo="Trocar minha senha" onFechar={onFechar}>
      <form className="pilha" onSubmit={salvar}>
        <Campo rotulo="Senha atual"><input type="password" value={atual} onChange={(e) => setAtual(e.target.value)} autoComplete="current-password" required /></Campo>
        <Campo rotulo="Nova senha (mínimo 8 caracteres)"><input type="password" value={nova} onChange={(e) => setNova(e.target.value)} autoComplete="new-password" required /></Campo>
        <Campo rotulo="Repita a nova senha"><input type="password" value={repete} onChange={(e) => setRepete(e.target.value)} autoComplete="new-password" required /></Campo>
        {erro && <p className="chip ruim" style={{ whiteSpace: 'normal', borderRadius: 12, padding: '10px 12px' }}>{erro}</p>}
        <button className="btn primario" disabled={ocupado}>{ocupado ? 'Salvando…' : 'Salvar nova senha'}</button>
      </form>
    </Folha>
  )
}
