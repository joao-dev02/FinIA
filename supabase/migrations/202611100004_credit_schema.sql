begin;
alter table public.financial_events drop constraint financial_events_kind_check;
alter table public.financial_events add constraint financial_events_kind_check check(kind in ('income','expense','transfer','opening','reversal','card_purchase','card_payment'));
alter table public.ledger_entries drop constraint ledger_entries_bucket_check;
alter table public.ledger_entries add constraint ledger_entries_bucket_check check(bucket in ('asset','income','expense','equity','liability'));
create table public.cards (
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id),
 name text not null check(length(name) between 1 and 80),limit_cents bigint not null check(limit_cents between 1 and 1000000000000),
 closing_day integer not null check(closing_day between 1 and 31),due_day integer not null check(due_day between 1 and 31),created_at timestamptz not null default now(),unique(workspace_id,id)
);
alter table public.ledger_entries add column card_id uuid;
alter table public.ledger_entries add constraint ledger_card_fk foreign key(workspace_id,card_id) references public.cards(workspace_id,id);
alter table public.ledger_entries add constraint ledger_card_bucket check((bucket='liability')=(card_id is not null));
create index ledger_card_idx on public.ledger_entries(workspace_id,card_id);
create table public.card_purchases (
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id),card_id uuid not null,event_id uuid not null unique,
 amount_cents bigint not null check(amount_cents between 1 and 1000000000000),installment_count integer not null check(installment_count between 1 and 120),category text not null check(length(category) between 1 and 60),
 foreign key(workspace_id,card_id) references public.cards(workspace_id,id),foreign key(workspace_id,event_id) references public.financial_events(workspace_id,id),unique(workspace_id,id)
);
create table public.card_statements (
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id),card_id uuid not null,
 closes_on date not null,due_on date not null check(due_on>closes_on),closed_at timestamptz,
 foreign key(workspace_id,card_id) references public.cards(workspace_id,id),unique(card_id,closes_on),unique(workspace_id,id)
);
create table public.card_installments (
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id),purchase_id uuid not null,statement_id uuid not null,
 number integer not null check(number between 1 and 120),amount_cents bigint not null check(amount_cents between 1 and 1000000000000),
 foreign key(workspace_id,purchase_id) references public.card_purchases(workspace_id,id),foreign key(workspace_id,statement_id) references public.card_statements(workspace_id,id),unique(purchase_id,number)
);
create index installments_statement_idx on public.card_installments(workspace_id,statement_id);
create table public.statement_payments (
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id),statement_id uuid not null,event_id uuid not null unique,
 amount_cents bigint not null check(amount_cents between 1 and 1000000000000),
 foreign key(workspace_id,statement_id) references public.card_statements(workspace_id,id),foreign key(workspace_id,event_id) references public.financial_events(workspace_id,id)
);
create index statement_payments_idx on public.statement_payments(workspace_id,statement_id);
create table public.recurring_rules (
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id),description text not null check(length(description) between 2 and 120),
 kind text not null check(kind in ('income','expense')),amount_cents bigint not null check(amount_cents between 1 and 1000000000000),category text not null check(length(category) between 1 and 60),
 cadence_months integer not null check(cadence_months in (1,12)),anchor_day integer not null check(anchor_day between 1 and 31),next_on date not null check(next_on between date '1900-01-01' and date '2100-12-31'),active boolean not null default true,created_by uuid not null references auth.users(id),unique(workspace_id,id)
);
create table public.bills (
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id),rule_id uuid,
 description text not null check(length(description) between 2 and 120),kind text not null check(kind in ('income','expense')),amount_cents bigint not null check(amount_cents between 1 and 1000000000000),category text not null check(length(category) between 1 and 60),
 due_on date not null check(due_on between date '1900-01-01' and date '2100-12-31'),competence date,status text not null default 'pending' check(status in ('pending','paid','cancelled')),settlement_event_id uuid unique,
 foreign key(workspace_id,rule_id) references public.recurring_rules(workspace_id,id),foreign key(workspace_id,settlement_event_id) references public.financial_events(workspace_id,id),unique(rule_id,competence),check((status='paid')=(settlement_event_id is not null))
);
create index bills_workspace_due_idx on public.bills(workspace_id,due_on);
create function finai_private.active_installment(i_purchase uuid) returns boolean language sql stable security invoker set search_path='' as $$
 select not exists(select 1 from public.card_purchases p join public.financial_events r on r.workspace_id=p.workspace_id and r.reversal_of=p.event_id where p.id=i_purchase);
$$;
revoke all on function finai_private.active_installment(uuid) from public;
grant execute on function finai_private.active_installment(uuid) to authenticated;
create function finai_private.month_day(p_month date,p_day integer) returns date language sql immutable set search_path='' as $$
 select (date_trunc('month',p_month)::date + (least(p_day,extract(day from (date_trunc('month',p_month)+interval '1 month -1 day')))::integer-1));
$$;
-- Generic reversal cannot bypass card schedules/payment allocations.
create function finai_private.guard_reversal() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.kind='reversal' and exists(select 1 from public.financial_events e where e.id=new.reversal_of and e.kind in ('card_purchase','card_payment')) then raise exception 'card_reversal_not_supported'; end if;
 if new.kind='reversal' then update public.bills set status='pending',settlement_event_id=null where workspace_id=new.workspace_id and settlement_event_id=new.reversal_of; end if;
 return new;
end $$;
create trigger guard_credit_reversal before insert on public.financial_events for each row execute function finai_private.guard_reversal();
create trigger immutable_purchases before update or delete on public.card_purchases for each row execute function finai_private.immutable();
create trigger immutable_statement_payments before update or delete on public.statement_payments for each row execute function finai_private.immutable();
alter table public.cards enable row level security;
alter table public.card_purchases enable row level security;
alter table public.card_statements enable row level security;
alter table public.card_installments enable row level security;
alter table public.statement_payments enable row level security;
alter table public.recurring_rules enable row level security;
alter table public.bills enable row level security;
create policy read_cards on public.cards for select to authenticated using(finai_private.is_member(workspace_id));
create policy read_purchases on public.card_purchases for select to authenticated using(finai_private.is_member(workspace_id));
create policy read_statements on public.card_statements for select to authenticated using(finai_private.is_member(workspace_id));
create policy read_installments on public.card_installments for select to authenticated using(finai_private.is_member(workspace_id));
create policy read_payments on public.statement_payments for select to authenticated using(finai_private.is_member(workspace_id));
create policy read_rules on public.recurring_rules for select to authenticated using(finai_private.is_member(workspace_id));
create policy read_bills on public.bills for select to authenticated using(finai_private.is_member(workspace_id));
revoke all on public.cards,public.card_purchases,public.card_statements,public.card_installments,public.statement_payments,public.recurring_rules,public.bills from anon,authenticated;
grant select on public.cards,public.card_purchases,public.card_statements,public.card_installments,public.statement_payments,public.recurring_rules,public.bills to authenticated;
revoke all on function finai_private.month_day(date,integer),finai_private.guard_reversal() from public;
commit;
