-- =====================================================================
-- MRO · Recursos por plano e por república (o plano passa a MANDAR de verdade no app).
-- Regra: recurso vale se estiver no plano da república OU se o admin ligou à mão para ela;
-- o admin também pode desligar à mão um recurso que o plano daria. Liga/desliga pode ter data final.
-- Roda depois do 03-admin.sql.
-- =====================================================================

create table if not exists republica_recursos (
  republica_id uuid not null references republicas(id) on delete cascade,
  recurso text not null,
  ativo boolean not null,            -- true = ligado à mão · false = desligado à mão
  ate date,                          -- até quando vale (inclusive); null = sem prazo
  created_at timestamptz not null default now(),
  primary key (republica_id, recurso)
);
alter table republica_recursos enable row level security;
drop policy if exists p_admin_all on republica_recursos;
create policy p_admin_all on republica_recursos for all using (is_super_admin()) with check (is_super_admin());
grant select, insert, update, delete on republica_recursos to authenticated;
revoke all on republica_recursos from anon;

-- Lista final de recursos valendo hoje para a república (uso interno das funções do banco)
create or replace function recursos_valendo(p_rep uuid) returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(x.r order by x.r), '{}') from (
    select r as r from republicas rep join planos p on p.id = rep.plano, unnest(p.recursos) r
     where rep.id = p_rep
       and not exists(select 1 from republica_recursos o where o.republica_id = p_rep and o.recurso = r
                       and not o.ativo and (o.ate is null or o.ate >= hoje_br()))
    union
    select o.recurso from republica_recursos o
     where o.republica_id = p_rep and o.ativo and (o.ate is null or o.ate >= hoje_br())
  ) x
$$;

create or replace function tem_recurso(p_rep uuid, p_rec text) returns boolean
language sql stable security definer set search_path = public as $$
  select p_rec = any(recursos_valendo(p_rep))
$$;

-- O app chama esta: integrantes da república (e o admin) veem o que está liberado
create or replace function recursos_da_republica(p_rep uuid) returns text[]
language plpgsql stable security definer set search_path = public as $$
begin
  if not (is_member(p_rep) or is_super_admin()) then return '{}'; end if;
  return recursos_valendo(p_rep);
end $$;

-- Admin: liga (true), desliga (false) ou volta ao padrão do plano (null)
create or replace function admin_set_recurso(p_rep uuid, p_recurso text, p_ativo boolean, p_ate date default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_super_admin() then raise exception 'Sem permissão.'; end if;
  if p_ate is not null and p_ate < hoje_br() then raise exception 'A data final não pode estar no passado.'; end if;
  if p_ativo is null then
    delete from republica_recursos where republica_id = p_rep and recurso = p_recurso;
  else
    insert into republica_recursos(republica_id, recurso, ativo, ate) values (p_rep, p_recurso, p_ativo, p_ate)
    on conflict (republica_id, recurso) do update set ativo = excluded.ativo, ate = excluded.ate;
  end if;
  perform log_atividade(p_rep, 'recurso_alterado', jsonb_build_object('recurso', p_recurso, 'ativo', p_ativo, 'ate', p_ate));
end $$;

-- Admin: limite de integrantes de uma república (não pode ficar abaixo de quem já está dentro)
create or replace function admin_set_limite(p_rep uuid, p_limite int) returns void
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not is_super_admin() then raise exception 'Sem permissão.'; end if;
  select count(*) into n from membros where republica_id = p_rep and ativo;
  if p_limite < greatest(n, 1) then raise exception 'Hoje há % integrante(s); o limite não pode ser menor.', n; end if;
  update republicas set limite_membros = p_limite where id = p_rep;
  perform log_atividade(p_rep, 'limite_alterado', jsonb_build_object('limite', p_limite));
end $$;

-- Admin: salva o plano e repassa o novo limite às repúblicas que usavam o limite padrão antigo
create or replace function admin_salvar_plano(p_id text, p_nome text, p_preco numeric, p_limite int, p_desc text, p_recursos text[])
returns int language plpgsql security definer set search_path = public as $$
declare antigo int; n int;
begin
  if not is_super_admin() then raise exception 'Sem permissão.'; end if;
  if p_limite < 1 then raise exception 'O limite precisa ser de pelo menos 1.'; end if;
  select limite_membros into antigo from planos where id = p_id;
  update planos set nome = p_nome, preco_mensal = p_preco, limite_membros = p_limite, descricao = p_desc, recursos = p_recursos where id = p_id;
  update republicas r set limite_membros = p_limite
   where r.plano = p_id and r.limite_membros = antigo
     and p_limite >= (select count(*) from membros m where m.republica_id = r.id and m.ativo);
  get diagnostics n = row_count;
  return n;
end $$;

-- ---- A partir daqui, as funções do app passam a respeitar os recursos ----
create or replace function criar_tarefas(p_rep uuid, p_membro uuid, p_titulo text, p_descricao text, p_dias integer[], p_inicio date, p_repeticao text, p_vezes integer)
returns integer language plpgsql security definer set search_path = public as $$
declare d int; n int := 0;
begin
  if not tem_funcao(p_rep, 'multas') then raise exception 'Sem permissão para a escala.'; end if;
  if not tem_recurso(p_rep, 'escala') then raise exception 'A escala não está incluída no plano desta república.'; end if;
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

create or replace function decidir_justificativa(p_tarefa uuid, p_data date, p_aceitar boolean)
returns void language plpgsql security definer set search_path = public as $$
declare t tarefas;
begin
  select * into t from tarefas where id = p_tarefa;
  if not found or not tem_funcao(t.republica_id, 'multas') then raise exception 'Sem permissão.'; end if;
  if not tem_recurso(t.republica_id, 'escala') then raise exception 'A escala não está incluída no plano desta república.'; end if;
  update execucoes set status = case when p_aceitar then 'justificada' else 'recusada' end,
         decidido_por = auth.uid(), updated_at = now()
   where tarefa_id = t.id and data = p_data and status = 'em_analise';
  if not found then raise exception 'Não há justificativa para analisar.'; end if;
  perform log_atividade(t.republica_id, case when p_aceitar then 'justificativa_aceita' else 'justificativa_recusada' end,
    jsonb_build_object('tarefa', t.id, 'data', p_data));
end $$;

create or replace function desmarcar_feita(p_tarefa uuid, p_data date)
returns void language plpgsql security definer set search_path = public as $$
declare t tarefas;
begin
  select * into t from tarefas where id = p_tarefa;
  if not found or not tem_funcao(t.republica_id, 'multas') then raise exception 'Sem permissão.'; end if;
  if not tem_recurso(t.republica_id, 'escala') then raise exception 'A escala não está incluída no plano desta república.'; end if;
  delete from execucoes where tarefa_id = t.id and data = p_data and status = 'feita';
  perform log_atividade(t.republica_id, 'tarefa_desmarcada', jsonb_build_object('tarefa', t.id, 'data', p_data));
end $$;

create or replace function encerrar_tarefa(p_tarefa uuid)
returns void language plpgsql security definer set search_path = public as $$
declare t tarefas;
begin
  select * into t from tarefas where id = p_tarefa;
  if not found or not tem_funcao(t.republica_id, 'multas') then raise exception 'Sem permissão.'; end if;
  if not tem_recurso(t.republica_id, 'escala') then raise exception 'A escala não está incluída no plano desta república.'; end if;
  if primeira_data(t) >= hoje_br() and not exists(select 1 from execucoes where tarefa_id = t.id) then
    delete from tarefas where id = t.id;
  else
    update tarefas set fim = hoje_br() - 1 where id = t.id;
  end if;
  perform log_atividade(t.republica_id, 'tarefa_encerrada', jsonb_build_object('titulo', t.titulo));
end $$;

create or replace function renomear_tarefa(p_tarefa uuid, p_titulo text, p_descricao text)
returns void language plpgsql security definer set search_path = public as $$
declare t tarefas;
begin
  select * into t from tarefas where id = p_tarefa;
  if not found or not tem_funcao(t.republica_id, 'multas') then raise exception 'Sem permissão.'; end if;
  if not tem_recurso(t.republica_id, 'escala') then raise exception 'A escala não está incluída no plano desta república.'; end if;
  update tarefas set titulo = trim(p_titulo), descricao = nullif(trim(coalesce(p_descricao,'')),'') where id = p_tarefa;
end $$;

create or replace function justificar(p_tarefa uuid, p_data date, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare t tarefas; m membros;
begin
  select * into t from tarefas where id = p_tarefa;
  if not found or not is_member(t.republica_id) then raise exception 'Tarefa não encontrada.'; end if;
  if not tem_recurso(t.republica_id, 'escala') then raise exception 'A escala não está incluída no plano desta república.'; end if;
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

create or replace function marcar_feita(p_tarefa uuid, p_data date)
returns void language plpgsql security definer set search_path = public as $$
declare t tarefas; m membros; gerente boolean;
begin
  select * into t from tarefas where id = p_tarefa;
  if not found or not is_member(t.republica_id) then raise exception 'Tarefa não encontrada.'; end if;
  if not tem_recurso(t.republica_id, 'escala') then raise exception 'A escala não está incluída no plano desta república.'; end if;
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

create or replace function salvar_faixas(p_rep uuid, p_valores numeric[], p_teto numeric)
returns void language plpgsql security definer set search_path = public as $$
declare i int;
begin
  if not tem_funcao(p_rep, 'multas') then raise exception 'Sem permissão para multas.'; end if;
  if not tem_recurso(p_rep, 'multas') then raise exception 'As multas não estão incluídas no plano desta república.'; end if;
  if coalesce(array_length(p_valores,1),0) < 1 then raise exception 'Informe ao menos uma faixa.'; end if;
  delete from faixas_multa where republica_id = p_rep;
  for i in 1..array_length(p_valores,1) loop
    insert into faixas_multa(republica_id, faixa, valor) values (p_rep, i, greatest(p_valores[i],0));
  end loop;
  update republicas set teto_multa = nullif(p_teto,0) where id = p_rep;
  perform log_atividade(p_rep, 'multas_configuradas', jsonb_build_object('faixas', p_valores, 'teto', p_teto));
end $$;

create or replace function ocorrencias(p_rep uuid, p_de date, p_ate date)
returns table(tarefa_id uuid, membro_id uuid, data date, status text, motivo text)
language sql stable security definer set search_path = public as $$
  select t.id, t.membro_id, g::date,
    case
      when e.status = 'feita' then 'feita'
      when e.status = 'justificada' then 'justificada'
      when e.status = 'em_analise' then 'em_analise'
      when e.status = 'recusada' then 'falta'
      when g::date < hoje_br() then 'falta'
      else 'pendente'
    end,
    e.motivo
  from tarefas t
  cross join lateral generate_series(
      greatest(p_de, primeira_data(t))::timestamp, p_ate::timestamp, interval '1 day') g
  left join execucoes e on e.tarefa_id = t.id and e.data = g::date
  where t.republica_id = p_rep
    and is_member(p_rep)
    and tem_recurso(p_rep, 'escala')
    and p_ate - p_de <= 62
    and ocorre_em(t, g::date)
$$;

create or replace function multas_do_mes(p_rep uuid, p_mes date)
returns table(membro_id uuid, tarefa_id uuid, data date, numero integer, valor numeric)
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
    and tem_recurso(p_rep, 'multas')
    and (tem_funcao(p_rep, 'multas') or m.user_id = auth.uid())
$$;

-- permissões das funções novas
revoke execute on function recursos_valendo(uuid), tem_recurso(uuid, text) from public, anon, authenticated;
revoke execute on function recursos_da_republica(uuid), admin_set_recurso(uuid,text,boolean,date),
  admin_set_limite(uuid,int), admin_salvar_plano(text,text,numeric,int,text,text[]) from public, anon;
grant execute on function recursos_da_republica(uuid), admin_set_recurso(uuid,text,boolean,date),
  admin_set_limite(uuid,int), admin_salvar_plano(text,text,numeric,int,text,text[]) to authenticated;

-- catálogo: o recurso "orçamento de festas" entra como exemplo de extra que você liga por república
-- (os recursos que ainda não existem no app só passam a funcionar quando forem construídos)
