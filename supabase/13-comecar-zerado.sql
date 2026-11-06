-- Tudo começa zerado: sem escada de multa pré-pronta
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
  perform log_atividade(rid, 'republica_criada', jsonb_build_object('nome', p_nome));
  return rid;
end $$;
