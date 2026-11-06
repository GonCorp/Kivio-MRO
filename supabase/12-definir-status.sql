-- Quadro da reunião mensal: o líder (ou quem cuida das multas) ajusta o status de uma missão
create or replace function definir_status_missao(p_tarefa uuid, p_data date, p_status text) returns void
language plpgsql security definer set search_path = public as $$
declare t tarefas;
begin
  select * into t from tarefas where id = p_tarefa;
  if not found or not tem_funcao(t.republica_id, 'multas') then raise exception 'Sem permissão.'; end if;
  if not tem_recurso(t.republica_id, 'escala') then raise exception 'A escala não está incluída no plano desta república.'; end if;
  if not ocorre_em(t, p_data) then raise exception 'Essa tarefa não vale nesse dia.'; end if;
  if p_data > hoje_br() then raise exception 'Esse dia ainda não chegou.'; end if;
  if p_status = 'pendente' then
    if p_data < hoje_br() then raise exception 'Dia que já passou não volta a ficar pendente. Marque feita, justificada ou não fez.'; end if;
    delete from execucoes where tarefa_id = p_tarefa and data = p_data;
  elsif p_status in ('feita','justificada','falta') then
    insert into execucoes(tarefa_id, republica_id, data, status, decidido_por)
    values (p_tarefa, t.republica_id, p_data, case p_status when 'falta' then 'recusada' else p_status end, auth.uid())
    on conflict (tarefa_id, data) do update set status = excluded.status, decidido_por = auth.uid(), updated_at = now();
  else raise exception 'Status inválido.'; end if;
  perform log_atividade(t.republica_id, 'missao_status', jsonb_build_object('tarefa', t.titulo, 'data', p_data, 'status', p_status));
end $$;
revoke execute on function definir_status_missao(uuid,date,text) from public, anon;
grant execute on function definir_status_missao(uuid,date,text) to authenticated;
