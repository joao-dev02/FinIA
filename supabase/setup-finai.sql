-- FinAI phase 2. Review target project and existing objects before running.
-- New schema only: no DROP, no existing data removal, no user creation.
-- Entire bundle is atomic. Do not rerun on an already migrated project.
begin;

-- SOURCE: 202611090001_foundation.sql
-- Phase 2. Apply only to the reviewed target project after authorization.

create schema if not exists finai_private;
revoke all on schema finai_private from public;
grant usage on schema finai_private to authenticated;

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id),
  name text not null check (length(name) between 1 and 80),
  timezone text not null default 'America/Fortaleza' check (timezone = 'America/Fortaleza'),
  currency text not null default 'BRL' check (currency = 'BRL'),
  created_at timestamptz not null default now(),
  unique(owner_id)
);
create table public.workspace_members (
  workspace_id uuid not null references public.workspaces(id),
  user_id uuid not null references auth.users(id),
  role text not null check (role in ('owner','editor','viewer')),
  primary key(workspace_id,user_id)
);
create index members_user_idx on public.workspace_members(user_id,workspace_id);

create function finai_private.is_member(w uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.workspace_members m where m.workspace_id=w and m.user_id=(select auth.uid()));
$$;
create function finai_private.require_writer(w uuid) returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'unauthorized' using errcode='42501'; end if;
  perform 1 from public.workspaces where id=w for update;
  if not found then raise exception 'workspace_denied' using errcode='42501'; end if;
  perform 1 from public.workspace_members where workspace_id=w and user_id=auth.uid() and role in ('owner','editor') for share;
  if not found then raise exception 'workspace_denied' using errcode='42501'; end if;
end $$;

create table public.accounts (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id),
  name text not null check(length(name) between 1 and 80),
  kind text not null check(kind in ('bank','wallet','cash')),
  archived_at timestamptz, created_at timestamptz not null default now(),
  unique(workspace_id,id)
);
create index accounts_workspace_idx on public.accounts(workspace_id);
create table public.categories (
  id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id),
  name text not null check(length(name) between 1 and 60),
  kind text not null check(kind in ('income','expense')),
  unique(workspace_id,name,kind),unique(workspace_id,id)
);
create table public.financial_events (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id),
  kind text not null check(kind in ('income','expense','transfer','opening','reversal')),
  description text not null check(length(description) between 2 and 120), effective_date date not null,
  reversal_of uuid, created_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
  unique(workspace_id,id),unique(reversal_of),
  foreign key(workspace_id,reversal_of) references public.financial_events(workspace_id,id)
);
create index events_workspace_date_idx on public.financial_events(workspace_id,effective_date desc);
create table public.ledger_entries (
  id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id),
  event_id uuid not null, account_id uuid,
  bucket text not null check(bucket in ('asset','income','expense','equity')),
  amount_cents bigint not null check(amount_cents <> 0 and abs(amount_cents::numeric) <= 1000000000000),
  foreign key(workspace_id,event_id) references public.financial_events(workspace_id,id),
  foreign key(workspace_id,account_id) references public.accounts(workspace_id,id),
  check((bucket='asset')=(account_id is not null))
);
create index ledger_account_idx on public.ledger_entries(workspace_id,account_id);
create index ledger_event_idx on public.ledger_entries(event_id);
create table public.transactions (
  id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id),
  event_id uuid not null unique,account_id uuid not null, category_id uuid not null,
  kind text not null check(kind in ('income','expense')),
  amount_cents bigint not null check(amount_cents between 1 and 1000000000000),
  foreign key(workspace_id,event_id) references public.financial_events(workspace_id,id),
  foreign key(workspace_id,account_id) references public.accounts(workspace_id,id),
  foreign key(workspace_id,category_id) references public.categories(workspace_id,id)
);
create index transactions_workspace_idx on public.transactions(workspace_id);
create table public.transfers (
  id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id),
  event_id uuid not null unique,source_id uuid not null,destination_id uuid not null,
  amount_cents bigint not null check(amount_cents between 1 and 1000000000000),
  check(source_id<>destination_id),
  foreign key(workspace_id,event_id) references public.financial_events(workspace_id,id),
  foreign key(workspace_id,source_id) references public.accounts(workspace_id,id),
  foreign key(workspace_id,destination_id) references public.accounts(workspace_id,id)
);
create index transfers_workspace_idx on public.transfers(workspace_id);
create table public.idempotency_records (
  workspace_id uuid not null references public.workspaces(id),key uuid not null,actor_id uuid not null references auth.users(id),
  payload jsonb not null,response jsonb not null,created_at timestamptz not null default now(),primary key(workspace_id,key)
);
create table public.audit_events (
  id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id),
  actor_id uuid not null references auth.users(id),action text not null,event_id uuid,
  entity_id uuid not null,created_at timestamptz not null default now(),
  foreign key(workspace_id,event_id) references public.financial_events(workspace_id,id)
);
create index audit_workspace_idx on public.audit_events(workspace_id,created_at desc);

create function finai_private.immutable() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'immutable_financial_record'; end $$;
create trigger immutable_events before update or delete on public.financial_events for each row execute function finai_private.immutable();
create trigger immutable_ledger before update or delete on public.ledger_entries for each row execute function finai_private.immutable();
create trigger immutable_transactions before update or delete on public.transactions for each row execute function finai_private.immutable();
create trigger immutable_transfers before update or delete on public.transfers for each row execute function finai_private.immutable();
create trigger immutable_audit before update or delete on public.audit_events for each row execute function finai_private.immutable();
create function finai_private.check_balanced() returns trigger language plpgsql set search_path='' as $$
declare n bigint; total numeric;
begin
  select count(*),coalesce(sum(amount_cents),0) into n,total from public.ledger_entries where event_id=new.event_id;
  if n<2 or total<>0 then raise exception 'unbalanced_event'; end if;
  return null;
end $$;
create constraint trigger balanced_event after insert on public.ledger_entries deferrable initially deferred for each row execute function finai_private.check_balanced();

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.accounts enable row level security;
alter table public.categories enable row level security;
alter table public.financial_events enable row level security;
alter table public.ledger_entries enable row level security;
alter table public.transactions enable row level security;
alter table public.transfers enable row level security;
alter table public.idempotency_records enable row level security;
alter table public.audit_events enable row level security;
create policy read_workspaces on public.workspaces for select to authenticated using(finai_private.is_member(id));
create policy read_members on public.workspace_members for select to authenticated using(finai_private.is_member(workspace_id));
create policy read_accounts on public.accounts for select to authenticated using(finai_private.is_member(workspace_id));
create policy read_categories on public.categories for select to authenticated using(finai_private.is_member(workspace_id));
create policy read_events on public.financial_events for select to authenticated using(finai_private.is_member(workspace_id));
create policy read_ledger on public.ledger_entries for select to authenticated using(finai_private.is_member(workspace_id));
create policy read_transactions on public.transactions for select to authenticated using(finai_private.is_member(workspace_id));
create policy read_transfers on public.transfers for select to authenticated using(finai_private.is_member(workspace_id));
create policy read_audit on public.audit_events for select to authenticated using(finai_private.is_member(workspace_id));
-- Idempotency has no client read policy. Commands expose only their own response.
revoke all on public.workspaces,public.workspace_members,public.accounts,public.categories,public.financial_events,public.ledger_entries,public.transactions,public.transfers,public.idempotency_records,public.audit_events from anon,authenticated;
grant select on public.workspaces,public.workspace_members,public.accounts,public.categories,public.financial_events,public.ledger_entries,public.transactions,public.transfers,public.audit_events to authenticated;
revoke all on all functions in schema finai_private from public;
grant execute on function finai_private.is_member(uuid) to authenticated;

-- SOURCE: 202611090002_commands.sql
create function public.initialize_finai() returns uuid language plpgsql security definer set search_path='' as $$
declare w uuid;
begin
  if auth.uid() is null then raise exception 'unauthorized' using errcode='42501'; end if;
  insert into public.workspaces(owner_id,name) values(auth.uid(),'Meu espaço') on conflict(owner_id) do nothing;
  select id into w from public.workspaces where owner_id=auth.uid();
  insert into public.workspace_members(workspace_id,user_id,role) values(w,auth.uid(),'owner') on conflict do nothing;
  return w;
end $$;

create function public.create_finai_account(p_workspace uuid,p_key uuid,p_name text,p_kind text,p_opening bigint,p_date date) returns jsonb language plpgsql security definer set search_path='' as $$
declare a uuid; e uuid; payload jsonb; prior public.idempotency_records; result jsonb;
begin
  perform finai_private.require_writer(p_workspace);
  if p_key is null or p_date is null or p_date not between date '1900-01-01' and (now() at time zone 'America/Fortaleza')::date or p_name is null or length(trim(p_name)) not between 1 and 80 or p_kind not in ('bank','wallet','cash') or p_kind is null or p_opening is null or abs(p_opening::numeric)>1000000000000 then raise exception 'invalid_account'; end if;
  payload=jsonb_build_object('op','account','name',trim(p_name),'kind',p_kind,'opening',p_opening,'date',p_date);
  select * into prior from public.idempotency_records where workspace_id=p_workspace and key=p_key;
  if found then
    if prior.payload<>payload or prior.actor_id<>auth.uid() then raise exception 'idempotency_conflict'; end if;
    return prior.response;
  end if;
  insert into public.accounts(workspace_id,name,kind) values(p_workspace,trim(p_name),p_kind) returning id into a;
  if p_opening<>0 then
    insert into public.financial_events(workspace_id,kind,description,effective_date,created_by) values(p_workspace,'opening','Saldo inicial',p_date,auth.uid()) returning id into e;
    insert into public.ledger_entries(workspace_id,event_id,account_id,bucket,amount_cents) values(p_workspace,e,a,'asset',p_opening),(p_workspace,e,null,'equity',-p_opening);
  end if;
  insert into public.audit_events(workspace_id,actor_id,action,event_id,entity_id) values(p_workspace,auth.uid(),'account.created',e,a);
  result=jsonb_build_object('accountId',a);
  insert into public.idempotency_records(workspace_id,key,actor_id,payload,response) values(p_workspace,p_key,auth.uid(),payload,result);
  return result;
end $$;

create function public.post_finai_transaction(p_workspace uuid,p_key uuid,p_account uuid,p_kind text,p_amount bigint,p_date date,p_description text,p_category text) returns jsonb language plpgsql security definer set search_path='' as $$
declare e uuid; c uuid; signed_amount bigint; payload jsonb; prior public.idempotency_records; result jsonb;
begin
  perform finai_private.require_writer(p_workspace);
  if p_key is null or p_date is null or p_date not between date '1900-01-01' and (now() at time zone 'America/Fortaleza')::date or p_amount is null or p_amount not between 1 and 1000000000000 or p_kind is null or p_kind not in ('income','expense') or p_description is null or length(trim(p_description)) not between 2 and 120 or p_category is null or length(trim(p_category)) not between 1 and 60 then raise exception 'invalid_transaction'; end if;
  payload=jsonb_build_object('op','transaction','account',p_account,'kind',p_kind,'amount',p_amount,'date',p_date,'description',trim(p_description),'category',trim(p_category));
  select * into prior from public.idempotency_records where workspace_id=p_workspace and key=p_key;
  if found then
    if prior.payload<>payload or prior.actor_id<>auth.uid() then raise exception 'idempotency_conflict'; end if;
    return prior.response;
  end if;
  perform 1 from public.accounts where id=p_account and workspace_id=p_workspace and archived_at is null for update;
  if not found then raise exception 'account_denied' using errcode='42501'; end if;
  insert into public.categories(workspace_id,name,kind) values(p_workspace,trim(p_category),p_kind) on conflict do nothing;
  select id into c from public.categories where workspace_id=p_workspace and name=trim(p_category) and kind=p_kind;
  insert into public.financial_events(workspace_id,kind,description,effective_date,created_by) values(p_workspace,p_kind,trim(p_description),p_date,auth.uid()) returning id into e;
  signed_amount=case when p_kind='income' then p_amount else -p_amount end;
  insert into public.ledger_entries(workspace_id,event_id,account_id,bucket,amount_cents) values(p_workspace,e,p_account,'asset',signed_amount),(p_workspace,e,null,p_kind,-signed_amount);
  insert into public.transactions(workspace_id,event_id,account_id,category_id,kind,amount_cents) values(p_workspace,e,p_account,c,p_kind,p_amount);
  insert into public.audit_events(workspace_id,actor_id,action,event_id,entity_id) values(p_workspace,auth.uid(),'transaction.posted',e,e);
  result=jsonb_build_object('eventId',e);
  insert into public.idempotency_records(workspace_id,key,actor_id,payload,response) values(p_workspace,p_key,auth.uid(),payload,result);
  return result;
end $$;

create function public.transfer_finai(p_workspace uuid,p_key uuid,p_source uuid,p_destination uuid,p_amount bigint,p_date date,p_description text) returns jsonb language plpgsql security definer set search_path='' as $$
declare e uuid; n integer; payload jsonb; prior public.idempotency_records; result jsonb;
begin
  perform finai_private.require_writer(p_workspace);
  if p_key is null or p_date is null or p_date not between date '1900-01-01' and (now() at time zone 'America/Fortaleza')::date or p_source is null or p_destination is null or p_source=p_destination or p_amount is null or p_amount not between 1 and 1000000000000 or p_description is null or length(trim(p_description)) not between 2 and 120 then raise exception 'invalid_transfer'; end if;
  payload=jsonb_build_object('op','transfer','source',p_source,'destination',p_destination,'amount',p_amount,'date',p_date,'description',trim(p_description));
  select * into prior from public.idempotency_records where workspace_id=p_workspace and key=p_key;
  if found then
    if prior.payload<>payload or prior.actor_id<>auth.uid() then raise exception 'idempotency_conflict'; end if;
    return prior.response;
  end if;
  perform 1 from public.accounts where workspace_id=p_workspace and id in (p_source,p_destination) and archived_at is null order by id for update;
  get diagnostics n=row_count;
  if n<>2 then raise exception 'account_denied' using errcode='42501'; end if;
  insert into public.financial_events(workspace_id,kind,description,effective_date,created_by) values(p_workspace,'transfer',trim(p_description),p_date,auth.uid()) returning id into e;
  insert into public.ledger_entries(workspace_id,event_id,account_id,bucket,amount_cents) values(p_workspace,e,p_source,'asset',-p_amount),(p_workspace,e,p_destination,'asset',p_amount);
  insert into public.transfers(workspace_id,event_id,source_id,destination_id,amount_cents) values(p_workspace,e,p_source,p_destination,p_amount);
  insert into public.audit_events(workspace_id,actor_id,action,event_id,entity_id) values(p_workspace,auth.uid(),'transfer.posted',e,e);
  result=jsonb_build_object('eventId',e);
  insert into public.idempotency_records(workspace_id,key,actor_id,payload,response) values(p_workspace,p_key,auth.uid(),payload,result);
  return result;
end $$;

create function public.reverse_finai(p_workspace uuid,p_key uuid,p_event uuid,p_reason text) returns jsonb language plpgsql security definer set search_path='' as $$
declare original public.financial_events; e uuid; payload jsonb; prior public.idempotency_records; result jsonb;
begin
  perform finai_private.require_writer(p_workspace);
  if p_key is null or p_reason is null or length(trim(p_reason)) not between 2 and 120 then raise exception 'invalid_reversal'; end if;
  payload=jsonb_build_object('op','reversal','event',p_event,'reason',trim(p_reason));
  select * into prior from public.idempotency_records where workspace_id=p_workspace and key=p_key;
  if found then
    if prior.payload<>payload or prior.actor_id<>auth.uid() then raise exception 'idempotency_conflict'; end if;
    return prior.response;
  end if;
  select * into original from public.financial_events where workspace_id=p_workspace and id=p_event for update;
  if not found or original.kind in ('opening','reversal') then raise exception 'invalid_reversal'; end if;
  if exists(select 1 from public.ledger_entries l join public.accounts a on a.id=l.account_id and a.workspace_id=l.workspace_id where l.event_id=p_event and a.archived_at is not null) then raise exception 'reversal_archived_account'; end if;
  if exists(select 1 from public.financial_events where reversal_of=p_event) then raise exception 'already_reversed'; end if;
  insert into public.financial_events(workspace_id,kind,description,effective_date,reversal_of,created_by) values(p_workspace,'reversal',trim(p_reason),(now() at time zone 'America/Fortaleza')::date,p_event,auth.uid()) returning id into e;
  insert into public.ledger_entries(workspace_id,event_id,account_id,bucket,amount_cents) select workspace_id,e,account_id,bucket,-amount_cents from public.ledger_entries where workspace_id=p_workspace and event_id=p_event;
  insert into public.audit_events(workspace_id,actor_id,action,event_id,entity_id) values(p_workspace,auth.uid(),'event.reversed',e,p_event);
  result=jsonb_build_object('eventId',e);
  insert into public.idempotency_records(workspace_id,key,actor_id,payload,response) values(p_workspace,p_key,auth.uid(),payload,result);
  return result;
end $$;

create function public.archive_finai_account(p_workspace uuid,p_account uuid) returns void language plpgsql security definer set search_path='' as $$
begin
  perform finai_private.require_writer(p_workspace);
  perform 1 from public.accounts where workspace_id=p_workspace and id=p_account for update;
  if not found then raise exception 'account_denied' using errcode='42501'; end if;
  if exists(select 1 from public.ledger_entries where workspace_id=p_workspace and account_id=p_account group by account_id having sum(amount_cents)<>0) then raise exception 'nonzero_balance'; end if;
  update public.accounts set archived_at=now() where workspace_id=p_workspace and id=p_account and archived_at is null;
  if found then insert into public.audit_events(workspace_id,actor_id,action,entity_id) values(p_workspace,auth.uid(),'account.archived',p_account); end if;
end $$;

-- All commands require an authenticated caller; no direct table mutations granted.
revoke all on function public.initialize_finai() from public,anon;
revoke all on function public.create_finai_account(uuid,uuid,text,text,bigint,date) from public,anon;
revoke all on function public.post_finai_transaction(uuid,uuid,uuid,text,bigint,date,text,text) from public,anon;
revoke all on function public.transfer_finai(uuid,uuid,uuid,uuid,bigint,date,text) from public,anon;
revoke all on function public.reverse_finai(uuid,uuid,uuid,text) from public,anon;
revoke all on function public.archive_finai_account(uuid,uuid) from public,anon;
grant execute on function public.initialize_finai(),public.create_finai_account(uuid,uuid,text,text,bigint,date),public.post_finai_transaction(uuid,uuid,uuid,text,bigint,date,text,text),public.transfer_finai(uuid,uuid,uuid,uuid,bigint,date,text),public.reverse_finai(uuid,uuid,uuid,text),public.archive_finai_account(uuid,uuid) to authenticated;

-- SOURCE: 202611090003_snapshot.sql
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
