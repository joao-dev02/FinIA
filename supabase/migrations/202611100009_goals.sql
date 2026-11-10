begin;
alter table public.audit_events add column details jsonb not null default '{}'::jsonb;
create table public.financial_goals (
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id),name text not null check(length(name) between 1 and 80),
 target_cents bigint not null check(target_cents between 1 and 1000000000000),deadline date not null check(deadline between date '1900-01-01' and date '2100-12-31'),version integer not null default 1,archived_at timestamptz,unique(workspace_id,id)
);
create table public.goal_allocations (
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id),goal_id uuid not null,account_id uuid not null,
 amount_cents bigint not null check(amount_cents<>0 and abs(amount_cents::numeric)<=1000000000000),created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),
 foreign key(workspace_id,goal_id) references public.financial_goals(workspace_id,id),foreign key(workspace_id,account_id) references public.accounts(workspace_id,id)
);
create index goal_allocations_account_idx on public.goal_allocations(workspace_id,account_id);
create index goal_allocations_goal_idx on public.goal_allocations(workspace_id,goal_id);
create table public.expense_labels (
 workspace_id uuid not null references public.workspaces(id),event_id uuid primary key,behavior text not null check(behavior in ('fixed','variable','unspecified')),
 foreign key(workspace_id,event_id) references public.financial_events(workspace_id,id)
);
alter table public.financial_goals enable row level security;
alter table public.goal_allocations enable row level security;
alter table public.expense_labels enable row level security;
create policy read_goals on public.financial_goals for select to authenticated using(finai_private.is_member(workspace_id));
create policy read_allocations on public.goal_allocations for select to authenticated using(finai_private.is_member(workspace_id));
create policy read_labels on public.expense_labels for select to authenticated using(finai_private.is_member(workspace_id));
revoke all on public.financial_goals,public.goal_allocations,public.expense_labels from anon,authenticated;
grant select on public.financial_goals,public.goal_allocations,public.expense_labels to authenticated;
create trigger immutable_goal_allocations before update or delete on public.goal_allocations for each row execute function finai_private.immutable();

create function finai_private.check_reserved_funds() returns trigger language plpgsql security definer set search_path='' as $$
declare reserved numeric;balance numeric;
begin
 if new.account_id is null then return null;end if;
 select coalesce(sum(amount_cents),0) into reserved from public.goal_allocations where workspace_id=new.workspace_id and account_id=new.account_id;
 select coalesce(sum(amount_cents),0) into balance from public.ledger_entries where workspace_id=new.workspace_id and account_id=new.account_id;
 if reserved<0 or (reserved>0 and balance<reserved) then raise exception 'funds_reserved';end if;
 if tg_table_name='goal_allocations' then
  if exists(select 1 from public.goal_allocations where goal_id=new.goal_id group by goal_id,account_id having sum(amount_cents)<0) then raise exception 'release_exceeds_reserved';end if;
  if (select coalesce(sum(amount_cents),0) from public.goal_allocations where goal_id=new.goal_id)>(select target_cents from public.financial_goals where id=new.goal_id) then raise exception 'goal_target_exceeded';end if;
 end if;
 return null;
end $$;
create constraint trigger check_ledger_reserves after insert on public.ledger_entries deferrable initially deferred for each row execute function finai_private.check_reserved_funds();
create constraint trigger check_goal_reserves after insert on public.goal_allocations deferrable initially deferred for each row execute function finai_private.check_reserved_funds();
revoke all on function finai_private.check_reserved_funds() from public;

create function public.create_finai_goal(p_workspace uuid,p_key uuid,p_name text,p_target bigint,p_deadline date) returns jsonb language plpgsql security definer set search_path='' as $$
declare p jsonb;r jsonb;g uuid;
begin
 perform finai_private.require_writer(p_workspace);
 p=jsonb_build_object('op','goal','name',trim(p_name),'target',p_target,'deadline',p_deadline);r=finai_private.prior_result(p_workspace,p_key,p);if r is not null then return r;end if;
 if p_name is null or length(trim(p_name)) not between 1 and 80 or p_target is null or p_target not between 1 and 1000000000000 or p_deadline is null or p_deadline not between (now() at time zone 'America/Fortaleza')::date and date '2100-12-31' then raise exception 'invalid_goal';end if;
 insert into public.financial_goals(workspace_id,name,target_cents,deadline) values(p_workspace,trim(p_name),p_target,p_deadline) returning id into g;
 insert into public.audit_events(workspace_id,actor_id,action,entity_id,details) values(p_workspace,auth.uid(),'goal.created',g,p);
 return finai_private.remember(p_workspace,p_key,p,jsonb_build_object('goalId',g));
end $$;
create function public.allocate_finai_goal(p_workspace uuid,p_key uuid,p_goal uuid,p_account uuid,p_amount bigint,p_direction text) returns jsonb language plpgsql security definer set search_path='' as $$
declare p jsonb;r jsonb;reserved numeric;g public.financial_goals;amount bigint;
begin
 perform finai_private.require_writer(p_workspace);
 p=jsonb_build_object('op',p_direction,'goal',p_goal,'account',p_account,'amount',p_amount);r=finai_private.prior_result(p_workspace,p_key,p);if r is not null then return r;end if;
 if p_direction is null or p_direction not in ('reserve','release') or p_amount is null or p_amount not between 1 and 1000000000000 then raise exception 'invalid_allocation';end if;
 select * into g from public.financial_goals where workspace_id=p_workspace and id=p_goal and archived_at is null for update;if not found then raise exception 'goal_denied' using errcode='42501';end if;
 perform 1 from public.accounts where workspace_id=p_workspace and id=p_account and archived_at is null for update;if not found then raise exception 'account_denied' using errcode='42501';end if;
 if p_direction='release' then
  select coalesce(sum(amount_cents),0) into reserved from public.goal_allocations where goal_id=p_goal and account_id=p_account;
  if p_amount>reserved then raise exception 'release_exceeds_reserved';end if;
 end if;
 amount=case when p_direction='reserve' then p_amount else -p_amount end;
 insert into public.goal_allocations(workspace_id,goal_id,account_id,amount_cents,created_by) values(p_workspace,p_goal,p_account,amount,auth.uid());
 insert into public.audit_events(workspace_id,actor_id,action,entity_id,details) values(p_workspace,auth.uid(),'goal.'||p_direction,p_goal,p);
 return finai_private.remember(p_workspace,p_key,p,jsonb_build_object('goalId',p_goal));
end $$;
create function public.manage_finai_goal(p_workspace uuid,p_key uuid,p_goal uuid,p_version integer,p_name text,p_target bigint,p_deadline date,p_archive boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare p jsonb;r jsonb;g public.financial_goals;reserved numeric;
begin
 perform finai_private.require_writer(p_workspace);
 p=jsonb_build_object('op','manage-goal','goal',p_goal,'version',p_version,'name',trim(p_name),'target',p_target,'deadline',p_deadline,'archive',p_archive);r=finai_private.prior_result(p_workspace,p_key,p);if r is not null then return r;end if;
 select * into g from public.financial_goals where workspace_id=p_workspace and id=p_goal and archived_at is null for update;if not found then raise exception 'goal_denied' using errcode='42501';end if;
 if p_version is null or p_version<>g.version then raise exception 'goal_version_conflict';end if;
 select coalesce(sum(amount_cents),0) into reserved from public.goal_allocations where goal_id=p_goal;
 if p_archive then
  if reserved<>0 then raise exception 'goal_still_reserved';end if;
  update public.financial_goals set archived_at=now(),version=version+1 where id=p_goal;
 else
  if p_archive is null or p_name is null or length(trim(p_name)) not between 1 and 80 or p_target is null or p_target not between 1 and 1000000000000 or p_deadline is null or p_deadline not between (now() at time zone 'America/Fortaleza')::date and date '2100-12-31' then raise exception 'invalid_goal';end if;
  if p_target<reserved then raise exception 'goal_target_below_reserved';end if;
  update public.financial_goals set name=trim(p_name),target_cents=p_target,deadline=p_deadline,version=version+1 where id=p_goal;
 end if;
 insert into public.audit_events(workspace_id,actor_id,action,entity_id,details) values(p_workspace,auth.uid(),'goal.updated',p_goal,jsonb_build_object('before',to_jsonb(g),'after',p));
 return finai_private.remember(p_workspace,p_key,p,jsonb_build_object('goalId',p_goal));
end $$;
create function public.classify_finai_expense(p_workspace uuid,p_key uuid,p_event uuid,p_behavior text) returns jsonb language plpgsql security definer set search_path='' as $$
declare p jsonb;r jsonb;previous text;
begin
 perform finai_private.require_writer(p_workspace);
 p=jsonb_build_object('op','classify-expense','event',p_event,'behavior',p_behavior);r=finai_private.prior_result(p_workspace,p_key,p);if r is not null then return r;end if;
 if p_behavior is null or p_behavior not in ('fixed','variable','unspecified') then raise exception 'invalid_behavior';end if;
 perform 1 from public.financial_events where workspace_id=p_workspace and id=p_event and kind in ('expense','card_purchase');if not found then raise exception 'expense_denied' using errcode='42501';end if;
 select behavior into previous from public.expense_labels where event_id=p_event;
 insert into public.expense_labels(workspace_id,event_id,behavior) values(p_workspace,p_event,p_behavior) on conflict(event_id) do update set behavior=excluded.behavior;
 insert into public.audit_events(workspace_id,actor_id,action,entity_id,details) values(p_workspace,auth.uid(),'expense.classified',p_event,jsonb_build_object('before',previous,'after',p_behavior));
 return finai_private.remember(p_workspace,p_key,p,jsonb_build_object('eventId',p_event));
end $$;
revoke all on function public.create_finai_goal(uuid,uuid,text,bigint,date),public.allocate_finai_goal(uuid,uuid,uuid,uuid,bigint,text),public.manage_finai_goal(uuid,uuid,uuid,integer,text,bigint,date,boolean),public.classify_finai_expense(uuid,uuid,uuid,text) from public,anon;
grant execute on function public.create_finai_goal(uuid,uuid,text,bigint,date),public.allocate_finai_goal(uuid,uuid,uuid,uuid,bigint,text),public.manage_finai_goal(uuid,uuid,uuid,integer,text,bigint,date,boolean),public.classify_finai_expense(uuid,uuid,uuid,text) to authenticated;
commit;
