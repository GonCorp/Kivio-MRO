import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

// O líder cadastra um integrante (cria o acesso com e-mail e senha) ou redefine a senha de alguém da casa.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ erro: 'Método inválido.' }, 405)

  const url = Deno.env.get('SUPABASE_URL')!
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const eu = createClient(url, anon, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } })
  const { data: u } = await eu.auth.getUser()
  if (!u?.user) return json({ erro: 'Faça login de novo.' }, 401)

  let b: Record<string, unknown>
  try { b = await req.json() } catch { return json({ erro: 'Dados inválidos.' }, 400) }
  const acao = String(b.acao ?? '')
  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } })

  // quem chama precisa ser líder de uma república ativa
  const { data: meu } = await admin.from('membros').select('republica_id, papel').eq('user_id', u.user.id).eq('ativo', true).maybeSingle()
  if (!meu || meu.papel !== 'lider') return json({ erro: 'Só o líder pode fazer isso.' }, 403)
  const rep = meu.republica_id as string
  const { data: r } = await admin.from('republicas').select('ativo, limite_membros').eq('id', rep).single()
  if (!r?.ativo) return json({ erro: 'A república está bloqueada.' }, 403)

  if (acao === 'criar') {
    const nome = String(b.nome ?? '').trim()
    const email = String(b.email ?? '').trim().toLowerCase()
    const senha = String(b.senha ?? '')
    const whatsapp = String(b.whatsapp ?? '').replace(/\D/g, '')
    if (nome.length < 2) return json({ erro: 'Informe o nome.' }, 400)
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ erro: 'E-mail inválido.' }, 400)
    if (senha.length < 6) return json({ erro: 'A senha precisa ter pelo menos 6 caracteres.' }, 400)
    const { count } = await admin.from('membros').select('id', { count: 'exact', head: true }).eq('republica_id', rep).eq('ativo', true)
    if ((count ?? 0) >= (r.limite_membros as number)) return json({ erro: `A república já está no limite de ${r.limite_membros} integrantes do plano.` }, 400)
    const { data: novo, error: e1 } = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true, user_metadata: { nome, whatsapp } })
    if (e1 || !novo?.user) {
      const m = e1?.message ?? ''
      return json({ erro: /already|registered|exists/i.test(m) ? 'Esse e-mail já tem conta.' : 'Não foi possível criar a conta: ' + m }, 400)
    }
    const { error: e2 } = await admin.from('membros').insert({ republica_id: rep, user_id: novo.user.id, papel: 'integrante' })
    if (e2) { await admin.auth.admin.deleteUser(novo.user.id); return json({ erro: 'Não foi possível adicionar à república.' }, 400) }
    await admin.from('atividades').insert({ republica_id: rep, ator_id: u.user.id, acao: 'integrante_cadastrado', detalhe: { nome } })
    return json({ ok: true, email, senha })
  }

  if (acao === 'nova_senha') {
    const membro = String(b.membro ?? '')
    const senha = String(b.senha ?? '')
    if (senha.length < 6) return json({ erro: 'A senha precisa ter pelo menos 6 caracteres.' }, 400)
    const { data: m } = await admin.from('membros').select('user_id, republica_id, papel').eq('id', membro).maybeSingle()
    if (!m || m.republica_id !== rep) return json({ erro: 'Integrante não encontrado.' }, 404)
    if (m.user_id === u.user.id) return json({ erro: 'Para a sua própria senha use "Trocar minha senha".' }, 400)
    const { error } = await admin.auth.admin.updateUserById(m.user_id, { password: senha })
    if (error) return json({ erro: 'Não foi possível trocar a senha.' }, 400)
    await admin.from('atividades').insert({ republica_id: rep, ator_id: u.user.id, acao: 'senha_redefinida', detalhe: {} })
    const { data: au } = await admin.auth.admin.getUserById(m.user_id)
    return json({ ok: true, email: au?.user?.email ?? '', senha })
  }
  return json({ erro: 'Ação inválida.' }, 400)
})
