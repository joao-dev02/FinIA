begin;
create function public.read_finai_goal_snapshot(p_workspace uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 with base as(select public.read_finai_credit_snapshot(p_workspace) as j)
 select case when j is null then null else j||jsonb_build_object(
 'workspaces',coalesce((select jsonb_agg(jsonb_build_object('id',w.id,'name',w.name) order by w.name,w.id) from public.workspaces w where finai_private.is_member(w.id)),'[]'::jsonb),
 'accounts',coalesce((select jsonb_agg(a.value||jsonb_build_object('reserved',coalesce((select sum(g.amount_cents) from public.goal_allocations g where g.workspace_id=p_workspace and g.account_id=(a.value->>'id')::uuid),0)::text)) from jsonb_array_elements(j->'accounts') a),'[]'::jsonb),
 'transactions',coalesce((select jsonb_agg(t.value||jsonb_build_object('expenseBehavior',coalesce((select e.behavior from public.expense_labels e where e.workspace_id=p_workspace and e.event_id=(t.value->>'eventId')::uuid),case when exists(select 1 from public.bills b where b.workspace_id=p_workspace and b.settlement_event_id=(t.value->>'eventId')::uuid and b.rule_id is not null) then 'fixed' else 'unspecified' end))) from jsonb_array_elements(j->'transactions') t),'[]'::jsonb),
 'goals',jsonb_build_object('ready',true,
 'goals',coalesce((select jsonb_agg(jsonb_build_object('id',g.id,'name',g.name,'target',g.target_cents::text,'deadline',g.deadline,'reserved',coalesce((select sum(a.amount_cents) from public.goal_allocations a where a.goal_id=g.id),0)::text,'version',g.version,'archived',g.archived_at is not null) order by g.deadline,g.id) from public.financial_goals g where g.workspace_id=p_workspace),'[]'::jsonb),
 'allocations',coalesce((select jsonb_agg(jsonb_build_object('goalId',a.goal_id,'accountId',a.account_id,'reserved',a.reserved::text)) from (select goal_id,account_id,sum(amount_cents) as reserved from public.goal_allocations where workspace_id=p_workspace group by goal_id,account_id having sum(amount_cents)<>0) a),'[]'::jsonb),
 'history',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'goalId',a.goal_id,'accountId',a.account_id,'amount',a.amount_cents::text,'date',(a.created_at at time zone 'America/Fortaleza')::date) order by a.created_at desc,a.id) from public.goal_allocations a where a.workspace_id=p_workspace),'[]'::jsonb)
 )) end from base;
$$;
revoke all on function public.read_finai_goal_snapshot(uuid) from public,anon;
grant execute on function public.read_finai_goal_snapshot(uuid) to authenticated;
commit;
