-- Relatórios (só líder): registro de atividade e resumo para a reunião mensal.

create or replace function relatorio_atividades(p_rep uuid, p_de date, p_ate date)
returns table(id bigint, quando timestamptz, quem text, acao text, detalhe jsonb)
language sql stable security definer set search_path = public as $$
  select a.id, a.created_at, coalesce(p.nome, 'Sistema'), a.acao, a.detalhe
  from atividades a left join profiles p on p.id = a.ator_id
  where a.republica_id = p_rep
    and is_lider(p_rep) and recurso_ok(p_rep, 'relatorios')
    and (a.created_at at time zone 'America/Sao_Paulo')::date between p_de and p_ate
  order by a.created_at desc
  limit 300
$$;

create or replace function resumo_mensal(p_rep uuid, p_mes date)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  m0 date := date_trunc('month', p_mes)::date;
  m1 date := (date_trunc('month', p_mes) + interval '1 month - 1 day')::date;
  r jsonb := '{}'::jsonb;
  v numeric; n int;
begin
  if not is_lider(p_rep) or not recurso_ok(p_rep, 'relatorios') then
    raise exception 'Os relatórios são do líder e dependem do plano da república.';
  end if;

  select count(*) into n from membros where republica_id = p_rep and ativo;
  r := r || jsonb_build_object('integrantes', n);

  if tem_recurso(p_rep, 'escala') then
    r := r || jsonb_build_object('tarefas', (
      select jsonb_build_object(
        'feitas', count(*) filter (where status = 'feita'),
        'faltas', count(*) filter (where status = 'falta'),
        'justificadas', count(*) filter (where status = 'justificada'),
        'em_analise', count(*) filter (where status = 'em_analise'))
      from ocorrencias(p_rep, m0, least(m1, hoje_br()))));
    r := r || jsonb_build_object('por_integrante', coalesce((
      select jsonb_agg(jsonb_build_object('nome', p.nome, 'feitas', x.feitas, 'faltas', x.faltas, 'multa', coalesce(mu.multa, 0)) order by x.faltas desc, p.nome)
      from (select membro_id, count(*) filter (where status = 'feita') feitas, count(*) filter (where status = 'falta') faltas
            from ocorrencias(p_rep, m0, least(m1, hoje_br())) group by membro_id) x
      join membros mb on mb.id = x.membro_id join profiles p on p.id = mb.user_id
      left join (select membro_id, sum(valor) multa from multas_do_mes(p_rep, m0) group by membro_id) mu on mu.membro_id = x.membro_id
    ), '[]'::jsonb));
    if tem_recurso(p_rep, 'multas') then
      select coalesce(sum(valor), 0) into v from multas_do_mes(p_rep, m0);
      r := r || jsonb_build_object('multas_total', v);
    end if;
  end if;

  if tem_recurso(p_rep, 'financas') then
    r := r || jsonb_build_object('financas', jsonb_build_object(
      'receitas', coalesce((select sum(valor) from lancamentos where republica_id = p_rep and tipo = 'receita' and data between m0 and m1), 0),
      'despesas', coalesce((select sum(valor) from lancamentos where republica_id = p_rep and tipo = 'despesa' and data between m0 and m1), 0),
      'saldo_total', coalesce((select sum(saldo) from saldos_contas(p_rep)), 0),
      'cobrancas_abertas', (select count(*) from cobranca_itens i where i.republica_id = p_rep and not i.pago),
      'valor_em_aberto', coalesce((select sum(valor) from cobranca_itens i where i.republica_id = p_rep and not i.pago), 0),
      'inadimplentes', coalesce((select jsonb_agg(jsonb_build_object('nome', q.nome, 'valor', q.valor) order by q.valor desc)
         from (select p.nome, sum(i.valor) valor from cobranca_itens i join cobrancas c on c.id = i.cobranca_id
               join membros mb on mb.id = i.membro_id join profiles p on p.id = mb.user_id
               where i.republica_id = p_rep and not i.pago and c.vencimento is not null and c.vencimento < hoje_br()
               group by p.nome) q), '[]'::jsonb)));
  end if;

  if tem_recurso(p_rep, 'ingressos') then
    r := r || jsonb_build_object('festas', coalesce((
      select jsonb_agg(jsonb_build_object('titulo', f.titulo, 'data', f.data,
         'vendidos', (select count(*) from ingressos i where i.festa_id = f.id and i.status in ('pago','usado')),
         'entradas', (select count(*) from ingressos i where i.festa_id = f.id and i.status = 'usado'),
         'arrecadado', coalesce((select sum(i.valor) from ingressos i where i.festa_id = f.id and i.status in ('pago','usado')), 0)) order by f.data)
      from festas f where f.republica_id = p_rep and f.data between m0 and m1), '[]'::jsonb));
  elsif tem_recurso(p_rep, 'calendario') then
    r := r || jsonb_build_object('festas', coalesce((
      select jsonb_agg(jsonb_build_object('titulo', f.titulo, 'data', f.data, 'vendidos', 0, 'entradas', 0, 'arrecadado', 0) order by f.data)
      from festas f where f.republica_id = p_rep and f.data between m0 and m1), '[]'::jsonb));
  end if;

  return r;
end $$;

revoke execute on function relatorio_atividades(uuid,date,date), resumo_mensal(uuid,date) from public, anon;
grant execute on function relatorio_atividades(uuid,date,date), resumo_mensal(uuid,date) to authenticated;
