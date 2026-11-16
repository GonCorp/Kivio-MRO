-- Regras da república (foto de comprovação, motivos de justificativa) e personalização (nome, cor). Tudo começa zerado.
alter table republicas add column if not exists foto_missao text not null default 'desligada' check (foto_missao in ('desligada','opcional','obrigatoria'));
alter table republicas add column if not exists cor text check (cor is null or cor ~ '^#[0-9a-fA-F]{6}$');

create table if not exists motivos_justificativa (
  id uuid primary key default gen_random_uuid(),
  republica_id uuid not null references republicas(id) on delete cascade,
  motivo text not null,
  acao text not null default 'analisar' check (acao in ('aceitar','analisar','recusar')),
  created_at timestamptz not null default now(),
  unique (republica_id, motivo)
);
alter table motivos_justificativa enable row level security;
drop policy if exists p_sel on motivos_justificativa;
create policy p_sel on motivos_justificativa for select using (is_member(republica_id));
grant select on motivos_justificativa to authenticated;
revoke all on motivos_justificativa from anon;

create or replace function salvar_regras_gerais(p_rep uuid, p_foto text, p_dias int) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_lider(p_rep) then raise exception 'Só o líder altera as regras.'; end if;
  if p_foto not in ('desligada','opcional','obrigatoria') then raise exception 'Opção inválida.'; end if;
  if p_dias < 0 or p_dias > 30 then raise exception 'O espaçamento vai de 0 a 30 dias.'; end if;
  update republicas set foto_missao = p_foto, espacamento_dias = p_dias where id = p_rep;
  perform log_atividade(p_rep, 'regras_alteradas', jsonb_build_object('foto', p_foto, 'dias', p_dias));
end $$;

create or replace function salvar_motivo(p_rep uuid, p_motivo text, p_acao text, p_id uuid default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_lider(p_rep) then raise exception 'Só o líder altera as regras.'; end if;
  if p_acao not in ('aceitar','analisar','recusar') then raise exception 'Resposta inválida.'; end if;
  if length(trim(coalesce(p_motivo,''))) < 3 then raise exception 'Escreva o motivo.'; end if;
  if p_id is null then
    insert into motivos_justificativa(republica_id, motivo, acao) values (p_rep, trim(p_motivo), p_acao)
    on conflict (republica_id, motivo) do update set acao = excluded.acao;
  else
    update motivos_justificativa set acao = p_acao where id = p_id and republica_id = p_rep;
  end if;
  perform log_atividade(p_rep, 'motivo_justificativa', jsonb_build_object('motivo', p_motivo, 'acao', p_acao));
end $$;

create or replace function remover_motivo(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r uuid;
begin
  select republica_id into r from motivos_justificativa where id = p_id;
  if r is null then raise exception 'Motivo não encontrado.'; end if;
  if not is_lider(r) then raise exception 'Só o líder altera as regras.'; end if;
  delete from motivos_justificativa where id = p_id;
end $$;

create or replace function atualizar_republica(p_rep uuid, p_nome text, p_cor text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_lider(p_rep) then raise exception 'Só o líder altera a identidade da república.'; end if;
  if length(trim(coalesce(p_nome,''))) < 2 then raise exception 'Informe o nome da república.'; end if;
  if p_cor is not null and p_cor !~ '^#[0-9a-fA-F]{6}$' then raise exception 'Cor inválida.'; end if;
  update republicas set nome = trim(p_nome), cor = p_cor where id = p_rep;
  perform log_atividade(p_rep, 'identidade_alterada', jsonb_build_object('nome', p_nome));
end $$;

-- Justificar: se o motivo tem resposta combinada, aplica na hora (aceitar/recusar); senão vai para o líder analisar.
create or replace function justificar(p_tarefa uuid, p_data date, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare t tarefas; m membros; pol text; st text := 'em_analise';
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
  select acao into pol from motivos_justificativa where republica_id = t.republica_id and lower(motivo) = lower(trim(p_motivo));
  if pol = 'aceitar' then st := 'justificada'; elsif pol = 'recusar' then st := 'recusada'; end if;
  insert into execucoes(tarefa_id, republica_id, data, status, motivo)
  values (t.id, t.republica_id, p_data, st, trim(p_motivo))
  on conflict (tarefa_id, data) do update set status = st, motivo = trim(p_motivo), updated_at = now();
  perform log_atividade(t.republica_id, 'justificativa_enviada', jsonb_build_object('tarefa', t.id, 'data', p_data, 'resposta_automatica', pol));
end $$;

revoke execute on function salvar_regras_gerais(uuid,text,int), salvar_motivo(uuid,text,text,uuid), remover_motivo(uuid), atualizar_republica(uuid,text,text) from public, anon;
grant execute on function salvar_regras_gerais(uuid,text,int), salvar_motivo(uuid,text,text,uuid), remover_motivo(uuid), atualizar_republica(uuid,text,text) to authenticated;
