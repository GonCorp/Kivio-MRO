-- =====================================================================
-- MRO · Finanças: contas, lançamentos e cobranças divididas entre integrantes.
-- Quem lança: líder ou quem recebeu a função "financeiro". Só vale se o plano/painel liberar "financas".
-- Roda depois do 05-criar-republica-admin.sql.
-- =====================================================================
create table if not exists contas (
  id uuid primary key default gen_random_uuid(),
  republica_id uuid not null references republicas(id) on delete cascade,
  nome text not null,
  tipo text not null default 'casa' check (tipo in ('casa','festa','caixinha','outro')),
  saldo_inicial numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);
create table if not exists lancamentos (
  id uuid primary key default gen_random_uuid(),
  republica_id uuid not null references republicas(id) on delete cascade,
  conta_id uuid not null references contas(id) on delete cascade,
  tipo text not null check (tipo in ('receita','despesa')),
  valor numeric(12,2) not null check (valor > 0),
  descricao text not null,
  categoria text,
  data date not null default hoje_br(),
  origem text not null default 'manual' check (origem in ('manual','cobranca','ingresso')),
  origem_id uuid,
  criado_por uuid,
  created_at timestamptz not null default now()
);
create table if not exists cobrancas (
  id uuid primary key default gen_random_uuid(),
  republica_id uuid not null references republicas(id) on delete cascade,
  titulo text not null,
  valor numeric(12,2) not null check (valor > 0),          -- por pessoa
  vencimento date,
  conta_id uuid references contas(id) on delete restrict,   -- onde o dinheiro entra quando pago
  criado_por uuid,
  created_at timestamptz not null default now()
);
create table if not exists cobranca_itens (
  id uuid primary key default gen_random_uuid(),
  cobranca_id uuid not null references cobrancas(id) on delete cascade,
  republica_id uuid not null references republicas(id) on delete cascade,
  membro_id uuid not null references membros(id) on delete cascade,
  valor numeric(12,2) not null,
  pago boolean not null default false,
  pago_em timestamptz,
  lancamento_id uuid references lancamentos(id) on delete set null,
  unique (cobranca_id, membro_id)
);
create index if not exists ix_lanc_conta on lancamentos(conta_id, data desc);
create index if not exists ix_itens_membro on cobranca_itens(membro_id);

create or replace function meu_membro(rep uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select id from membros where republica_id = rep and user_id = auth.uid() and ativo limit 1
$$;
revoke execute on function meu_membro(uuid) from public, anon;
grant execute on function meu_membro(uuid) to authenticated;

alter table contas enable row level security;
alter table lancamentos enable row level security;
alter table cobrancas enable row level security;
alter table cobranca_itens enable row level security;

drop policy if exists p_sel on contas;
create policy p_sel on contas for select using (tem_funcao(republica_id, 'financeiro') and tem_recurso(republica_id, 'financas'));
drop policy if exists p_sel on lancamentos;
create policy p_sel on lancamentos for select using (tem_funcao(republica_id, 'financeiro') and tem_recurso(republica_id, 'financas'));
drop policy if exists p_sel on cobrancas;
create policy p_sel on cobrancas for select using (tem_recurso(republica_id, 'financas') and tem_funcao(republica_id, 'financeiro'));
drop policy if exists p_sel on cobranca_itens;
create policy p_sel on cobranca_itens for select using (
  tem_recurso(republica_id, 'financas') and (tem_funcao(republica_id, 'financeiro') or membro_id = meu_membro(republica_id)));
grant select on contas, lancamentos, cobrancas, cobranca_itens to authenticated;
revoke all on contas, lancamentos, cobrancas, cobranca_itens from anon;

create or replace function exigir_fin(p_rep uuid) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not tem_funcao(p_rep, 'financeiro') then raise exception 'Sem permissão para as finanças.'; end if;
  if not tem_recurso(p_rep, 'financas') then raise exception 'As finanças não estão incluídas no plano desta república.'; end if;
end $$;
revoke execute on function exigir_fin(uuid) from public, anon, authenticated;

create or replace function criar_conta(p_rep uuid, p_nome text, p_tipo text, p_saldo numeric) returns uuid
language plpgsql security definer set search_path = public as $$
declare cid uuid;
begin
  perform exigir_fin(p_rep);
  if length(trim(coalesce(p_nome,''))) < 2 then raise exception 'Dê um nome à conta.'; end if;
  insert into contas(republica_id, nome, tipo, saldo_inicial) values (p_rep, trim(p_nome), coalesce(p_tipo,'casa'), coalesce(p_saldo,0))
  returning id into cid;
  perform log_atividade(p_rep, 'conta_criada', jsonb_build_object('nome', p_nome));
  return cid;
end $$;

create or replace function remover_conta(p_conta uuid) returns void
language plpgsql security definer set search_path = public as $$
declare c contas;
begin
  select * into c from contas where id = p_conta;
  if not found then raise exception 'Conta não encontrada.'; end if;
  perform exigir_fin(c.republica_id);
  if exists(select 1 from lancamentos where conta_id = c.id) or exists(select 1 from cobrancas where conta_id = c.id) then
    raise exception 'Essa conta já tem movimento e não pode ser removida.'; end if;
  delete from contas where id = c.id;
  perform log_atividade(c.republica_id, 'conta_removida', jsonb_build_object('nome', c.nome));
end $$;

create or replace function lancar(p_rep uuid, p_conta uuid, p_tipo text, p_valor numeric, p_desc text, p_categoria text, p_data date) returns uuid
language plpgsql security definer set search_path = public as $$
declare lid uuid;
begin
  perform exigir_fin(p_rep);
  if not exists(select 1 from contas where id = p_conta and republica_id = p_rep) then raise exception 'Conta inválida.'; end if;
  if p_tipo not in ('receita','despesa') then raise exception 'Tipo inválido.'; end if;
  if coalesce(p_valor,0) <= 0 then raise exception 'Informe um valor maior que zero.'; end if;
  if length(trim(coalesce(p_desc,''))) < 2 then raise exception 'Descreva o lançamento.'; end if;
  insert into lancamentos(republica_id, conta_id, tipo, valor, descricao, categoria, data, criado_por)
  values (p_rep, p_conta, p_tipo, p_valor, trim(p_desc), nullif(trim(coalesce(p_categoria,'')),''), coalesce(p_data, hoje_br()), auth.uid())
  returning id into lid;
  perform log_atividade(p_rep, 'lancamento_criado', jsonb_build_object('tipo', p_tipo, 'valor', p_valor, 'descricao', p_desc));
  return lid;
end $$;

create or replace function remover_lancamento(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare l lancamentos;
begin
  select * into l from lancamentos where id = p_id;
  if not found then raise exception 'Lançamento não encontrado.'; end if;
  perform exigir_fin(l.republica_id);
  if l.origem <> 'manual' then raise exception 'Esse lançamento veio de uma cobrança ou ingresso. Desfaça lá.'; end if;
  delete from lancamentos where id = l.id;
  perform log_atividade(l.republica_id, 'lancamento_removido', jsonb_build_object('tipo', l.tipo, 'valor', l.valor, 'descricao', l.descricao));
end $$;

create or replace function criar_cobranca(p_rep uuid, p_titulo text, p_valor numeric, p_venc date, p_conta uuid, p_membros uuid[]) returns uuid
language plpgsql security definer set search_path = public as $$
declare cid uuid; m uuid;
begin
  perform exigir_fin(p_rep);
  if length(trim(coalesce(p_titulo,''))) < 2 then raise exception 'Dê um nome à cobrança.'; end if;
  if coalesce(p_valor,0) <= 0 then raise exception 'Informe o valor por pessoa.'; end if;
  if coalesce(array_length(p_membros,1),0) < 1 then raise exception 'Escolha ao menos um integrante.'; end if;
  if p_conta is null or not exists(select 1 from contas where id = p_conta and republica_id = p_rep) then
    raise exception 'Escolha a conta onde o dinheiro vai entrar.'; end if;
  insert into cobrancas(republica_id, titulo, valor, vencimento, conta_id, criado_por)
  values (p_rep, trim(p_titulo), p_valor, p_venc, p_conta, auth.uid()) returning id into cid;
  foreach m in array p_membros loop
    if not exists(select 1 from membros where id = m and republica_id = p_rep and ativo) then raise exception 'Integrante inválido.'; end if;
    insert into cobranca_itens(cobranca_id, republica_id, membro_id, valor) values (cid, p_rep, m, p_valor);
  end loop;
  perform log_atividade(p_rep, 'cobranca_criada', jsonb_build_object('titulo', p_titulo, 'valor', p_valor, 'pessoas', array_length(p_membros,1)));
  return cid;
end $$;

create or replace function marcar_pago(p_item uuid, p_pago boolean) returns void
language plpgsql security definer set search_path = public as $$
declare i cobranca_itens; c cobrancas; lid uuid; nome text;
begin
  select * into i from cobranca_itens where id = p_item;
  if not found then raise exception 'Cobrança não encontrada.'; end if;
  perform exigir_fin(i.republica_id);
  select * into c from cobrancas where id = i.cobranca_id;
  if p_pago and not i.pago then
    select p.nome into nome from membros m join profiles p on p.id = m.user_id where m.id = i.membro_id;
    insert into lancamentos(republica_id, conta_id, tipo, valor, descricao, categoria, origem, origem_id, criado_por)
    values (i.republica_id, c.conta_id, 'receita', i.valor, c.titulo || ' — ' || coalesce(nome,'integrante'), 'Cobrança', 'cobranca', i.id, auth.uid())
    returning id into lid;
    update cobranca_itens set pago = true, pago_em = now(), lancamento_id = lid where id = i.id;
    perform log_atividade(i.republica_id, 'cobranca_paga', jsonb_build_object('titulo', c.titulo, 'membro', i.membro_id, 'valor', i.valor));
  elsif not p_pago and i.pago then
    delete from lancamentos where id = i.lancamento_id;
    update cobranca_itens set pago = false, pago_em = null, lancamento_id = null where id = i.id;
    perform log_atividade(i.republica_id, 'cobranca_desfeita', jsonb_build_object('titulo', c.titulo, 'membro', i.membro_id));
  end if;
end $$;

create or replace function remover_cobranca(p_cob uuid) returns void
language plpgsql security definer set search_path = public as $$
declare c cobrancas;
begin
  select * into c from cobrancas where id = p_cob;
  if not found then raise exception 'Cobrança não encontrada.'; end if;
  perform exigir_fin(c.republica_id);
  if exists(select 1 from cobranca_itens where cobranca_id = c.id and pago) then
    raise exception 'Já há pagamentos nessa cobrança. Desfaça os pagamentos antes de remover.'; end if;
  delete from cobrancas where id = c.id;
  perform log_atividade(c.republica_id, 'cobranca_removida', jsonb_build_object('titulo', c.titulo));
end $$;

create or replace function saldos_contas(p_rep uuid)
returns table(conta_id uuid, nome text, tipo text, saldo_inicial numeric, entradas numeric, saidas numeric, saldo numeric, movimentos bigint)
language sql stable security definer set search_path = public as $$
  select c.id, c.nome, c.tipo, c.saldo_inicial,
         coalesce(sum(l.valor) filter (where l.tipo = 'receita'), 0),
         coalesce(sum(l.valor) filter (where l.tipo = 'despesa'), 0),
         c.saldo_inicial + coalesce(sum(l.valor) filter (where l.tipo = 'receita'), 0) - coalesce(sum(l.valor) filter (where l.tipo = 'despesa'), 0),
         count(l.id)
  from contas c left join lancamentos l on l.conta_id = c.id
  where c.republica_id = p_rep and tem_funcao(p_rep, 'financeiro') and tem_recurso(p_rep, 'financas')
  group by c.id order by c.created_at
$$;

create or replace function minhas_cobrancas(p_rep uuid)
returns table(item_id uuid, titulo text, valor numeric, vencimento date, pago boolean, pago_em timestamptz)
language sql stable security definer set search_path = public as $$
  select i.id, c.titulo, i.valor, c.vencimento, i.pago, i.pago_em
  from cobranca_itens i join cobrancas c on c.id = i.cobranca_id
  where i.republica_id = p_rep and i.membro_id = meu_membro(p_rep) and tem_recurso(p_rep, 'financas')
  order by i.pago, c.vencimento nulls last, c.created_at desc
$$;

revoke execute on function criar_conta(uuid,text,text,numeric), remover_conta(uuid), lancar(uuid,uuid,text,numeric,text,text,date),
  remover_lancamento(uuid), criar_cobranca(uuid,text,numeric,date,uuid,uuid[]), marcar_pago(uuid,boolean), remover_cobranca(uuid),
  saldos_contas(uuid), minhas_cobrancas(uuid) from public, anon;
grant execute on function criar_conta(uuid,text,text,numeric), remover_conta(uuid), lancar(uuid,uuid,text,numeric,text,text,date),
  remover_lancamento(uuid), criar_cobranca(uuid,text,numeric,date,uuid,uuid[]), marcar_pago(uuid,boolean), remover_cobranca(uuid),
  saldos_contas(uuid), minhas_cobrancas(uuid) to authenticated;

-- Correção: as regras de leitura usam esta função (usuário comum não pode chamar tem_recurso direto)
create or replace function recurso_ok(p_rep uuid, p_rec text) returns boolean
language sql stable security definer set search_path = public as $$
  select is_member(p_rep) and tem_recurso(p_rep, p_rec)
$$;
revoke execute on function recurso_ok(uuid, text) from public, anon;
grant execute on function recurso_ok(uuid, text) to authenticated;
drop policy if exists p_sel on contas;
create policy p_sel on contas for select using (tem_funcao(republica_id, 'financeiro') and recurso_ok(republica_id, 'financas'));
drop policy if exists p_sel on lancamentos;
create policy p_sel on lancamentos for select using (tem_funcao(republica_id, 'financeiro') and recurso_ok(republica_id, 'financas'));
drop policy if exists p_sel on cobrancas;
create policy p_sel on cobrancas for select using (recurso_ok(republica_id, 'financas') and tem_funcao(republica_id, 'financeiro'));
drop policy if exists p_sel on cobranca_itens;
create policy p_sel on cobranca_itens for select using (
  recurso_ok(republica_id, 'financas') and (tem_funcao(republica_id, 'financeiro') or membro_id = meu_membro(republica_id)));
