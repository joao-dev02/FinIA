-- Phase 2. Apply only to the reviewed target project after authorization.
begin;
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
commit;
