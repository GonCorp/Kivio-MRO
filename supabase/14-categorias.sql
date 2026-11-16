-- Categorias de lançamento (ícone + cor) e edição de quem paga uma cobrança. Começam zeradas.
create table if not exists categorias (
  id uuid primary key default gen_random_uuid(),
  republica_id uuid not null references republicas(id) on delete cascade,
  nome text not null,
  icone text not null default '📌',
  cor text not null default '#6366f1',
  created_at timestamptz not null default now(),
  unique (republica_id, nome)
);
alter table categorias enable row level security;
drop policy if exists p_sel on categorias;
create policy p_sel on categorias for select using (tem_funcao(republica_id, 'financeiro') and recurso_ok(republica_id, 'financas'));
grant select on categorias to authenticated;
revoke all on categorias from anon;

create or replace function criar_categoria(p_rep uuid, p_nome text, p_icone text, p_cor text) returns uuid
language plpgsql security definer set search_path = public as $$
declare cid uuid;
begin
  perform exigir_fin(p_rep);
  if length(trim(coalesce(p_nome,''))) < 2 then raise exception 'Dê um nome à categoria.'; end if;
  if exists(select 1 from categorias where republica_id = p_rep and lower(nome) = lower(trim(p_nome))) then
    raise exception 'Essa categoria já existe.'; end if;
  insert into categorias(republica_id, nome, icone, cor)
  values (p_rep, trim(p_nome), coalesce(nullif(p_icone,''),'📌'), coalesce(nullif(p_cor,''),'#6366f1')) returning id into cid;
  perform log_atividade(p_rep, 'categoria_criada', jsonb_build_object('nome', p_nome));
  return cid;
end $$;

create or replace function remover_categoria(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare c categorias;
begin
  select * into c from categorias where id = p_id;
  if not found then raise exception 'Categoria não encontrada.'; end if;
  perform exigir_fin(c.republica_id);
  delete from categorias where id = c.id;
  perform log_atividade(c.republica_id, 'categoria_removida', jsonb_build_object('nome', c.nome));
end $$;

-- Define exatamente quem paga a cobrança: inclui novos e tira quem ainda não pagou (quem já pagou fica).
create or replace function definir_membros_cobranca(p_cob uuid, p_membros uuid[]) returns void
language plpgsql security definer set search_path = public as $$
declare c cobrancas; m uuid;
begin
  select * into c from cobrancas where id = p_cob;
  if not found then raise exception 'Cobrança não encontrada.'; end if;
  perform exigir_fin(c.republica_id);
  foreach m in array coalesce(p_membros, '{}') loop
    if not exists(select 1 from membros where id = m and republica_id = c.republica_id and ativo) then
      raise exception 'Integrante inválido.'; end if;
    insert into cobranca_itens(cobranca_id, republica_id, membro_id, valor)
    values (c.id, c.republica_id, m, c.valor) on conflict (cobranca_id, membro_id) do nothing;
  end loop;
  delete from cobranca_itens where cobranca_id = c.id and not pago and not (membro_id = any(coalesce(p_membros,'{}')));
  if not exists(select 1 from cobranca_itens where cobranca_id = c.id) then
    raise exception 'A cobrança precisa de ao menos um integrante.'; end if;
  perform log_atividade(c.republica_id, 'cobranca_editada', jsonb_build_object('titulo', c.titulo));
end $$;

revoke execute on function criar_categoria(uuid,text,text,text), remover_categoria(uuid), definir_membros_cobranca(uuid,uuid[]) from public, anon;
grant execute on function criar_categoria(uuid,text,text,text), remover_categoria(uuid), definir_membros_cobranca(uuid,uuid[]) to authenticated;
