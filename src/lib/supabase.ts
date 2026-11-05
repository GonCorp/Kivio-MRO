import { createClient } from '@supabase/supabase-js'

// Valores PÚBLICOS por natureza: a segurança do MRO está nas regras do banco (RLS), não em esconder
// a URL ou a chave "anon". Nunca coloque aqui a chave "service_role".
const URL_PADRAO = 'https://grjnqvvozynnjvegyese.supabase.co'
const CHAVE_ANON_PADRAO =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdyam5xdnZvenlubmp2ZWd5ZXNlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM4Mzc5MDUsImV4cCI6MjEwOTQxMzkwNX0.hX3pjwSa2bD_vEEnb8UHA4Eg8WVTViSnYzFvF0l8Isg'

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || URL_PADRAO
const key = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) || CHAVE_ANON_PADRAO

export const configurado = Boolean(url && key)

export const supabase = createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true },
})
