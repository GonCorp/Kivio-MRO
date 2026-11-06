-- Edita uma tarefa da escala. Se ela já tem histórico, o histórico fica intacto: a antiga é encerrada ontem e uma nova começa na data pedida.
create or replace function editar_tarefa(p_tarefa uuid, p_titulo text, p_membro uuid, p_dia int, p_inicio date, p_repeticao text, p_vezes int)
returns uuid language plpgsql security definer set search_path = public as $$
declare t tarefas; novo uuid;
begin
  select * into t from tarefas where id = p_tarefa;
  if not found or not tem_funcao(t.republica_id, 'multas') then raise exception 'Sem permissão para a escala.'; end if;
  if not tem_recurso(t.republica_id, 'escala') then raise exception 'A escala não está incluída no plano desta república.'; end if;
  if not exists(select 1 from membros where id = p_membro and republica_id = t.republica_id and ativo) then raise exception 'Integrante inválido.'; end if;
  if length(trim(coalesce(p_titulo,''))) < 2 then raise exception 'Dê um nome à tarefa.'; end if;
  if p_dia not between 0 and 6 then raise exception 'Dia inválido.'; end if;
  if p_repeticao not in ('semanal','uma_vez','n_vezes') then raise exception 'Repetição inválida.'; end if;
  if p_repeticao = 'n_vezes' and coalesce(p_vezes,0) < 2 then raise exception 'Informe quantas vezes (2 ou mais).'; end if;
  if p_inicio < hoje_br() and p_inicio <> t.inicio then raise exception 'A data de início não pode ser no passado.'; end if;
  if primeira_data(t) >= hoje_br() and not exists(select 1 from execucoes where tarefa_id = t.id) then
    update tarefas set titulo = trim(p_titulo), membro_id = p_membro, dia_semana = p_dia, inicio = p_inicio, repeticao = p_repeticao,
      vezes = case when p_repeticao = 'n_vezes' then p_vezes end, fim = null where id = t.id;
    novo := t.id;
  else
    update tarefas set fim = least(coalesce(fim, hoje_br() - 1), hoje_br() - 1) where id = t.id;
    insert into tarefas(republica_id, membro_id, titulo, descricao, dia_semana, inicio, repeticao, vezes, criado_por)
    values (t.republica_id, p_membro, trim(p_titulo), t.descricao, p_dia, greatest(p_inicio, hoje_br()), p_repeticao,
            case when p_repeticao = 'n_vezes' then p_vezes end, auth.uid()) returning id into novo;
  end if;
  perform log_atividade(t.republica_id, 'tarefa_editada', jsonb_build_object('titulo', p_titulo));
  return novo;
end $$;
revoke execute on function editar_tarefa(uuid,text,uuid,int,date,text,int) from public, anon;
grant execute on function editar_tarefa(uuid,text,uuid,int,date,text,int) to authenticated;
