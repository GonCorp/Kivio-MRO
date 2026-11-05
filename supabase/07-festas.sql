-- =====================================================================
-- MRO · Calendário de festas compartilhado entre repúblicas da mesma região.
-- "calendario_ver" = consultar (inclusive plano grátis) · "calendario" = marcar festa (só o líder).
-- Repúblicas de demonstração só enxergam festas de outras demonstrações (e as reais, só das reais).
-- Roda depois do 06-financas.sql.
-- =====================================================================
alter table republicas add column if not exists espacamento_dias int not null default 3 check (espacamento_dias between 0 and 30);

create table if not exists festas (
  id uuid primary key default gen_random_uuid(),
  republica_id uuid not null references republicas(id) on delete cascade,
  data date not null,
  titulo text not null,
  local text,
  criado_por uuid,
  created_at timestamptz not null default now()
);
create index if not exists ix_festas_data on festas(data);
alter table festas enable row level security;   -- leitura só pelas funções abaixo
revoke all on festas from anon, authenticated;

-- todo plano pode consultar o calendário
update planos set recursos = array_append(recursos, 'calendario_ver') where not ('calendario_ver' = any(recursos));

create or replace function calendario(p_rep uuid, p_de date, p_ate date)
returns table(id uuid, republica_id uuid, republica text, data date, titulo text, local text, minha boolean, espacamento_dias int)
language sql stable security definer set search_path = public as $$
  select f.id, f.republica_id, r.nome, f.data, f.titulo, f.local, (f.republica_id = p_rep), r.espacamento_dias
  from festas f
  join republicas r on r.id = f.republica_id
  join republicas eu on eu.id = p_rep
  where is_member(p_rep)
    and (recurso_ok(p_rep, 'calendario_ver') or recurso_ok(p_rep, 'calendario'))
    and r.cidade = eu.cidade and r.demo = eu.demo and r.ativo
    and f.data between p_de and p_ate
  order by f.data, r.nome
$$;

create or replace function marcar_festa(p_rep uuid, p_data date, p_titulo text, p_local text) returns uuid
language plpgsql security definer set search_path = public as $$
declare fid uuid;
begin
  if not is_lider(p_rep) then raise exception 'Só o líder marca festas.'; end if;
  if not tem_recurso(p_rep, 'calendario') then raise exception 'Marcar festas não está incluído no plano desta república.'; end if;
  if p_data is null or p_data < hoje_br() then raise exception 'A data da festa não pode estar no passado.'; end if;
  if length(trim(coalesce(p_titulo,''))) < 2 then raise exception 'Dê um nome à festa.'; end if;
  if exists(select 1 from festas where republica_id = p_rep and data = p_data) then raise exception 'Sua república já tem festa nesse dia.'; end if;
  insert into festas(republica_id, data, titulo, local, criado_por)
  values (p_rep, p_data, trim(p_titulo), nullif(trim(coalesce(p_local,'')),''), auth.uid()) returning id into fid;
  perform log_atividade(p_rep, 'festa_marcada', jsonb_build_object('titulo', p_titulo, 'data', p_data));
  return fid;
end $$;

create or replace function cancelar_festa(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare f festas;
begin
  select * into f from festas where id = p_id;
  if not found or not is_lider(f.republica_id) then raise exception 'Sem permissão.'; end if;
  delete from festas where id = f.id;
  perform log_atividade(f.republica_id, 'festa_cancelada', jsonb_build_object('titulo', f.titulo, 'data', f.data));
end $$;

create or replace function definir_espacamento(p_rep uuid, p_dias int) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_lider(p_rep) then raise exception 'Só o líder define o espaçamento.'; end if;
  if p_dias < 0 or p_dias > 30 then raise exception 'Use entre 0 e 30 dias.'; end if;
  update republicas set espacamento_dias = p_dias where id = p_rep;
  perform log_atividade(p_rep, 'espacamento_definido', jsonb_build_object('dias', p_dias));
end $$;

revoke execute on function calendario(uuid,date,date), marcar_festa(uuid,date,text,text), cancelar_festa(uuid), definir_espacamento(uuid,int) from public, anon;
grant execute on function calendario(uuid,date,date), marcar_festa(uuid,date,text,text), cancelar_festa(uuid), definir_espacamento(uuid,int) to authenticated;
