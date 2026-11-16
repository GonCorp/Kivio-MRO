-- Fotos (comprovação de tarefa, perfil, logo da república) + comparação com nomes por padrão.
alter table republicas alter column comparar_nomes set default true;
update republicas set comparar_nomes = true;
alter table republicas add column if not exists logo_path text;
alter table profiles add column if not exists foto_path text;
alter table execucoes add column if not exists foto_path text;

-- Bucket privado: só integrantes da república enxergam as fotos dela (pasta = id da república)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('mro', 'mro', false, 2097152, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set file_size_limit = 2097152, allowed_mime_types = array['image/jpeg','image/png','image/webp'];

drop policy if exists mro_ler on storage.objects;
create policy mro_ler on storage.objects for select to authenticated
  using (bucket_id = 'mro' and case when (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$' then is_member(((storage.foldername(name))[1])::uuid) else false end);
drop policy if exists mro_enviar on storage.objects;
create policy mro_enviar on storage.objects for insert to authenticated
  with check (bucket_id = 'mro' and case when (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$' then is_member(((storage.foldername(name))[1])::uuid) else false end);

create or replace function definir_foto_perfil(p_rep uuid, p_path text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_member(p_rep) then raise exception 'Sem acesso.'; end if;
  if p_path is not null and p_path not like p_rep::text || '/%' then raise exception 'Caminho inválido.'; end if;
  update profiles set foto_path = p_path where id = auth.uid();
end $$;

create or replace function definir_logo(p_rep uuid, p_path text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_lider(p_rep) then raise exception 'Só o líder muda a foto da república.'; end if;
  if p_path is not null and p_path not like p_rep::text || '/%' then raise exception 'Caminho inválido.'; end if;
  update republicas set logo_path = p_path where id = p_rep;
end $$;

-- Marcar como feita com foto de comprovação (respeita a regra da república)
create or replace function marcar_feita_foto(p_tarefa uuid, p_data date, p_path text)
returns void language plpgsql security definer set search_path = public as $$
declare t tarefas; m membros; gerente boolean; modo text;
begin
  select * into t from tarefas where id = p_tarefa;
  if not found or not is_member(t.republica_id) then raise exception 'Tarefa não encontrada.'; end if;
  if not tem_recurso(t.republica_id, 'escala') then raise exception 'A escala não está incluída no plano desta república.'; end if;
  if not ocorre_em(t, p_data) then raise exception 'A tarefa não acontece nesse dia.'; end if;
  select foto_missao into modo from republicas where id = t.republica_id;
  select * into m from membros where id = t.membro_id;
  gerente := tem_funcao(t.republica_id, 'multas');
  if m.user_id <> auth.uid() and not gerente then raise exception 'Essa tarefa é de outra pessoa.'; end if;
  if not gerente and p_data <> hoje_br() then
    raise exception 'Você só pode marcar a tarefa no próprio dia. Fora disso, use "Justificar".'; end if;
  if p_data > hoje_br() then raise exception 'Esse dia ainda não chegou.'; end if;
  if p_path is null and modo = 'obrigatoria' and not gerente then raise exception 'Esta república pede uma foto para concluir a tarefa.'; end if;
  if p_path is not null and p_path not like t.republica_id::text || '/%' then raise exception 'Caminho inválido.'; end if;
  insert into execucoes(tarefa_id, republica_id, data, status, decidido_por, foto_path)
  values (t.id, t.republica_id, p_data, 'feita', auth.uid(), p_path)
  on conflict (tarefa_id, data) do update set status = 'feita', motivo = null,
     decidido_por = auth.uid(), foto_path = p_path, updated_at = now();
  perform log_atividade(t.republica_id, 'tarefa_feita', jsonb_build_object('tarefa', t.id, 'data', p_data, 'foto', p_path is not null));
end $$;

-- A versão sem foto passa a respeitar a regra "obrigatória" para integrantes comuns
create or replace function marcar_feita(p_tarefa uuid, p_data date)
returns void language plpgsql security definer set search_path = public as $$
declare t tarefas; m membros; gerente boolean; modo text;
begin
  select * into t from tarefas where id = p_tarefa;
  if not found or not is_member(t.republica_id) then raise exception 'Tarefa não encontrada.'; end if;
  gerente := tem_funcao(t.republica_id, 'multas');
  select foto_missao into modo from republicas where id = t.republica_id;
  if modo = 'obrigatoria' and not gerente then raise exception 'Esta república pede uma foto para concluir a tarefa.'; end if;
  perform marcar_feita_foto(p_tarefa, p_data, null);
end $$;

revoke execute on function definir_foto_perfil(uuid,text), definir_logo(uuid,text), marcar_feita_foto(uuid,date,text), marcar_feita(uuid,date) from public, anon;
grant execute on function definir_foto_perfil(uuid,text), definir_logo(uuid,text), marcar_feita_foto(uuid,date,text), marcar_feita(uuid,date) to authenticated;
