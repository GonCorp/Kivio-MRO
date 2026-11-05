-- =====================================================================
-- MRO · O admin cria a república (e a conta do líder) já no plano pago, ou uma república de demonstração.
-- A conta do líder é criada pela função segura "admin-criar-republica" (Edge Function), que chama esta.
-- Roda depois do 04-recursos.sql.
-- =====================================================================
alter table republicas add column if not exists demo boolean not null default false;

create or replace function admin_criar_republica(
  p_user uuid, p_nome text, p_cidade text, p_whatsapp text, p_plano text,
  p_vencimento date, p_valor numeric, p_demo boolean)
returns uuid language plpgsql security definer set search_path = public as $$
declare rid uuid; cod text; lim int;
begin
  if not is_super_admin() then raise exception 'Sem permissão.'; end if;
  if length(trim(coalesce(p_nome,''))) < 2 then raise exception 'Informe o nome da república.'; end if;
  if not exists(select 1 from cidades where nome = p_cidade) then raise exception 'Região não cadastrada.'; end if;
  select limite_membros into lim from planos where id = p_plano;
  if lim is null then raise exception 'Plano inválido.'; end if;
  if exists(select 1 from membros where user_id = p_user and ativo) then raise exception 'Esse e-mail já faz parte de uma república.'; end if;
  loop
    cod := gerar_codigo(6);
    exit when not exists(select 1 from republicas where codigo_convite = cod);
  end loop;
  insert into republicas(nome, cidade, codigo_convite, whatsapp_lider, whatsapp_status, codigo_verificacao, criado_por,
                         plano, limite_membros, vencimento, valor_mensalidade, demo)
  values (trim(p_nome), p_cidade, cod, p_whatsapp, 'verificado', gerar_codigo(6, true), p_user,
          p_plano, lim, p_vencimento, p_valor, coalesce(p_demo, false))
  returning id into rid;
  insert into membros(republica_id, user_id, papel) values (rid, p_user, 'lider');
  insert into faixas_multa(republica_id, faixa, valor) values (rid,1,10),(rid,2,20),(rid,3,30);
  perform log_atividade(rid, 'republica_criada', jsonb_build_object('nome', p_nome, 'pelo_admin', true));
  return rid;
end $$;
revoke execute on function admin_criar_republica(uuid,text,text,text,text,date,numeric,boolean) from public, anon;
grant execute on function admin_criar_republica(uuid,text,text,text,text,date,numeric,boolean) to authenticated;

-- lista: agora com o campo demo (situação "demo" para repúblicas de demonstração)
drop function if exists admin_listar_republicas();
create or replace function admin_listar_republicas()
returns table(id uuid, nome text, cidade text, ativo boolean, plano text, integrantes bigint,
              lider_nome text, whatsapp_lider text, whatsapp_status text, codigo_verificacao text,
              created_at timestamptz, situacao text, vencimento date, valor_mensalidade numeric,
              nota_admin text, contatado boolean, limite_membros int, demo boolean)
language sql stable security definer set search_path = public as $$
  select r.id, r.nome, r.cidade, r.ativo, r.plano,
         (select count(*) from membros m where m.republica_id = r.id and m.ativo),
         (select p.nome from membros m join profiles p on p.id = m.user_id
           where m.republica_id = r.id and m.papel = 'lider' and m.ativo limit 1),
         r.whatsapp_lider, r.whatsapp_status, r.codigo_verificacao, r.created_at,
         case when r.demo then 'demo' else situacao_rep(r.plano, r.vencimento) end,
         r.vencimento, r.valor_mensalidade, r.nota_admin, r.contatado, r.limite_membros, r.demo
  from republicas r
  where is_super_admin()
  order by r.created_at desc
$$;
revoke execute on function admin_listar_republicas() from public, anon;
grant execute on function admin_listar_republicas() to authenticated;

-- resumo: demonstração não entra em receita, assinaturas nem alertas de cobrança
create or replace function admin_resumo() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r jsonb;
begin
  if not is_super_admin() then raise exception 'Sem permissão.'; end if;
  select jsonb_build_object(
    'republicas', (select count(*) from republicas where not demo),
    'ativas', (select count(*) from republicas where ativo and not demo),
    'bloqueadas', (select count(*) from republicas where not ativo and not demo),
    'assinando', (select count(*) from republicas where plano <> 'gratis' and ativo and not demo),
    'gratis', (select count(*) from republicas where plano = 'gratis' and not demo),
    'integrantes', (select count(*) from membros m join republicas x on x.id = m.republica_id where m.ativo and not x.demo),
    'tarefas_ativas', (select count(*) from tarefas t join republicas x on x.id = t.republica_id where t.fim is null and not x.demo),
    'faltas_mes', (select count(*) from republicas rr
                    cross join lateral ocorrencias(rr.id, date_trunc('month', hoje_br())::date, hoje_br()) o
                    where o.status = 'falta' and not rr.demo),
    'justificativas', (select count(*) from execucoes e join republicas x on x.id = e.republica_id where e.status = 'em_analise' and not x.demo),
    'whatsapp_pendentes', (select count(*) from republicas where whatsapp_status <> 'verificado' and not demo),
    'atrasadas', (select count(*) from republicas where situacao_rep(plano, vencimento) = 'atrasada' and not demo),
    'vencendo', (select count(*) from republicas where situacao_rep(plano, vencimento) = 'vence_em_breve' and not demo),
    'sem_vencimento', (select count(*) from republicas where situacao_rep(plano, vencimento) = 'sem_vencimento' and not demo),
    'interessadas', (select count(*) from interessadas where not convertida and not contatado),
    'receita_prevista', coalesce((select sum(coalesce(r2.valor_mensalidade, p.preco_mensal, 0))
                          from republicas r2 join planos p on p.id = r2.plano
                          where r2.ativo and r2.plano <> 'gratis' and not r2.demo), 0),
    'por_cidade', coalesce((select jsonb_agg(jsonb_build_object('cidade', c.nome, 'ativa', c.ativa,
          'republicas', (select count(*) from republicas x where x.cidade = c.nome and not x.demo),
          'integrantes', (select count(*) from membros m join republicas x on x.id = m.republica_id
                           where x.cidade = c.nome and m.ativo and not x.demo)) order by c.nome)
          from cidades c where c.ativa or exists(select 1 from republicas x where x.cidade = c.nome)), '[]'::jsonb)
  ) into r;
  return r;
end $$;
revoke execute on function admin_resumo() from public, anon;
grant execute on function admin_resumo() to authenticated;
