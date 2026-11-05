-- =====================================================================
-- MRO · Ingressos por festa, Pix direto na conta da república, portaria e taxa de R$ 0,25.
-- Quem vende/confirma: líder ou função "ingressos". Quem dá baixa na entrada: líder ou função "portaria".
-- Só vale se o plano/painel liberar "ingressos". Roda depois do 07-festas.sql.
-- =====================================================================
alter table festas add column if not exists ingresso_preco numeric(10,2);
alter table festas add column if not exists pix_chave text;
alter table festas add column if not exists contato_whatsapp text;
alter table festas add column if not exists ingressos_abertos boolean not null default false;
alter table festas add column if not exists limite_ingressos int;
alter table festas add column if not exists conta_id uuid references contas(id) on delete set null;

create table if not exists ingressos (
  id uuid primary key default gen_random_uuid(),
  festa_id uuid not null references festas(id) on delete cascade,
  republica_id uuid not null references republicas(id) on delete cascade,
  comprador text not null,
  contato text,
  membro_id uuid references membros(id) on delete set null,   -- integrante que pediu/vendeu
  codigo text not null unique,
  status text not null default 'pendente' check (status in ('pendente','pago','usado','cancelado')),
  valor numeric(10,2) not null,
  pago_em timestamptz,
  usado_em timestamptz,
  lancamento_id uuid references lancamentos(id) on delete set null,
  criado_por uuid,
  created_at timestamptz not null default now()
);
create index if not exists ix_ing_festa on ingressos(festa_id, status);

create table if not exists taxas_ingresso (
  id uuid primary key default gen_random_uuid(),
  ingresso_id uuid not null unique references ingressos(id) on delete cascade,
  republica_id uuid not null references republicas(id) on delete cascade,
  valor numeric(6,2) not null default 0.25,
  status text not null default 'pendente' check (status in ('pendente','estornada','cobrada')),
  mes_cobranca date not null,          -- 1º dia do mês em que entra na mensalidade
  created_at timestamptz not null default now()
);
alter table ingressos enable row level security;
alter table taxas_ingresso enable row level security;
revoke all on ingressos, taxas_ingresso from anon, authenticated;   -- tudo passa pelas funções abaixo

create or replace function exigir_ing(p_rep uuid, p_funcao text) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not tem_funcao(p_rep, p_funcao) then raise exception 'Sem permissão para esta função.'; end if;
  if not tem_recurso(p_rep, 'ingressos') then raise exception 'Os ingressos não estão incluídos no plano desta república.'; end if;
end $$;
revoke execute on function exigir_ing(uuid, text) from public, anon, authenticated;

-- festas da própria república, com a configuração de ingresso e os números
create or replace function festas_ingressos(p_rep uuid)
returns table(id uuid, data date, titulo text, local text, ingresso_preco numeric, pix_chave text, contato_whatsapp text,
              ingressos_abertos boolean, limite_ingressos int, conta_id uuid, pendentes bigint, vendidos bigint, usados bigint)
language sql stable security definer set search_path = public as $$
  select f.id, f.data, f.titulo, f.local, f.ingresso_preco, f.pix_chave, f.contato_whatsapp, f.ingressos_abertos,
         f.limite_ingressos, f.conta_id,
         count(i.id) filter (where i.status = 'pendente'),
         count(i.id) filter (where i.status in ('pago','usado')),
         count(i.id) filter (where i.status = 'usado')
  from festas f left join ingressos i on i.festa_id = f.id
  where f.republica_id = p_rep and recurso_ok(p_rep, 'ingressos') and f.data >= hoje_br() - 30
  group by f.id order by f.data
$$;

create or replace function configurar_ingressos(p_festa uuid, p_preco numeric, p_pix text, p_contato text, p_abertos boolean, p_limite int, p_conta uuid)
returns void language plpgsql security definer set search_path = public as $$
declare f festas;
begin
  select * into f from festas where id = p_festa;
  if not found then raise exception 'Festa não encontrada.'; end if;
  perform exigir_ing(f.republica_id, 'ingressos');
  if p_preco is null or p_preco <= 0 then raise exception 'Informe o preço do ingresso.'; end if;
  if p_abertos and length(trim(coalesce(p_pix,''))) < 3 then raise exception 'Informe a chave Pix para abrir as vendas.'; end if;
  if p_conta is not null and not exists(select 1 from contas where id = p_conta and republica_id = f.republica_id) then raise exception 'Conta inválida.'; end if;
  update festas set ingresso_preco = p_preco, pix_chave = nullif(trim(coalesce(p_pix,'')),''), contato_whatsapp = nullif(regexp_replace(coalesce(p_contato,''), '\D', '', 'g'),''),
         ingressos_abertos = p_abertos, limite_ingressos = nullif(p_limite,0), conta_id = p_conta where id = f.id;
  perform log_atividade(f.republica_id, 'ingressos_configurados', jsonb_build_object('festa', f.titulo, 'preco', p_preco, 'abertos', p_abertos));
end $$;

create or replace function novo_codigo_ingresso() returns text
language plpgsql set search_path = public as $$
declare c text;
begin
  loop
    c := gerar_codigo(7);
    exit when not exists(select 1 from ingressos where codigo = c);
  end loop;
  return c;
end $$;
revoke execute on function novo_codigo_ingresso() from public, anon, authenticated;

-- integrante pede o ingresso (para si ou para um convidado); fica pendente até o pagamento ser confirmado
create or replace function pedir_ingresso(p_festa uuid, p_comprador text, p_contato text) returns text
language plpgsql security definer set search_path = public as $$
declare f festas; cod text; n int; pend int;
begin
  select * into f from festas where id = p_festa;
  if not found or not is_member(f.republica_id) then raise exception 'Festa não encontrada.'; end if;
  if not tem_recurso(f.republica_id, 'ingressos') then raise exception 'Os ingressos não estão incluídos no plano desta república.'; end if;
  if not f.ingressos_abertos or f.ingresso_preco is null then raise exception 'As vendas dessa festa ainda não foram abertas.'; end if;
  if f.data < hoje_br() then raise exception 'Essa festa já passou.'; end if;
  if length(trim(coalesce(p_comprador,''))) < 2 then raise exception 'Informe o nome de quem vai usar o ingresso.'; end if;
  select count(*) into n from ingressos where festa_id = f.id and status in ('pendente','pago','usado');
  if f.limite_ingressos is not null and n >= f.limite_ingressos then raise exception 'Os ingressos dessa festa esgotaram.'; end if;
  select count(*) into pend from ingressos where festa_id = f.id and membro_id = meu_membro(f.republica_id) and status = 'pendente';
  if pend >= 5 then raise exception 'Você já tem 5 ingressos aguardando pagamento. Pague ou cancele antes de pedir mais.'; end if;
  cod := novo_codigo_ingresso();
  insert into ingressos(festa_id, republica_id, comprador, contato, membro_id, codigo, valor, criado_por)
  values (f.id, f.republica_id, trim(p_comprador), nullif(trim(coalesce(p_contato,'')),''), meu_membro(f.republica_id), cod, f.ingresso_preco, auth.uid());
  perform log_atividade(f.republica_id, 'ingresso_pedido', jsonb_build_object('festa', f.titulo, 'comprador', p_comprador));
  return cod;
end $$;

-- líder/ingressos vende direto (ex.: para alguém de fora); pode já nascer pago
create or replace function emitir_ingresso(p_festa uuid, p_comprador text, p_contato text, p_pago boolean) returns text
language plpgsql security definer set search_path = public as $$
declare f festas; cod text; n int; iid uuid;
begin
  select * into f from festas where id = p_festa;
  if not found then raise exception 'Festa não encontrada.'; end if;
  perform exigir_ing(f.republica_id, 'ingressos');
  if f.ingresso_preco is null then raise exception 'Configure o preço do ingresso antes de vender.'; end if;
  if length(trim(coalesce(p_comprador,''))) < 2 then raise exception 'Informe o nome do comprador.'; end if;
  select count(*) into n from ingressos where festa_id = f.id and status in ('pendente','pago','usado');
  if f.limite_ingressos is not null and n >= f.limite_ingressos then raise exception 'Os ingressos dessa festa esgotaram.'; end if;
  cod := novo_codigo_ingresso();
  insert into ingressos(festa_id, republica_id, comprador, contato, membro_id, codigo, valor, criado_por)
  values (f.id, f.republica_id, trim(p_comprador), nullif(trim(coalesce(p_contato,'')),''), meu_membro(f.republica_id), cod, f.ingresso_preco, auth.uid())
  returning id into iid;
  if p_pago then perform confirmar_pagamento(iid); end if;
  return cod;
end $$;

-- confirma o Pix: o ingresso passa a valer, nasce a taxa de R$ 0,25 e o valor entra no caixa da festa
create or replace function confirmar_pagamento(p_ingresso uuid) returns void
language plpgsql security definer set search_path = public as $$
declare i ingressos; f festas; lid uuid;
begin
  select * into i from ingressos where id = p_ingresso;
  if not found then raise exception 'Ingresso não encontrado.'; end if;
  perform exigir_ing(i.republica_id, 'ingressos');
  if i.status <> 'pendente' then raise exception 'Esse ingresso não está aguardando pagamento.'; end if;
  select * into f from festas where id = i.festa_id;
  if f.conta_id is not null and tem_recurso(i.republica_id, 'financas') then
    insert into lancamentos(republica_id, conta_id, tipo, valor, descricao, categoria, origem, origem_id, criado_por)
    values (i.republica_id, f.conta_id, 'receita', i.valor, 'Ingresso — ' || i.comprador || ' (' || f.titulo || ')', 'Ingressos', 'ingresso', i.id, auth.uid())
    returning id into lid;
  end if;
  update ingressos set status = 'pago', pago_em = now(), lancamento_id = lid where id = i.id;
  insert into taxas_ingresso(ingresso_id, republica_id, valor, mes_cobranca)
  values (i.id, i.republica_id, 0.25, (date_trunc('month', hoje_br()) + interval '1 month')::date);
  perform log_atividade(i.republica_id, 'ingresso_confirmado', jsonb_build_object('festa', f.titulo, 'comprador', i.comprador, 'valor', i.valor));
end $$;

-- cancela: pendente a qualquer momento; pago só se ainda não foi usado. A taxa só é estornada em até 7 dias.
create or replace function cancelar_ingresso(p_ingresso uuid) returns void
language plpgsql security definer set search_path = public as $$
declare i ingressos; f festas;
begin
  select * into i from ingressos where id = p_ingresso;
  if not found then raise exception 'Ingresso não encontrado.'; end if;
  if i.status = 'usado' then raise exception 'Esse ingresso já foi usado na portaria.'; end if;
  if i.status = 'cancelado' then raise exception 'Esse ingresso já está cancelado.'; end if;
  if i.status = 'pendente' and i.membro_id is not null and i.membro_id = meu_membro(i.republica_id) then
    null; -- quem pediu pode cancelar o próprio pedido pendente
  else
    perform exigir_ing(i.republica_id, 'ingressos');
  end if;
  select * into f from festas where id = i.festa_id;
  if i.status = 'pago' then
    if i.lancamento_id is not null then delete from lancamentos where id = i.lancamento_id; end if;
    update taxas_ingresso set status = 'estornada'
     where ingresso_id = i.id and status = 'pendente' and now() - i.pago_em <= interval '7 days';
  end if;
  update ingressos set status = 'cancelado', lancamento_id = null where id = i.id;
  perform log_atividade(i.republica_id, 'ingresso_cancelado', jsonb_build_object('festa', f.titulo, 'comprador', i.comprador));
end $$;

create or replace function dar_baixa(p_ingresso uuid) returns text
language plpgsql security definer set search_path = public as $$
declare i ingressos; f festas;
begin
  select * into i from ingressos where id = p_ingresso;
  if not found then raise exception 'Ingresso não encontrado.'; end if;
  perform exigir_ing(i.republica_id, 'portaria');
  if i.status = 'usado' then raise exception 'Ingresso já utilizado em % às %.', to_char(i.usado_em at time zone 'America/Sao_Paulo', 'DD/MM'), to_char(i.usado_em at time zone 'America/Sao_Paulo', 'HH24:MI'); end if;
  if i.status = 'pendente' then raise exception 'O pagamento desse ingresso ainda não foi confirmado.'; end if;
  if i.status = 'cancelado' then raise exception 'Esse ingresso foi cancelado.'; end if;
  update ingressos set status = 'usado', usado_em = now() where id = i.id;
  select * into f from festas where id = i.festa_id;
  perform log_atividade(i.republica_id, 'ingresso_usado', jsonb_build_object('festa', f.titulo, 'comprador', i.comprador));
  return i.comprador;
end $$;

create or replace function ingressos_da_festa(p_festa uuid)
returns table(id uuid, comprador text, contato text, vendedor text, codigo text, status text, valor numeric, pago_em timestamptz, usado_em timestamptz, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select i.id, i.comprador, i.contato, (select p.nome from membros m join profiles p on p.id = m.user_id where m.id = i.membro_id),
         i.codigo, i.status, i.valor, i.pago_em, i.usado_em, i.created_at
  from ingressos i join festas f on f.id = i.festa_id
  where i.festa_id = p_festa and recurso_ok(f.republica_id, 'ingressos')
    and (tem_funcao(f.republica_id, 'ingressos') or tem_funcao(f.republica_id, 'portaria'))
  order by i.status = 'cancelado', i.comprador
$$;

create or replace function meus_ingressos(p_rep uuid)
returns table(id uuid, festa_id uuid, festa text, data date, comprador text, codigo text, status text, valor numeric, pix_chave text, contato_whatsapp text)
language sql stable security definer set search_path = public as $$
  select i.id, f.id, f.titulo, f.data, i.comprador, i.codigo, i.status, i.valor, f.pix_chave, f.contato_whatsapp
  from ingressos i join festas f on f.id = i.festa_id
  where i.republica_id = p_rep and i.membro_id = meu_membro(p_rep) and recurso_ok(p_rep, 'ingressos') and i.status <> 'cancelado'
  order by f.data desc, i.created_at desc
$$;

-- a festa não pode ser cancelada se já há ingressos pagos
create or replace function cancelar_festa(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare f festas;
begin
  select * into f from festas where id = p_id;
  if not found or not is_lider(f.republica_id) then raise exception 'Sem permissão.'; end if;
  if exists(select 1 from ingressos where festa_id = f.id and status in ('pago','usado')) then
    raise exception 'Essa festa já tem ingressos pagos. Cancele os ingressos antes (para devolver o Pix).'; end if;
  delete from festas where id = f.id;
  perform log_atividade(f.republica_id, 'festa_cancelada', jsonb_build_object('titulo', f.titulo, 'data', f.data));
end $$;

-- ---------------- painel do admin ----------------
create or replace function admin_taxas(p_mes date)
returns table(republica_id uuid, republica text, ingressos bigint, valor numeric, estornadas bigint, cobradas bigint)
language sql stable security definer set search_path = public as $$
  select r.id, r.nome,
         count(t.id) filter (where t.status in ('pendente','cobrada')),
         coalesce(sum(t.valor) filter (where t.status in ('pendente','cobrada')), 0),
         count(t.id) filter (where t.status = 'estornada'),
         count(t.id) filter (where t.status = 'cobrada')
  from republicas r join taxas_ingresso t on t.republica_id = r.id
  where is_super_admin() and not r.demo and t.mes_cobranca = date_trunc('month', p_mes)::date
  group by r.id order by r.nome
$$;

create or replace function admin_marcar_taxas_cobradas(p_rep uuid, p_mes date) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_super_admin() then raise exception 'Sem permissão.'; end if;
  update taxas_ingresso set status = 'cobrada' where republica_id = p_rep and status = 'pendente' and mes_cobranca = date_trunc('month', p_mes)::date;
end $$;

create or replace function admin_festas()
returns table(id uuid, republica text, cidade text, demo boolean, data date, titulo text, local text, vendidos bigint, pendentes bigint, usados bigint)
language sql stable security definer set search_path = public as $$
  select f.id, r.nome, r.cidade, r.demo, f.data, f.titulo, f.local,
         count(i.id) filter (where i.status in ('pago','usado')), count(i.id) filter (where i.status = 'pendente'), count(i.id) filter (where i.status = 'usado')
  from festas f join republicas r on r.id = f.republica_id left join ingressos i on i.festa_id = f.id
  where is_super_admin() and f.data >= hoje_br() - 60
  group by f.id, r.id order by f.data, r.nome
$$;

revoke execute on function festas_ingressos(uuid), configurar_ingressos(uuid,numeric,text,text,boolean,int,uuid), pedir_ingresso(uuid,text,text),
  emitir_ingresso(uuid,text,text,boolean), confirmar_pagamento(uuid), cancelar_ingresso(uuid), dar_baixa(uuid), ingressos_da_festa(uuid),
  meus_ingressos(uuid), cancelar_festa(uuid), admin_taxas(date), admin_marcar_taxas_cobradas(uuid,date), admin_festas() from public, anon;
grant execute on function festas_ingressos(uuid), configurar_ingressos(uuid,numeric,text,text,boolean,int,uuid), pedir_ingresso(uuid,text,text),
  emitir_ingresso(uuid,text,text,boolean), confirmar_pagamento(uuid), cancelar_ingresso(uuid), dar_baixa(uuid), ingressos_da_festa(uuid),
  meus_ingressos(uuid), cancelar_festa(uuid), admin_taxas(date), admin_marcar_taxas_cobradas(uuid,date), admin_festas() to authenticated;
