-- Comparação entre colegas no painel do integrante: por padrão sem nomes (Colega 1, 2...). O líder pode liberar.
alter table republicas add column if not exists comparar_nomes boolean not null default false;

create or replace function salvar_comparacao(p_rep uuid, p_nomes boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_lider(p_rep) then raise exception 'Só o líder altera as regras.'; end if;
  update republicas set comparar_nomes = p_nomes where id = p_rep;
  perform log_atividade(p_rep, 'comparacao_alterada', jsonb_build_object('nomes', p_nomes));
end $$;
revoke execute on function salvar_comparacao(uuid,boolean) from public, anon;
grant execute on function salvar_comparacao(uuid,boolean) to authenticated;
