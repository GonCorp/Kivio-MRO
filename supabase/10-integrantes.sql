-- Integrantes cadastrados pelo líder (o acesso é criado pela Edge Function lider-integrante)

create or replace function integrantes_detalhe(p_rep uuid)
returns table(membro_id uuid, user_id uuid, nome text, whatsapp text, email text, papel text, funcoes text[], ativo boolean)
language sql stable security definer set search_path = public, auth as $$
  select m.id, m.user_id, p.nome, p.whatsapp, u.email::text, m.papel, m.funcoes, m.ativo
  from membros m join profiles p on p.id = m.user_id join auth.users u on u.id = m.user_id
  where m.republica_id = p_rep and is_lider(p_rep)
  order by m.ativo desc, m.papel = 'lider' desc, p.nome
$$;

create or replace function definir_whatsapp_membro(p_membro uuid, p_whatsapp text) returns void
language plpgsql security definer set search_path = public as $$
declare m membros;
begin
  select * into m from membros where id = p_membro;
  if not found or not is_lider(m.republica_id) then raise exception 'Só o líder pode fazer isso.'; end if;
  update profiles set whatsapp = nullif(regexp_replace(coalesce(p_whatsapp,''), '\D', '', 'g'), '') where id = m.user_id;
  perform log_atividade(m.republica_id, 'whatsapp_integrante', jsonb_build_object('membro', p_membro));
end $$;

create or replace function reativar_membro(p_membro uuid) returns void
language plpgsql security definer set search_path = public as $$
declare m membros; r republicas; n int;
begin
  select * into m from membros where id = p_membro;
  if not found or not is_lider(m.republica_id) then raise exception 'Só o líder pode fazer isso.'; end if;
  if m.ativo then raise exception 'Esse integrante já está na república.'; end if;
  select * into r from republicas where id = m.republica_id;
  select count(*) into n from membros where republica_id = m.republica_id and ativo;
  if n >= r.limite_membros then raise exception 'A república já está no limite de % integrantes do plano.', r.limite_membros; end if;
  if exists(select 1 from membros x where x.user_id = m.user_id and x.ativo) then raise exception 'Essa pessoa já está ativa em outra república.'; end if;
  update membros set ativo = true where id = p_membro;
  perform log_atividade(m.republica_id, 'integrante_reativado', jsonb_build_object('membro', p_membro));
end $$;

create or replace function apagar_ex_membro(p_membro uuid) returns void
language plpgsql security definer set search_path = public as $$
declare m membros;
begin
  select * into m from membros where id = p_membro;
  if not found or not is_lider(m.republica_id) then raise exception 'Só o líder pode fazer isso.'; end if;
  if m.ativo or m.papel = 'lider' then raise exception 'Só dá para apagar quem já saiu da república.'; end if;
  delete from membros where id = p_membro;
  perform log_atividade(m.republica_id, 'ex_integrante_apagado', '{}');
end $$;

revoke execute on function integrantes_detalhe(uuid), definir_whatsapp_membro(uuid,text), reativar_membro(uuid), apagar_ex_membro(uuid) from public, anon;
grant execute on function integrantes_detalhe(uuid), definir_whatsapp_membro(uuid,text), reativar_membro(uuid), apagar_ex_membro(uuid) to authenticated;
