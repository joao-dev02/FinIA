begin;
-- One SQL statement: balances, transactions and reversals share one MVCC snapshot.
create function public.read_finai_snapshot(p_workspace uuid) returns jsonb language sql stable security invoker set search_path='' as $$
  select jsonb_build_object(
    'name',w.name,
    'accounts',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'name',a.name,'archived',a.archived_at is not null,'balance',coalesce((select sum(l.amount_cents) from public.ledger_entries l where l.workspace_id=p_workspace and l.account_id=a.id),0)::text) order by a.created_at,a.id) from public.accounts a where a.workspace_id=p_workspace),'[]'::jsonb),
    'transactions',coalesce((select jsonb_agg(jsonb_build_object('eventId',e.id,'description',e.description,'amount',t.amount_cents::text,'kind',t.kind,'date',e.effective_date,'category',c.name,'accountId',t.account_id,'reversed',exists(select 1 from public.financial_events r where r.workspace_id=p_workspace and r.reversal_of=e.id)) order by e.effective_date desc,e.created_at desc,e.id) from public.transactions t join public.financial_events e on e.workspace_id=t.workspace_id and e.id=t.event_id join public.categories c on c.workspace_id=t.workspace_id and c.id=t.category_id where t.workspace_id=p_workspace),'[]'::jsonb),
    'events',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'kind',e.kind,'amount',coalesce((select max(abs(l.amount_cents::numeric)) from public.ledger_entries l where l.workspace_id=p_workspace and l.event_id=e.id),0)::text,'description',e.description,'date',e.effective_date,'reversed',exists(select 1 from public.financial_events r where r.workspace_id=p_workspace and r.reversal_of=e.id)) order by e.created_at desc,e.id) from public.financial_events e where e.workspace_id=p_workspace),'[]'::jsonb)
  ) from public.workspaces w where w.id=p_workspace and finai_private.is_member(p_workspace);
$$;
revoke all on function public.read_finai_snapshot(uuid) from public,anon;
grant execute on function public.read_finai_snapshot(uuid) to authenticated;
commit;
