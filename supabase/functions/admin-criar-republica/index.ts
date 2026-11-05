import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

// Cria a conta do líder (e-mail + senha) e a república dele. Só o super admin pode chamar.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ erro: 'Método inválido.' }, 405)

  const url = Deno.env.get('SUPABASE_URL')!
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const auth = req.headers.get('Authorization') ?? ''

  // 1) quem está chamando precisa ser o super admin
  const eu = createClient(url, anon, { global: { headers: { Authorization: auth } } })
  const { data: u } = await eu.auth.getUser()
  if (!u?.user) return json({ erro: 'Faça login de novo.' }, 401)
  const { data: perfil } = await eu.from('profiles').select('is_super_admin').eq('id', u.user.id).single()
  if (!perfil?.is_super_admin) return json({ erro: 'Acesso restrito.' }, 403)

  // 2) dados
  let b: Record<string, unknown>
  try { b = await req.json() } catch { return json({ erro: 'Dados inválidos.' }, 400) }
  const email = String(b.email ?? '').trim().toLowerCase()
  const senha = String(b.senha ?? '')
  const nome = String(b.nome ?? '').trim()
  const republica = String(b.republica ?? '').trim()
  const cidade = String(b.cidade ?? '')
  const plano = String(b.plano ?? 'gratis')
  const whatsapp = String(b.whatsapp ?? '').replace(/\D/g, '')
  const demo = Boolean(b.demo)
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ erro: 'E-mail inválido.' }, 400)
  if (senha.length < 8) return json({ erro: 'A senha precisa ter pelo menos 8 caracteres.' }, 400)
  if (nome.length < 2) return json({ erro: 'Informe o nome do líder.' }, 400)
  if (republica.length < 2) return json({ erro: 'Informe o nome da república.' }, 400)

  // 3) cria a conta do líder (sem exigir confirmação de e-mail, pois você entrega os dados)
  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: novo, error: e1 } = await admin.auth.admin.createUser({
    email, password: senha, email_confirm: true, user_metadata: { nome, whatsapp },
  })
  if (e1 || !novo?.user) {
    const m = e1?.message ?? ''
    return json({ erro: /already|registered|exists/i.test(m) ? 'Esse e-mail já tem conta.' : 'Não foi possível criar a conta: ' + m }, 400)
  }

  // 4) cria a república para ele (com o login do admin, para o banco conferir a permissão)
  const { data: rid, error: e2 } = await eu.rpc('admin_criar_republica', {
    p_user: novo.user.id, p_nome: republica, p_cidade: cidade, p_whatsapp: whatsapp || null, p_plano: plano,
    p_vencimento: (b.vencimento as string) || null,
    p_valor: b.valor === null || b.valor === undefined || b.valor === '' ? null : Number(b.valor),
    p_demo: demo,
  })
  if (e2) {
    await admin.auth.admin.deleteUser(novo.user.id) // desfaz a conta para não sobrar lixo
    return json({ erro: e2.message }, 400)
  }
  return json({ ok: true, republica_id: rid, user_id: novo.user.id })
})
