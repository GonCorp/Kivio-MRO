-- =====================================================================
-- MRO (Minha República em Ordem) · Kivio Digital
-- Banco de dados da Fase 1: base, escala, missões, multas, funções, super admin
-- Como usar: Supabase > SQL Editor > New query > colar tudo > Run.
-- Pode rodar de novo sem medo (usa "if not exists" / "or replace").
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- Funções utilitárias ----------
create or replace function hoje_br() returns date
language sql stable set search_path = '' as $$ select (now() at time zone 'America/Sao_Paulo')::date $$;

-- ---------- Tabelas ----------
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null default '',
  whatsapp text,
  is_super_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists cidades (
  nome text primary key,
  ativa boolean not null default false
);

create table if not exists republicas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  cidade text not null references cidades(nome),
  ativo boolean not null default true,              -- o Ryan liga/desliga aqui
  plano text not null default 'gratis' check (plano in ('gratis','basico','completo')),
  limite_membros int not null default 7,
  codigo_convite text not null unique,
  whatsapp_lider text,
  whatsapp_status text not null default 'nao_verificado'
    check (whatsapp_status in ('nao_verificado','verificado')),
  codigo_verificacao text not null,
  teto_multa numeric(10,2),                         -- opcional
  criado_por uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists membros (
  id uuid primary key default gen_random_uuid(),
  republica_id uuid not null references republicas(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  papel text not null default 'integrante' check (papel in ('lider','integrante')),
  funcoes text[] not null default '{}',             -- financeiro, multas, ingressos, portaria
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  unique (republica_id, user_id)
);
create index if not exists membros_user_idx on membros(user_id);

create table if not exists faixas_multa (
  republica_id uuid not null references republicas(id) on delete cascade,
  faixa int not null check (faixa >= 1),            -- 1ª falta do mês, 2ª, 3ª...
  valor numeric(10,2) not null check (valor >= 0),
  primary key (republica_id, faixa)
);

create table if not exists tarefas (
  id uuid primary key default gen_random_uuid(),
  republica_id uuid not null references republicas(id) on delete cascade,
  membro_id uuid not null references membros(id) on delete cascade,
  titulo text not null,
  descricao text,
  dia_semana smallint not null check (dia_semana between 0 and 6),  -- 0 = domingo
  inicio date not null,
  repeticao text not null default 'semanal' check (repeticao in ('semanal','uma_vez','n_vezes')),
  vezes int check (vezes is null or vezes >= 1),
  fim date,                                          -- tarefa encerrada (último dia válido)
  criado_por uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists tarefas_rep_idx on tarefas(republica_id);

create table if not exists execucoes (
  id uuid primary key default gen_random_uuid(),
  tarefa_id uuid not null references tarefas(id) on delete cascade,
  republica_id uuid not null references republicas(id) on delete cascade,
  data date not null,
  status text not null check (status in ('feita','em_analise','justificada','recusada')),
  motivo text,
  decidido_por uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tarefa_id, data)
);

-- Registro de atividade (alimenta os relatórios da Fase 2 desde já)
create table if not exists atividades (
  id bigint generated always as identity primary key,
  republica_id uuid references republicas(id) on delete cascade,
  ator_id uuid references auth.users(id),
  acao text not null,
  detalhe jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists atividades_rep_idx on atividades(republica_id, created_at desc);

-- ---------- Cidades (só Itabira ativa) ----------
insert into cidades(nome, ativa) values ('Itabira/MG', true)
on conflict (nome) do nothing;
insert into cidades(nome, ativa)
select n, false from unnest(array['Belo Horizonte/MG','Ouro Preto/MG','Viçosa/MG','Lavras/MG','Juiz de Fora/MG',
  'Uberlândia/MG','Uberaba/MG','Montes Claros/MG','São João del-Rei/MG','Itajubá/MG','Alfenas/MG',
  'Poços de Caldas/MG','Divinópolis/MG','Governador Valadares/MG','Varginha/MG']) n
on conflict (nome) do nothing;

-- ---------- Perfil automático ao criar conta ----------
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles(id, nome, whatsapp)
  values (new.id, coalesce(new.raw_user_meta_data->>'nome',''), new.raw_user_meta_data->>'whatsapp')
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute function handle_new_user();

-- ---------- Funções de permissão ----------
create or replace function is_super_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_super_admin from profiles where id = auth.uid()), false)
$$;

-- membro de uma república (mesmo que ela esteja bloqueada)
create or replace function sou_membro(rep uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from membros where republica_id = rep and user_id = auth.uid() and ativo)
$$;

-- membro de república ATIVA (é o que libera o uso do app)
create or replace function is_member(rep uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_super_admin() or exists(
    select 1 from membros m join republicas r on r.id = m.republica_id
    where m.republica_id = rep and m.user_id = auth.uid() and m.ativo and r.ativo)
$$;

create or replace function is_lider(rep uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from membros m join republicas r on r.id = m.republica_id
    where m.republica_id = rep and m.user_id = auth.uid() and m.ativo and r.ativo and m.papel = 'lider')
$$;

-- líder ou quem recebeu a função
create or replace function tem_funcao(rep uuid, f text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from membros m join republicas r on r.id = m.republica_id
    where m.republica_id = rep and m.user_id = auth.uid() and m.ativo and r.ativo
      and (m.papel = 'lider' or f = any(m.funcoes)))
$$;

create or replace function compartilha_republica(outro uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from membros a join membros b on a.republica_id = b.republica_id
    where a.user_id = auth.uid() and b.user_id = outro and a.ativo and b.ativo)
$$;

-- ---------- Segurança por linha (RLS) ----------
alter table profiles     enable row level security;
alter table cidades      enable row level security;
alter table republicas   enable row level security;
alter table membros      enable row level security;
alter table faixas_multa enable row level security;
alter table tarefas      enable row level security;
alter table execucoes    enable row level security;
alter table atividades   enable row level security;

drop policy if exists p_profiles_sel on profiles;
create policy p_profiles_sel on profiles for select using (
  id = auth.uid() or is_super_admin() or compartilha_republica(id));
drop policy if exists p_profiles_upd on profiles;
create policy p_profiles_upd on profiles for update using (id = auth.uid()) with check (id = auth.uid());
-- só nome e whatsapp podem ser alterados pelo próprio usuário (nunca is_super_admin)
revoke update on profiles from authenticated, anon;
grant update (nome, whatsapp) on profiles to authenticated;

drop policy if exists p_cidades_sel on cidades;
create policy p_cidades_sel on cidades for select using (true);

drop policy if exists p_rep_sel on republicas;
create policy p_rep_sel on republicas for select using (is_super_admin() or sou_membro(id));
drop policy if exists p_rep_upd on republicas;
create policy p_rep_upd on republicas for update using (is_lider(id)) with check (is_lider(id));
revoke update on republicas from authenticated, anon;
grant update (nome) on republicas to authenticated;

drop policy if exists p_mem_sel on membros;
create policy p_mem_sel on membros for select using (
  user_id = auth.uid() or is_member(republica_id));

drop policy if exists p_faixas_sel on faixas_multa;
create policy p_faixas_sel on faixas_multa for select using (is_member(republica_id));

drop policy if exists p_tarefas_sel on tarefas;
create policy p_tarefas_sel on tarefas for select using (is_member(republica_id));

drop policy if exists p_exec_sel on execucoes;
create policy p_exec_sel on execucoes for select using (is_member(republica_id));

drop policy if exists p_ativ_sel on atividades;
create policy p_ativ_sel on atividades for select using (is_super_admin() or is_lider(republica_id));

-- Escritas: SÓ pelas funções (RPC) abaixo. Ninguém grava direto nas tabelas.
revoke insert, delete on all tables in schema public from anon, authenticated;
revoke update on membros, faixas_multa, tarefas, execucoes, atividades, cidades from anon, authenticated;

-- ---------- Auxiliares internos ----------
create or replace function log_atividade(rep uuid, acao text, detalhe jsonb default '{}')
returns void language sql security definer set search_path = public as $$
  insert into atividades(republica_id, ator_id, acao, detalhe) values (rep, auth.uid(), acao, detalhe)
$$;
revoke execute on function log_atividade(uuid, text, jsonb) from public, anon, authenticated;

create or replace function gerar_codigo(tamanho int, so_numeros boolean default false) returns text
language plpgsql as $$
declare alfabeto text := case when so_numeros then '0123456789' else 'ABCDEFGHJKMNPQRSTUVWXYZ23456789' end;
        r text := ''; i int;
begin
  for i in 1..tamanho loop
    r := r || substr(alfabeto, 1 + floor(random() * length(alfabeto))::int, 1);
  end loop;
  return r;
end $$;

-- Primeira data (>= inicio) que cai no dia da semana da tarefa
create or replace function primeira_data(t tarefas) returns date
language sql immutable as $$
  select t.inicio + ((t.dia_semana - extract(dow from t.inicio)::int + 7) % 7)
$$;

-- A tarefa ocorre nessa data?
create or replace function ocorre_em(t tarefas, d date) returns boolean
language sql immutable as $$
  select extract(dow from d)::int = t.dia_semana
     and d >= primeira_data(t)
     and (t.fim is null or d <= t.fim)
     and case t.repeticao
           when 'semanal' then true
           when 'uma_vez' then d = primeira_data(t)
           else ((d - primeira_data(t)) / 7) < coalesce(t.vezes, 1)
         end
$$;

-- ---------- RPC: república e convites ----------
create or replace function criar_republica(p_nome text, p_cidade text, p_whatsapp text)
returns uuid language plpgsql security definer set search_path = public as $$
declare rid uuid; cod text;
begin
  if auth.uid() is null then raise exception 'Faça login primeiro.'; end if;
  if length(trim(coalesce(p_nome,''))) < 2 then raise exception 'Informe o nome da república.'; end if;
  if not exists(select 1 from cidades where nome = p_cidade and ativa) then
    raise exception 'Essa cidade ainda não está liberada.'; end if;
  if exists(select 1 from membros where user_id = auth.uid() and ativo) then
    raise exception 'Você já faz parte de uma república.'; end if;
  loop
    cod := gerar_codigo(6);
    exit when not exists(select 1 from republicas where codigo_convite = cod);
  end loop;
  insert into republicas(nome, cidade, codigo_convite, whatsapp_lider, codigo_verificacao, criado_por)
  values (trim(p_nome), p_cidade, cod, p_whatsapp, gerar_codigo(6, true), auth.uid())
  returning id into rid;
  insert into membros(republica_id, user_id, papel) values (rid, auth.uid(), 'lider');
  -- escada de multa inicial (editável): 1ª R$ 10, 2ª R$ 20, 3ª em diante R$ 30
  insert into faixas_multa(republica_id, faixa, valor) values (rid,1,10),(rid,2,20),(rid,3,30);
  perform log_atividade(rid, 'republica_criada', jsonb_build_object('nome', p_nome));
  return rid;
end $$;

create or replace function entrar_republica(p_codigo text)
returns uuid language plpgsql security definer set search_path = public as $$
declare r republicas; n int;
begin
  if auth.uid() is null then raise exception 'Faça login primeiro.'; end if;
  select * into r from republicas where codigo_convite = upper(trim(p_codigo));
  if not found then raise exception 'Código de convite não encontrado.'; end if;
  if not r.ativo then raise exception 'Esta república está com o acesso suspenso.'; end if;
  if exists(select 1 from membros where user_id = auth.uid() and ativo) then
    raise exception 'Você já faz parte de uma república.'; end if;
  select count(*) into n from membros where republica_id = r.id and ativo;
  if n >= r.limite_membros then
    raise exception 'A república atingiu o limite de integrantes do plano.'; end if;
  insert into membros(republica_id, user_id) values (r.id, auth.uid())
  on conflict (republica_id, user_id) do update set ativo = true;
  perform log_atividade(r.id, 'integrante_entrou', '{}');
  return r.id;
end $$;

create or replace function regenerar_convite(p_rep uuid) returns text
language plpgsql security definer set search_path = public as $$
declare cod text;
begin
  if not is_lider(p_rep) then raise exception 'Só o líder pode fazer isso.'; end if;
  loop
    cod := gerar_codigo(6);
    exit when not exists(select 1 from republicas where codigo_convite = cod);
  end loop;
  update republicas set codigo_convite = cod where id = p_rep;
  perform log_atividade(p_rep, 'convite_renovado', '{}');
  return cod;
end $$;

-- ---------- RPC: integrantes e funções delegadas ----------
create or replace function definir_funcoes(p_membro uuid, p_funcoes text[])
returns void language plpgsql security definer set search_path = public as $$
declare m membros;
begin
  select * into m from membros where id = p_membro;
  if not found or not is_lider(m.republica_id) then raise exception 'Só o líder pode fazer isso.'; end if;
  if exists(select 1 from unnest(p_funcoes) f where f not in ('financeiro','multas','ingressos','portaria')) then
    raise exception 'Função inválida.'; end if;
  update membros set funcoes = p_funcoes where id = p_membro;
  perform log_atividade(m.republica_id, 'funcoes_alteradas',
    jsonb_build_object('membro', p_membro, 'funcoes', p_funcoes));
end $$;

create or replace function remover_membro(p_membro uuid)
returns void language plpgsql security definer set search_path = public as $$
declare m membros;
begin
  select * into m from membros where id = p_membro;
  if not found or not is_lider(m.republica_id) then raise exception 'Só o líder pode fazer isso.'; end if;
  if m.user_id = auth.uid() then raise exception 'O líder não pode se remover. Passe a liderança antes.'; end if;
  update membros set ativo = false, funcoes = '{}' where id = p_membro;
  perform log_atividade(m.republica_id, 'integrante_removido', jsonb_build_object('membro', p_membro));
end $$;

create or replace function transferir_lideranca(p_membro uuid)
returns void language plpgsql security definer set search_path = public as $$
declare m membros;
begin
  select * into m from membros where id = p_membro and ativo;
  if not found or not is_lider(m.republica_id) then raise exception 'Só o líder pode fazer isso.'; end if;
  update membros set papel = 'integrante' where republica_id = m.republica_id and user_id = auth.uid();
  update membros set papel = 'lider' where id = p_membro;
  perform log_atividade(m.republica_id, 'lideranca_transferida', jsonb_build_object('para', p_membro));
end $$;

create or replace function sair_republica()
returns void language plpgsql security definer set search_path = public as $$
declare m membros;
begin
  select * into m from membros where user_id = auth.uid() and ativo;
  if not found then return; end if;
  if m.papel = 'lider' then raise exception 'O líder precisa passar a liderança antes de sair.'; end if;
  update membros set ativo = false, funcoes = '{}' where id = m.id;
  perform log_atividade(m.republica_id, 'integrante_saiu', '{}');
end $$;

-- ---------- RPC: multas (escada) ----------
create or replace function salvar_faixas(p_rep uuid, p_valores numeric[], p_teto numeric)
returns void language plpgsql security definer set search_path = public as $$
declare i int;
begin
  if not tem_funcao(p_rep, 'multas') then raise exception 'Sem permissão para multas.'; end if;
  if coalesce(array_length(p_valores,1),0) < 1 then raise exception 'Informe ao menos uma faixa.'; end if;
  delete from faixas_multa where republica_id = p_rep;
  for i in 1..array_length(p_valores,1) loop
    insert into faixas_multa(republica_id, faixa, valor) values (p_rep, i, greatest(p_valores[i],0));
  end loop;
  update republicas set teto_multa = nullif(p_teto,0) where id = p_rep;
  perform log_atividade(p_rep, 'multas_configuradas', jsonb_build_object('faixas', p_valores, 'teto', p_teto));
end $$;

-- ---------- RPC: escala e missões ----------
-- p_dias: dias da semana (0=domingo ... 6=sábado). Cria uma tarefa por dia escolhido.
create or replace function criar_tarefas(
  p_rep uuid, p_membro uuid, p_titulo text, p_descricao text,
  p_dias int[], p_inicio date, p_repeticao text, p_vezes int)
returns int language plpgsql security definer set search_path = public as $$
declare d int; n int := 0;
begin
  if not tem_funcao(p_rep, 'multas') then raise exception 'Sem permissão para a escala.'; end if;
  if not exists(select 1 from membros where id = p_membro and republica_id = p_rep and ativo) then
    raise exception 'Integrante inválido.'; end if;
  if length(trim(coalesce(p_titulo,''))) < 2 then raise exception 'Dê um nome à tarefa.'; end if;
  if coalesce(array_length(p_dias,1),0) < 1 then raise exception 'Escolha ao menos um dia.'; end if;
  if p_inicio < hoje_br() then raise exception 'A data de início não pode ser no passado.'; end if;
  if p_repeticao = 'n_vezes' and coalesce(p_vezes,0) < 1 then raise exception 'Informe quantas vezes.'; end if;
  foreach d in array p_dias loop
    insert into tarefas(republica_id, membro_id, titulo, descricao, dia_semana, inicio, repeticao, vezes, criado_por)
    values (p_rep, p_membro, trim(p_titulo), nullif(trim(coalesce(p_descricao,'')),''), d, p_inicio,
            p_repeticao, case when p_repeticao = 'n_vezes' then p_vezes end, auth.uid());
    n := n + 1;
  end loop;
  perform log_atividade(p_rep, 'tarefa_criada', jsonb_build_object('titulo', p_titulo, 'membro', p_membro, 'dias', p_dias));
  return n;
end $$;

create or replace function encerrar_tarefa(p_tarefa uuid)
returns void language plpgsql security definer set search_path = public as $$
declare t tarefas;
begin
  select * into t from tarefas where id = p_tarefa;
  if not found or not tem_funcao(t.republica_id, 'multas') then raise exception 'Sem permissão.'; end if;
  if primeira_data(t) >= hoje_br() and not exists(select 1 from execucoes where tarefa_id = t.id) then
    delete from tarefas where id = t.id;               -- nunca começou: apaga
  else
    update tarefas set fim = hoje_br() - 1 where id = t.id;  -- preserva o histórico
  end if;
  perform log_atividade(t.republica_id, 'tarefa_encerrada', jsonb_build_object('titulo', t.titulo));
end $$;

create or replace function renomear_tarefa(p_tarefa uuid, p_titulo text, p_descricao text)
returns void language plpgsql security definer set search_path = public as $$
declare t tarefas;
begin
  select * into t from tarefas where id = p_tarefa;
  if not found or not tem_funcao(t.republica_id, 'multas') then raise exception 'Sem permissão.'; end if;
  update tarefas set titulo = trim(p_titulo), descricao = nullif(trim(coalesce(p_descricao,'')),'') where id = p_tarefa;
end $$;

-- Ocorrências no período, já com o estado de cada uma
-- pendente | feita | em_analise | justificada | falta
create or replace function ocorrencias(p_rep uuid, p_de date, p_ate date)
returns table(tarefa_id uuid, membro_id uuid, data date, status text, motivo text)
language sql stable security definer set search_path = public as $$
  select t.id, t.membro_id, g::date,
    case
      when e.status = 'feita' then 'feita'
      when e.status = 'justificada' then 'justificada'
      when e.status = 'em_analise' then 'em_analise'
      when e.status = 'recusada' then 'falta'
      when g::date < hoje_br() then 'falta'      -- prazo vence sozinho no fim do dia
      else 'pendente'
    end,
    e.motivo
  from tarefas t
  cross join lateral generate_series(
      greatest(p_de, primeira_data(t))::timestamp, p_ate::timestamp, interval '1 day') g
  left join execucoes e on e.tarefa_id = t.id and e.data = g::date
  where t.republica_id = p_rep
    and is_member(p_rep)
    and p_ate - p_de <= 62
    and ocorre_em(t, g::date)
$$;

create or replace function marcar_feita(p_tarefa uuid, p_data date)
returns void language plpgsql security definer set search_path = public as $$
declare t tarefas; m membros; gerente boolean;
begin
  select * into t from tarefas where id = p_tarefa;
  if not found or not is_member(t.republica_id) then raise exception 'Tarefa não encontrada.'; end if;
  if not ocorre_em(t, p_data) then raise exception 'A tarefa não acontece nesse dia.'; end if;
  select * into m from membros where id = t.membro_id;
  gerente := tem_funcao(t.republica_id, 'multas');
  if m.user_id <> auth.uid() and not gerente then raise exception 'Essa tarefa é de outra pessoa.'; end if;
  if not gerente and p_data <> hoje_br() then
    raise exception 'Você só pode marcar a tarefa no próprio dia. Fora disso, use "Justificar".'; end if;
  if p_data > hoje_br() then raise exception 'Esse dia ainda não chegou.'; end if;
  insert into execucoes(tarefa_id, republica_id, data, status, decidido_por)
  values (t.id, t.republica_id, p_data, 'feita', auth.uid())
  on conflict (tarefa_id, data) do update set status = 'feita', motivo = null,
     decidido_por = auth.uid(), updated_at = now();
  perform log_atividade(t.republica_id, 'tarefa_feita', jsonb_build_object('tarefa', t.id, 'data', p_data));
end $$;

create or replace function desmarcar_feita(p_tarefa uuid, p_data date)
returns void language plpgsql security definer set search_path = public as $$
declare t tarefas;
begin
  select * into t from tarefas where id = p_tarefa;
  if not found or not tem_funcao(t.republica_id, 'multas') then raise exception 'Sem permissão.'; end if;
  delete from execucoes where tarefa_id = t.id and data = p_data and status = 'feita';
  perform log_atividade(t.republica_id, 'tarefa_desmarcada', jsonb_build_object('tarefa', t.id, 'data', p_data));
end $$;

create or replace function justificar(p_tarefa uuid, p_data date, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare t tarefas; m membros;
begin
  select * into t from tarefas where id = p_tarefa;
  if not found or not is_member(t.republica_id) then raise exception 'Tarefa não encontrada.'; end if;
  select * into m from membros where id = t.membro_id;
  if m.user_id <> auth.uid() then raise exception 'Só quem recebeu a tarefa pode justificar.'; end if;
  if not ocorre_em(t, p_data) or p_data > hoje_br() then raise exception 'Data inválida.'; end if;
  if length(trim(coalesce(p_motivo,''))) < 3 then raise exception 'Conte o motivo.'; end if;
  if exists(select 1 from execucoes where tarefa_id = t.id and data = p_data and status in ('feita','justificada')) then
    raise exception 'Essa tarefa já está resolvida.'; end if;
  insert into execucoes(tarefa_id, republica_id, data, status, motivo)
  values (t.id, t.republica_id, p_data, 'em_analise', trim(p_motivo))
  on conflict (tarefa_id, data) do update set status = 'em_analise', motivo = trim(p_motivo), updated_at = now();
  perform log_atividade(t.republica_id, 'justificativa_enviada', jsonb_build_object('tarefa', t.id, 'data', p_data));
end $$;

create or replace function decidir_justificativa(p_tarefa uuid, p_data date, p_aceitar boolean)
returns void language plpgsql security definer set search_path = public as $$
declare t tarefas;
begin
  select * into t from tarefas where id = p_tarefa;
  if not found or not tem_funcao(t.republica_id, 'multas') then raise exception 'Sem permissão.'; end if;
  update execucoes set status = case when p_aceitar then 'justificada' else 'recusada' end,
         decidido_por = auth.uid(), updated_at = now()
   where tarefa_id = t.id and data = p_data and status = 'em_analise';
  if not found then raise exception 'Não há justificativa para analisar.'; end if;
  perform log_atividade(t.republica_id, case when p_aceitar then 'justificativa_aceita' else 'justificativa_recusada' end,
    jsonb_build_object('tarefa', t.id, 'data', p_data));
end $$;

-- Multas do mês: cada falta é a 1ª, 2ª, 3ª... do integrante no mês; depois da última faixa, repete.
-- Líder/quem tem "multas" vê todos; integrante vê só as próprias.
create or replace function multas_do_mes(p_rep uuid, p_mes date)
returns table(membro_id uuid, tarefa_id uuid, data date, numero int, valor numeric)
language sql stable security definer set search_path = public as $$
  with oc as (
    select * from ocorrencias(p_rep, date_trunc('month', p_mes)::date,
                              (date_trunc('month', p_mes) + interval '1 month - 1 day')::date)
    where status = 'falta'
  ), num as (
    select oc.membro_id, oc.tarefa_id, oc.data,
           (row_number() over (partition by oc.membro_id order by oc.data, oc.tarefa_id))::int as numero
    from oc
  )
  select n.membro_id, n.tarefa_id, n.data, n.numero,
         (select f.valor from faixas_multa f
           where f.republica_id = p_rep
           order by (f.faixa = least(n.numero, (select max(faixa) from faixas_multa where republica_id = p_rep))) desc
           limit 1)
  from num n
  join membros m on m.id = n.membro_id
  where is_member(p_rep)
    and (tem_funcao(p_rep, 'multas') or m.user_id = auth.uid())
$$;

-- ---------- RPC: painel do super admin (Ryan) ----------
create or replace function admin_listar_republicas()
returns table(id uuid, nome text, cidade text, ativo boolean, plano text, integrantes bigint,
              lider_nome text, whatsapp_lider text, whatsapp_status text, codigo_verificacao text,
              created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select r.id, r.nome, r.cidade, r.ativo, r.plano,
         (select count(*) from membros m where m.republica_id = r.id and m.ativo),
         (select p.nome from membros m join profiles p on p.id = m.user_id
           where m.republica_id = r.id and m.papel = 'lider' and m.ativo limit 1),
         r.whatsapp_lider, r.whatsapp_status, r.codigo_verificacao, r.created_at
  from republicas r
  where is_super_admin()
  order by r.created_at desc
$$;

create or replace function admin_set_ativo(p_rep uuid, p_ativo boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_super_admin() then raise exception 'Sem permissão.'; end if;
  update republicas set ativo = p_ativo where id = p_rep;
  perform log_atividade(p_rep, case when p_ativo then 'acesso_liberado' else 'acesso_bloqueado' end, '{}');
end $$;

create or replace function admin_set_plano(p_rep uuid, p_plano text, p_limite int)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_super_admin() then raise exception 'Sem permissão.'; end if;
  update republicas set plano = p_plano, limite_membros = greatest(p_limite, 1) where id = p_rep;
  perform log_atividade(p_rep, 'plano_alterado', jsonb_build_object('plano', p_plano, 'limite', p_limite));
end $$;

create or replace function admin_verificar_whatsapp(p_rep uuid, p_ok boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_super_admin() then raise exception 'Sem permissão.'; end if;
  update republicas set whatsapp_status = case when p_ok then 'verificado' else 'nao_verificado' end where id = p_rep;
  perform log_atividade(p_rep, 'whatsapp_verificacao', jsonb_build_object('ok', p_ok));
end $$;

create or replace function admin_ativar_cidade(p_cidade text, p_ativa boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_super_admin() then raise exception 'Sem permissão.'; end if;
  update cidades set ativa = p_ativa where nome = p_cidade;
end $$;

-- ---------- Quem pode chamar o quê ----------
-- (funções internas ficam fechadas; as RPC são para usuários logados)
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function hoje_br() to anon, authenticated;
grant execute on function
  is_super_admin(), sou_membro(uuid), is_member(uuid), is_lider(uuid), tem_funcao(uuid,text),
  compartilha_republica(uuid),
  criar_republica(text,text,text), entrar_republica(text), regenerar_convite(uuid),
  definir_funcoes(uuid,text[]), remover_membro(uuid), transferir_lideranca(uuid), sair_republica(),
  salvar_faixas(uuid,numeric[],numeric),
  criar_tarefas(uuid,uuid,text,text,int[],date,text,int), encerrar_tarefa(uuid), renomear_tarefa(uuid,text,text),
  ocorrencias(uuid,date,date), marcar_feita(uuid,date), desmarcar_feita(uuid,date),
  justificar(uuid,date,text), decidir_justificativa(uuid,date,boolean), multas_do_mes(uuid,date),
  admin_listar_republicas(), admin_set_ativo(uuid,boolean), admin_set_plano(uuid,text,int),
  admin_verificar_whatsapp(uuid,boolean), admin_ativar_cidade(text,boolean)
to authenticated;
grant usage on schema public to anon, authenticated;
grant select on all tables in schema public to authenticated;
grant select on cidades to anon;

-- Endurecimento extra: anon só lê cidades; authenticated só lê (escritas só pelas funções)
revoke all on all tables in schema public from anon;
grant select on cidades to anon;
revoke truncate, references, trigger on all tables in schema public from authenticated;
grant select on all tables in schema public to authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke execute on functions from anon, authenticated, public;
