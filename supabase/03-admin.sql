-- =====================================================================
-- MRO · Painel do super admin (site separado). Roda depois do 01-banco-fase1.sql.
-- Tudo aqui é exclusivo do super admin, exceto os "avisos", que as repúblicas da cidade leem.
-- =====================================================================

alter table republicas add column if not exists vencimento date;
alter table republicas add column if not exists valor_mensalidade numeric(10,2);
alter table republicas add column if not exists nota_admin text;
alter table republicas add column if not exists contatado boolean not null default false;

create table if not exists interessadas (
  id uuid primary key default gen_random_uuid(),
  republica text not null,
  lider text,
  telefone text,
  email text,
  cidade text references cidades(nome),
  nota text,
  contatado boolean not null default false,
  convertida boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists avisos (
  id uuid primary key default gen_random_uuid(),
  cidade text references cidades(nome),          -- null = todas as cidades
  texto text not null,
  link text,
  expira_em timestamptz,                          -- null = sem prazo
  created_at timestamptz not null default now()
);

create table if not exists planos (
  id text primary key check (id in ('gratis','basico','completo')),
  nome text not null,
  preco_mensal numeric(10,2),
  limite_membros int not null default 7,
  descricao text,
  recursos text[] not null default '{}'
);
insert into planos(id, nome, preco_mensal, limite_membros, descricao, recursos) values
  ('gratis','Grátis',0,7,'Cadastra a república, até 7 integrantes, consulta o calendário das outras.','{escala,multas}'),
  ('basico','Básico',null,30,'A definir.','{escala,multas,financas,relatorios}'),
  ('completo','Completo',null,30,'A definir.','{escala,multas,financas,relatorios,calendario,ingressos}')
on conflict (id) do nothing;

create table if not exists mensagens_modelo (
  id text primary key,
  titulo text not null,
  quando text not null,
  texto text not null,
  ativo boolean not null default true
);
insert into mensagens_modelo(id, titulo, quando, texto) values
  ('boas_vindas','Boas-vindas','Quando a república é criada ou liberada.',
   'Oi, {lider}! Aqui é da Kivio Digital. A {republica} já está liberada no MRO. Qualquer dúvida, chama por aqui.'),
  ('venc','Lembrete de vencimento','Repúblicas com situação "Vence em breve".',
   'Oi, {lider}! Passando para lembrar que a mensalidade da {republica} ({plano}, {valor}) vence em {vencimento}. Qualquer dúvida é só chamar.'),
  ('atraso','Aviso de pagamento atrasado','Repúblicas com situação "Atrasada".',
   'Oi, {lider}! Não identifiquei o pagamento da mensalidade da {republica} ({valor}). Aconteceu alguma coisa? Posso ajudar.'),
  ('interessada','Retorno para interessada','Contatos que ainda não assinaram.',
   'Oi, {lider}! Aqui é da Kivio Digital. Vi que a {republica} se interessou pelo MRO. Posso te mostrar como funciona?')
on conflict (id) do nothing;

-- Base de preços (por cidade): fontes (mercados), produtos e o preço de cada um em cada fonte
create table if not exists fontes_preco (
  id uuid primary key default gen_random_uuid(),
  cidade text not null references cidades(nome),
  nome text not null,
  atualizado_em date not null default hoje_br()
);
create table if not exists produtos_preco (
  id uuid primary key default gen_random_uuid(),
  cidade text not null references cidades(nome),
  nome text not null,
  unidade text,
  categoria text not null default 'Geral'
);
create table if not exists precos (
  fonte_id uuid not null references fontes_preco(id) on delete cascade,
  produto_id uuid not null references produtos_preco(id) on delete cascade,
  valor numeric(10,2) not null check (valor >= 0),
  primary key (fonte_id, produto_id)
);

-- RLS: só o super admin mexe nessas tabelas
alter table interessadas     enable row level security;
alter table avisos           enable row level security;
alter table planos           enable row level security;
alter table mensagens_modelo enable row level security;
alter table fontes_preco     enable row level security;
alter table produtos_preco   enable row level security;
alter table precos           enable row level security;

do $$
declare t text;
begin
  foreach t in array array['interessadas','planos','mensagens_modelo','fontes_preco','produtos_preco','precos'] loop
    execute format('drop policy if exists p_admin_all on %I', t);
    execute format('create policy p_admin_all on %I for all using (is_super_admin()) with check (is_super_admin())', t);
    execute format('grant select, insert, update, delete on %I to authenticated', t);
  end loop;
end $$;

drop policy if exists p_avisos_admin on avisos;
create policy p_avisos_admin on avisos for all using (is_super_admin()) with check (is_super_admin());
-- repúblicas veem os avisos da própria cidade (ou de todas) que ainda não expiraram
drop policy if exists p_avisos_sel on avisos;
create policy p_avisos_sel on avisos for select using (
  (expira_em is null or expira_em > now())
  and (cidade is null or exists(
        select 1 from republicas r join membros m on m.republica_id = r.id
        where m.user_id = auth.uid() and m.ativo and r.ativo and r.cidade = avisos.cidade)));
grant select, insert, update, delete on avisos to authenticated;

-- Situação comercial calculada (cobrança é manual no início)
create or replace function situacao_rep(p_plano text, p_venc date) returns text
language sql stable set search_path = '' as $$
  select case
    when p_plano = 'gratis' then 'gratis'
    when p_venc is null then 'sem_vencimento'
    when p_venc < (now() at time zone 'America/Sao_Paulo')::date then 'atrasada'
    when p_venc <= (now() at time zone 'America/Sao_Paulo')::date + 5 then 'vence_em_breve'
    else 'em_dia' end
$$;

drop function if exists admin_listar_republicas();
create or replace function admin_listar_republicas()
returns table(id uuid, nome text, cidade text, ativo boolean, plano text, integrantes bigint,
              lider_nome text, whatsapp_lider text, whatsapp_status text, codigo_verificacao text,
              created_at timestamptz, situacao text, vencimento date, valor_mensalidade numeric,
              nota_admin text, contatado boolean, limite_membros int)
language sql stable security definer set search_path = public as $$
  select r.id, r.nome, r.cidade, r.ativo, r.plano,
         (select count(*) from membros m where m.republica_id = r.id and m.ativo),
         (select p.nome from membros m join profiles p on p.id = m.user_id
           where m.republica_id = r.id and m.papel = 'lider' and m.ativo limit 1),
         r.whatsapp_lider, r.whatsapp_status, r.codigo_verificacao, r.created_at,
         situacao_rep(r.plano, r.vencimento), r.vencimento, r.valor_mensalidade,
         r.nota_admin, r.contatado, r.limite_membros
  from republicas r
  where is_super_admin()
  order by r.created_at desc
$$;

create or replace function admin_atualizar_republica(
  p_rep uuid, p_nota text, p_contatado boolean, p_vencimento date, p_valor numeric)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_super_admin() then raise exception 'Sem permissão.'; end if;
  update republicas set nota_admin = nullif(trim(coalesce(p_nota,'')),''), contatado = p_contatado,
         vencimento = p_vencimento, valor_mensalidade = p_valor where id = p_rep;
end $$;

-- Pagamento confirmado manualmente: empurra o vencimento 1 mês
create or replace function admin_registrar_pagamento(p_rep uuid)
returns date language plpgsql security definer set search_path = public as $$
declare novo date;
begin
  if not is_super_admin() then raise exception 'Sem permissão.'; end if;
  update republicas
     set vencimento = (greatest(coalesce(vencimento, hoje_br()), hoje_br()) + interval '1 month')::date
   where id = p_rep returning vencimento into novo;
  perform log_atividade(p_rep, 'pagamento_registrado', jsonb_build_object('novo_vencimento', novo));
  return novo;
end $$;

create or replace function admin_resumo() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r jsonb;
begin
  if not is_super_admin() then raise exception 'Sem permissão.'; end if;
  select jsonb_build_object(
    'republicas', (select count(*) from republicas),
    'ativas', (select count(*) from republicas where ativo),
    'bloqueadas', (select count(*) from republicas where not ativo),
    'assinando', (select count(*) from republicas where plano <> 'gratis' and ativo),
    'gratis', (select count(*) from republicas where plano = 'gratis'),
    'integrantes', (select count(*) from membros where ativo),
    'tarefas_ativas', (select count(*) from tarefas where fim is null),
    'faltas_mes', (select count(*) from republicas rr
                    cross join lateral ocorrencias(rr.id, date_trunc('month', hoje_br())::date, hoje_br()) o
                    where o.status = 'falta'),
    'justificativas', (select count(*) from execucoes where status = 'em_analise'),
    'whatsapp_pendentes', (select count(*) from republicas where whatsapp_status <> 'verificado'),
    'atrasadas', (select count(*) from republicas where situacao_rep(plano, vencimento) = 'atrasada'),
    'vencendo', (select count(*) from republicas where situacao_rep(plano, vencimento) = 'vence_em_breve'),
    'sem_vencimento', (select count(*) from republicas where situacao_rep(plano, vencimento) = 'sem_vencimento'),
    'interessadas', (select count(*) from interessadas where not convertida and not contatado),
    'receita_prevista', coalesce((select sum(coalesce(r2.valor_mensalidade, p.preco_mensal, 0))
                          from republicas r2 join planos p on p.id = r2.plano
                          where r2.ativo and r2.plano <> 'gratis'), 0),
    'por_cidade', coalesce((select jsonb_agg(jsonb_build_object('cidade', c.nome, 'ativa', c.ativa,
          'republicas', (select count(*) from republicas x where x.cidade = c.nome),
          'integrantes', (select count(*) from membros m join republicas x on x.id = m.republica_id
                           where x.cidade = c.nome and m.ativo)) order by c.nome)
          from cidades c where c.ativa or exists(select 1 from republicas x where x.cidade = c.nome)), '[]'::jsonb)
  ) into r;
  return r;
end $$;

create or replace function admin_atividade_recente(p_limite int default 30)
returns table(created_at timestamptz, republica text, acao text, detalhe jsonb)
language sql stable security definer set search_path = public as $$
  select a.created_at, r.nome, a.acao, a.detalhe
  from atividades a left join republicas r on r.id = a.republica_id
  where is_super_admin()
  order by a.created_at desc limit least(greatest(p_limite,1), 100)
$$;

revoke execute on function situacao_rep(text, date) from public, anon, authenticated;
revoke execute on function admin_listar_republicas(), admin_atualizar_republica(uuid,text,boolean,date,numeric),
  admin_registrar_pagamento(uuid), admin_resumo(), admin_atividade_recente(int) from public, anon;
grant execute on function admin_listar_republicas(), admin_atualizar_republica(uuid,text,boolean,date,numeric),
  admin_registrar_pagamento(uuid), admin_resumo(), admin_atividade_recente(int) to authenticated;
revoke all on interessadas, planos, mensagens_modelo, fontes_preco, produtos_preco, precos, avisos from anon;

-- Nova região (cidade) criada pelo super admin; entra desligada
create or replace function admin_adicionar_cidade(p_nome text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_super_admin() then raise exception 'Sem permissão.'; end if;
  if length(trim(coalesce(p_nome,''))) < 3 then raise exception 'Informe a cidade, ex.: Ouro Preto/MG.'; end if;
  insert into cidades(nome, ativa) values (trim(p_nome), false) on conflict (nome) do nothing;
end $$;
revoke execute on function admin_adicionar_cidade(text) from public, anon;
grant execute on function admin_adicionar_cidade(text) to authenticated;
