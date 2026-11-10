-- FinAI PHASE 3 INCREMENTAL UPDATE. Requires completed phase 2.
-- Review target project and take a backup first. Do NOT rerun setup-finai.sql.
-- No existing account or transaction is deleted. New constraints support card liabilities.
-- All five migrations are applied in a single transaction; run once only.
begin;

-- SOURCE: 202611100004_credit_schema.sql
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

-- SOURCE: 202611100005_credit_commands.sql
create function finai_private.prior_result(w uuid,k uuid,p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.idempotency_records;
begin
 if k is null then raise exception 'invalid_key'; end if;
 select * into r from public.idempotency_records where workspace_id=w and key=k;
 if not found then return null; end if;
 if r.payload<>p or r.actor_id<>auth.uid() then raise exception 'idempotency_conflict'; end if;
 return r.response;
end $$;
create function finai_private.remember(w uuid,k uuid,p jsonb,r jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
begin insert into public.idempotency_records(workspace_id,key,actor_id,payload,response) values(w,k,auth.uid(),p,r);return r;end $$;

create function public.create_finai_card(p_workspace uuid,p_key uuid,p_name text,p_limit bigint,p_closing integer,p_due integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare p jsonb;r jsonb;c uuid;
begin
 perform finai_private.require_writer(p_workspace);
 p=jsonb_build_object('op','card','name',trim(p_name),'limit',p_limit,'closing',p_closing,'due',p_due);r=finai_private.prior_result(p_workspace,p_key,p);if r is not null then return r;end if;
 if p_name is null or length(trim(p_name)) not between 1 and 80 or p_limit is null or p_limit not between 1 and 1000000000000 or p_closing is null or p_closing not between 1 and 31 or p_due is null or p_due not between 1 and 31 then raise exception 'invalid_card';end if;
 insert into public.cards(workspace_id,name,limit_cents,closing_day,due_day) values(p_workspace,trim(p_name),p_limit,p_closing,p_due) returning id into c;
 insert into public.audit_events(workspace_id,actor_id,action,entity_id) values(p_workspace,auth.uid(),'card.created',c);
 return finai_private.remember(p_workspace,p_key,p,jsonb_build_object('cardId',c));
end $$;

create function public.purchase_finai_card(p_workspace uuid,p_key uuid,p_card uuid,p_amount bigint,p_count integer,p_date date,p_description text,p_category text) returns jsonb language plpgsql security definer set search_path='' as $$
declare p jsonb;r jsonb;c public.cards;used numeric;e uuid;purchase uuid;s uuid;m date;closes date;due date;n integer;part bigint;
begin
 perform finai_private.require_writer(p_workspace);
 p=jsonb_build_object('op','purchase','card',p_card,'amount',p_amount,'count',p_count,'date',p_date,'description',trim(p_description),'category',trim(p_category));r=finai_private.prior_result(p_workspace,p_key,p);if r is not null then return r;end if;
 if p_amount is null or p_amount not between 1 and 1000000000000 or p_count is null or p_count not between 1 and 120 or p_count>p_amount or p_date is null or p_date not between date '1900-01-01' and (now() at time zone 'America/Fortaleza')::date or p_description is null or length(trim(p_description)) not between 2 and 120 or p_category is null or length(trim(p_category)) not between 1 and 60 then raise exception 'invalid_purchase';end if;
 select * into c from public.cards where workspace_id=p_workspace and id=p_card for update;if not found then raise exception 'card_denied' using errcode='42501';end if;
 select -coalesce(sum(amount_cents),0) into used from public.ledger_entries where workspace_id=p_workspace and card_id=p_card;
 if used+p_amount>c.limit_cents then raise exception 'card_limit_exceeded';end if;
 insert into public.financial_events(workspace_id,kind,description,effective_date,created_by) values(p_workspace,'card_purchase',trim(p_description),p_date,auth.uid()) returning id into e;
 insert into public.ledger_entries(workspace_id,event_id,bucket,amount_cents,card_id) values(p_workspace,e,'expense',p_amount,null),(p_workspace,e,'liability',-p_amount,p_card);
 insert into public.card_purchases(workspace_id,card_id,event_id,amount_cents,installment_count,category) values(p_workspace,p_card,e,p_amount,p_count,trim(p_category)) returning id into purchase;
 m=date_trunc('month',p_date)::date;
 if p_date>finai_private.month_day(m,c.closing_day) then m=(m+interval '1 month')::date;end if;
 for n in 1..p_count loop
  closes=finai_private.month_day(m,c.closing_day);due=finai_private.month_day(m,c.due_day);
  if due<=closes then due=finai_private.month_day((m+interval '1 month')::date,c.due_day);end if;
  insert into public.card_statements(workspace_id,card_id,closes_on,due_on) values(p_workspace,p_card,closes,due) on conflict(card_id,closes_on) do nothing;
  select id into s from public.card_statements where card_id=p_card and closes_on=closes and closed_at is null for update;
  if not found then raise exception 'statement_closed';end if;
  part=p_amount/p_count+case when n<=p_amount%p_count then 1 else 0 end;
  insert into public.card_installments(workspace_id,purchase_id,statement_id,number,amount_cents) values(p_workspace,purchase,s,n,part);
  m=(m+interval '1 month')::date;
 end loop;
 insert into public.audit_events(workspace_id,actor_id,action,event_id,entity_id) values(p_workspace,auth.uid(),'card.purchase',e,purchase);
 return finai_private.remember(p_workspace,p_key,p,jsonb_build_object('eventId',e));
end $$;

create function public.close_finai_statement(p_workspace uuid,p_key uuid,p_statement uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare p jsonb;r jsonb;s public.card_statements;
begin
 perform finai_private.require_writer(p_workspace);
 p=jsonb_build_object('op','close-statement','statement',p_statement);r=finai_private.prior_result(p_workspace,p_key,p);if r is not null then return r;end if;
 select * into s from public.card_statements where workspace_id=p_workspace and id=p_statement for update;
 if not found then raise exception 'statement_denied' using errcode='42501';end if;
 if s.closes_on>(now() at time zone 'America/Fortaleza')::date then raise exception 'statement_not_due_to_close';end if;
 update public.card_statements set closed_at=now() where id=s.id and closed_at is null;
 if found then insert into public.audit_events(workspace_id,actor_id,action,entity_id) values(p_workspace,auth.uid(),'statement.closed',s.id);end if;
 return finai_private.remember(p_workspace,p_key,p,jsonb_build_object('statementId',s.id));
end $$;

create function public.pay_finai_statement(p_workspace uuid,p_key uuid,p_statement uuid,p_account uuid,p_amount bigint,p_date date) returns jsonb language plpgsql security definer set search_path='' as $$
declare p jsonb;r jsonb;s public.card_statements;total numeric;paid numeric;e uuid;
begin
 perform finai_private.require_writer(p_workspace);
 p=jsonb_build_object('op','pay-statement','statement',p_statement,'account',p_account,'amount',p_amount,'date',p_date);r=finai_private.prior_result(p_workspace,p_key,p);if r is not null then return r;end if;
 if p_amount is null or p_amount not between 1 and 1000000000000 or p_date is null or p_date not between date '1900-01-01' and (now() at time zone 'America/Fortaleza')::date then raise exception 'invalid_payment';end if;
 select * into s from public.card_statements where workspace_id=p_workspace and id=p_statement for update;
 if not found then raise exception 'statement_denied' using errcode='42501';end if;
 if s.closed_at is null or p_date<s.closes_on then raise exception 'statement_not_closed';end if;
 perform 1 from public.accounts where workspace_id=p_workspace and id=p_account and archived_at is null for update;
 if not found then raise exception 'account_denied' using errcode='42501';end if;
 select coalesce(sum(amount_cents),0) into total from public.card_installments where statement_id=s.id and finai_private.active_installment(purchase_id);
 select coalesce(sum(amount_cents),0) into paid from public.statement_payments where statement_id=s.id;
 if p_amount>total-paid then raise exception 'payment_exceeds_remaining';end if;
 insert into public.financial_events(workspace_id,kind,description,effective_date,created_by) values(p_workspace,'card_payment','Pagamento de fatura',p_date,auth.uid()) returning id into e;
 insert into public.ledger_entries(workspace_id,event_id,account_id,card_id,bucket,amount_cents) values(p_workspace,e,p_account,null,'asset',-p_amount),(p_workspace,e,null,s.card_id,'liability',p_amount);
 insert into public.statement_payments(workspace_id,statement_id,event_id,amount_cents) values(p_workspace,s.id,e,p_amount);
 insert into public.audit_events(workspace_id,actor_id,action,event_id,entity_id) values(p_workspace,auth.uid(),'statement.paid',e,s.id);
 return finai_private.remember(p_workspace,p_key,p,jsonb_build_object('eventId',e));
end $$;

create function public.advance_finai_installments(p_workspace uuid,p_key uuid,p_statement uuid,p_count integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare p jsonb;r jsonb;s public.card_statements;item record;ids uuid[]='{}';
begin
 perform finai_private.require_writer(p_workspace);
 p=jsonb_build_object('op','advance','statement',p_statement,'count',p_count);r=finai_private.prior_result(p_workspace,p_key,p);if r is not null then return r;end if;
 if p_count is null or p_count not between 1 and 120 then raise exception 'invalid_count';end if;
 select * into s from public.card_statements where workspace_id=p_workspace and id=p_statement and closed_at is null for update;
 if not found then raise exception 'statement_closed';end if;
 for item in select i.id from public.card_installments i join public.card_statements t on t.id=i.statement_id where i.workspace_id=p_workspace and t.card_id=s.card_id and t.closes_on>s.closes_on and t.closed_at is null and finai_private.active_installment(i.purchase_id) order by t.closes_on,i.number,i.id limit p_count for update of i loop ids=array_append(ids,item.id);end loop;
 if cardinality(ids)<>p_count then raise exception 'not_enough_future_installments';end if;
 update public.card_installments set statement_id=s.id where id=any(ids);
 insert into public.audit_events(workspace_id,actor_id,action,entity_id) values(p_workspace,auth.uid(),'installments.advanced',s.id);
 return finai_private.remember(p_workspace,p_key,p,jsonb_build_object('statementId',s.id,'count',p_count));
end $$;

revoke all on function finai_private.prior_result(uuid,uuid,jsonb),finai_private.remember(uuid,uuid,jsonb,jsonb) from public;
revoke all on function public.create_finai_card(uuid,uuid,text,bigint,integer,integer),public.purchase_finai_card(uuid,uuid,uuid,bigint,integer,date,text,text),public.close_finai_statement(uuid,uuid,uuid),public.pay_finai_statement(uuid,uuid,uuid,uuid,bigint,date),public.advance_finai_installments(uuid,uuid,uuid,integer) from public,anon;
grant execute on function public.create_finai_card(uuid,uuid,text,bigint,integer,integer),public.purchase_finai_card(uuid,uuid,uuid,bigint,integer,date,text,text),public.close_finai_statement(uuid,uuid,uuid),public.pay_finai_statement(uuid,uuid,uuid,uuid,bigint,date),public.advance_finai_installments(uuid,uuid,uuid,integer) to authenticated;

-- SOURCE: 202611100006_bills_commands.sql
-- Internal materialization, never callable directly by application roles.
create function finai_private.materialize_rules(w uuid,p_through date) returns integer language plpgsql security definer set search_path='' as $$
declare ru public.recurring_rules;due date;n integer=0;inserted integer;
begin
 if p_through is null or p_through>((now() at time zone 'America/Fortaleza')::date+interval '24 months')::date then raise exception 'invalid_horizon';end if;
 perform 1 from public.workspaces where id=w for update;
 for ru in select * from public.recurring_rules where workspace_id=w and active order by id for update loop
  due=ru.next_on;
  while due<=p_through loop
   insert into public.bills(workspace_id,rule_id,description,kind,amount_cents,category,due_on,competence) values(w,ru.id,ru.description,ru.kind,ru.amount_cents,ru.category,due,date_trunc('month',due)::date) on conflict(rule_id,competence) do nothing;
   get diagnostics inserted=row_count;n=n+inserted;
   due=finai_private.month_day((date_trunc('month',due)+make_interval(months=>ru.cadence_months))::date,ru.anchor_day);
  end loop;
  update public.recurring_rules set next_on=due where id=ru.id;
 end loop;
 return n;
end $$;
create function public.schedule_finai_bill(p_workspace uuid,p_key uuid,p_kind text,p_amount bigint,p_due date,p_description text,p_category text) returns jsonb language plpgsql security definer set search_path='' as $$
declare p jsonb;r jsonb;b uuid;
begin
 perform finai_private.require_writer(p_workspace);
 p=jsonb_build_object('op','bill','kind',p_kind,'amount',p_amount,'due',p_due,'description',trim(p_description),'category',trim(p_category));r=finai_private.prior_result(p_workspace,p_key,p);if r is not null then return r;end if;
 if p_kind is null or p_kind not in ('income','expense') or p_amount is null or p_amount not between 1 and 1000000000000 or p_due is null or p_due not between date '1900-01-01' and date '2100-12-31' or p_description is null or length(trim(p_description)) not between 2 and 120 or p_category is null or length(trim(p_category)) not between 1 and 60 then raise exception 'invalid_bill';end if;
 insert into public.bills(workspace_id,description,kind,amount_cents,category,due_on) values(p_workspace,trim(p_description),p_kind,p_amount,trim(p_category),p_due) returning id into b;
 insert into public.audit_events(workspace_id,actor_id,action,entity_id) values(p_workspace,auth.uid(),'bill.scheduled',b);
 return finai_private.remember(p_workspace,p_key,p,jsonb_build_object('billId',b));
end $$;
create function public.create_finai_rule(p_workspace uuid,p_key uuid,p_kind text,p_amount bigint,p_start date,p_cadence integer,p_description text,p_category text) returns jsonb language plpgsql security definer set search_path='' as $$
declare p jsonb;r jsonb;ru uuid;n integer;
begin
 perform finai_private.require_writer(p_workspace);
 p=jsonb_build_object('op','rule','kind',p_kind,'amount',p_amount,'start',p_start,'cadence',p_cadence,'description',trim(p_description),'category',trim(p_category));r=finai_private.prior_result(p_workspace,p_key,p);if r is not null then return r;end if;
 if p_kind is null or p_kind not in ('income','expense') or p_amount is null or p_amount not between 1 and 1000000000000 or p_start is null or p_start not between date '1900-01-01' and ((now() at time zone 'America/Fortaleza')::date+interval '12 months')::date or p_cadence is null or p_cadence not in (1,12) or p_description is null or length(trim(p_description)) not between 2 and 120 or p_category is null or length(trim(p_category)) not between 1 and 60 then raise exception 'invalid_rule';end if;
 -- Avoid unexpectedly generating a century of missed occurrences.
 if p_start<((now() at time zone 'America/Fortaleza')::date-interval '12 months')::date then raise exception 'recurrence_start_too_old';end if;
 insert into public.recurring_rules(workspace_id,description,kind,amount_cents,category,cadence_months,anchor_day,next_on,created_by) values(p_workspace,trim(p_description),p_kind,p_amount,trim(p_category),p_cadence,extract(day from p_start),p_start,auth.uid()) returning id into ru;
 n=finai_private.materialize_rules(p_workspace,((now() at time zone 'America/Fortaleza')::date+interval '12 months')::date);
 insert into public.audit_events(workspace_id,actor_id,action,entity_id) values(p_workspace,auth.uid(),'rule.created',ru);
 return finai_private.remember(p_workspace,p_key,p,jsonb_build_object('ruleId',ru,'generated',n));
end $$;
create function public.generate_finai_rules(p_workspace uuid,p_key uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare p jsonb;r jsonb;n integer;
begin
 perform finai_private.require_writer(p_workspace);
 p=jsonb_build_object('op','generate-rules');r=finai_private.prior_result(p_workspace,p_key,p);if r is not null then return r;end if;
 n=finai_private.materialize_rules(p_workspace,((now() at time zone 'America/Fortaleza')::date+interval '12 months')::date);
 return finai_private.remember(p_workspace,p_key,p,jsonb_build_object('generated',n));
end $$;
create function public.cancel_finai_rule(p_workspace uuid,p_key uuid,p_rule uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare p jsonb;r jsonb;
begin
 perform finai_private.require_writer(p_workspace);
 p=jsonb_build_object('op','cancel-rule','rule',p_rule);r=finai_private.prior_result(p_workspace,p_key,p);if r is not null then return r;end if;
 perform 1 from public.recurring_rules where workspace_id=p_workspace and id=p_rule for update;if not found then raise exception 'rule_denied' using errcode='42501';end if;
 update public.recurring_rules set active=false where id=p_rule;
 update public.bills set status='cancelled' where rule_id=p_rule and status='pending' and due_on>=(now() at time zone 'America/Fortaleza')::date;
 insert into public.audit_events(workspace_id,actor_id,action,entity_id) values(p_workspace,auth.uid(),'rule.cancelled',p_rule);
 return finai_private.remember(p_workspace,p_key,p,jsonb_build_object('ruleId',p_rule));
end $$;
create function public.settle_finai_bill(p_workspace uuid,p_key uuid,p_bill uuid,p_account uuid,p_date date) returns jsonb language plpgsql security definer set search_path='' as $$
declare p jsonb;r jsonb;b public.bills;e uuid;
begin
 perform finai_private.require_writer(p_workspace);
 p=jsonb_build_object('op','settle-bill','bill',p_bill,'account',p_account,'date',p_date);r=finai_private.prior_result(p_workspace,p_key,p);if r is not null then return r;end if;
 select * into b from public.bills where workspace_id=p_workspace and id=p_bill for update;
 if not found then raise exception 'bill_denied' using errcode='42501';end if;
 if b.status<>'pending' then raise exception 'bill_not_pending';end if;
 r=public.post_finai_transaction(p_workspace,md5(p_key::text||':bill')::uuid,p_account,b.kind,b.amount_cents,p_date,b.description,b.category);e=(r->>'eventId')::uuid;
 update public.bills set status='paid',settlement_event_id=e where id=b.id;
 insert into public.audit_events(workspace_id,actor_id,action,event_id,entity_id) values(p_workspace,auth.uid(),'bill.settled',e,b.id);
 return finai_private.remember(p_workspace,p_key,p,r);
end $$;
-- Called by a database scheduler, not by browsers or anonymous roles.
create function finai_private.generate_all_rules() returns integer language plpgsql security definer set search_path='' as $$
declare w record;n integer=0;
begin
 for w in select distinct workspace_id from public.recurring_rules where active order by workspace_id loop
  n=n+finai_private.materialize_rules(w.workspace_id,((now() at time zone 'America/Fortaleza')::date+interval '12 months')::date);
 end loop;return n;
end $$;
revoke all on function finai_private.materialize_rules(uuid,date),finai_private.generate_all_rules() from public;
revoke all on function public.schedule_finai_bill(uuid,uuid,text,bigint,date,text,text),public.create_finai_rule(uuid,uuid,text,bigint,date,integer,text,text),public.generate_finai_rules(uuid,uuid),public.cancel_finai_rule(uuid,uuid,uuid),public.settle_finai_bill(uuid,uuid,uuid,uuid,date) from public,anon;
grant execute on function public.schedule_finai_bill(uuid,uuid,text,bigint,date,text,text),public.create_finai_rule(uuid,uuid,text,bigint,date,integer,text,text),public.generate_finai_rules(uuid,uuid),public.cancel_finai_rule(uuid,uuid,uuid),public.settle_finai_bill(uuid,uuid,uuid,uuid,date) to authenticated;

-- SOURCE: 202611100007_credit_snapshot.sql
create function public.read_finai_credit_snapshot(p_workspace uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 with base as (select public.read_finai_snapshot(p_workspace) as j),
 card_values as (select c.*, -coalesce((select sum(l.amount_cents) from public.ledger_entries l where l.workspace_id=p_workspace and l.card_id=c.id),0) as outstanding from public.cards c where c.workspace_id=p_workspace),
 statement_values as (select s.*,coalesce((select sum(i.amount_cents) from public.card_installments i where i.workspace_id=p_workspace and i.statement_id=s.id and finai_private.active_installment(i.purchase_id)),0) as total,coalesce((select sum(p.amount_cents) from public.statement_payments p where p.workspace_id=p_workspace and p.statement_id=s.id),0) as paid from public.card_statements s where s.workspace_id=p_workspace)
 select case when j is null then null else j || jsonb_build_object(
 'transactions',(j->'transactions')||coalesce((select jsonb_agg(jsonb_build_object('eventId',e.id,'description',e.description,'amount',p.amount_cents::text,'kind','expense','date',e.effective_date,'category',p.category,'accountId',p.card_id,'accountLabel',c.name,'source','card','reversed',not finai_private.active_installment(p.id)) order by e.effective_date desc,e.created_at desc) from public.card_purchases p join public.financial_events e on e.workspace_id=p.workspace_id and e.id=p.event_id join public.cards c on c.workspace_id=p.workspace_id and c.id=p.card_id where p.workspace_id=p_workspace),'[]'::jsonb),
 'credit',jsonb_build_object('ready',true,
 'cards',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'limit',c.limit_cents::text,'outstanding',c.outstanding::text,'available',(c.limit_cents-c.outstanding)::text,'closingDay',c.closing_day,'dueDay',c.due_day) order by c.created_at,c.id) from card_values c),'[]'::jsonb),
 'statements',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'cardId',s.card_id,'closesOn',s.closes_on,'dueOn',s.due_on,'closed',s.closed_at is not null,'total',s.total::text,'paid',s.paid::text,'remaining',(s.total-s.paid)::text) order by s.closes_on,s.id) from statement_values s where s.total>0),'[]'::jsonb),
 'installments',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'statementId',i.statement_id,'purchaseId',i.purchase_id,'description',e.description,'number',i.number,'count',p.installment_count,'amount',i.amount_cents::text) order by i.number,i.id) from public.card_installments i join public.card_purchases p on p.workspace_id=i.workspace_id and p.id=i.purchase_id join public.financial_events e on e.workspace_id=p.workspace_id and e.id=p.event_id where i.workspace_id=p_workspace and finai_private.active_installment(i.purchase_id)),'[]'::jsonb),
 'bills',coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'description',b.description,'kind',b.kind,'amount',b.amount_cents::text,'dueOn',b.due_on,'status',b.status,'ruleId',b.rule_id) order by b.due_on,b.id) from public.bills b where b.workspace_id=p_workspace),'[]'::jsonb),
 'rules',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'description',r.description,'kind',r.kind,'amount',r.amount_cents::text,'cadence',r.cadence_months,'nextOn',r.next_on,'active',r.active) order by r.description,r.id) from public.recurring_rules r where r.workspace_id=p_workspace),'[]'::jsonb)
 )) end from base;
$$;
revoke all on function public.read_finai_credit_snapshot(uuid) from public,anon;
grant execute on function public.read_finai_credit_snapshot(uuid) to authenticated;

-- SOURCE: 202611100008_cancellations.sql
alter table public.financial_events drop constraint financial_events_kind_check;
alter table public.financial_events add constraint financial_events_kind_check check(kind in ('income','expense','transfer','opening','reversal','card_purchase','card_payment','card_refund'));
create or replace function finai_private.guard_reversal() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.kind='reversal' and exists(select 1 from public.financial_events e where e.id=new.reversal_of and e.kind in ('card_purchase','card_payment','card_refund')) then raise exception 'card_reversal_not_supported'; end if;
 if new.kind='reversal' then update public.bills set status='pending',settlement_event_id=null where workspace_id=new.workspace_id and settlement_event_id=new.reversal_of; end if;
 return new;
end $$;
create function public.cancel_finai_purchase(p_workspace uuid,p_key uuid,p_purchase uuid,p_reason text) returns jsonb language plpgsql security definer set search_path='' as $$
declare p jsonb;r jsonb;purchase public.card_purchases;e uuid;
begin
 perform finai_private.require_writer(p_workspace);
 p=jsonb_build_object('op','cancel-purchase','purchase',p_purchase,'reason',trim(p_reason));r=finai_private.prior_result(p_workspace,p_key,p);if r is not null then return r;end if;
 if p_reason is null or length(trim(p_reason)) not between 2 and 120 then raise exception 'invalid_reason';end if;
 select * into purchase from public.card_purchases where workspace_id=p_workspace and id=p_purchase for update;if not found then raise exception 'purchase_denied' using errcode='42501';end if;
 if not finai_private.active_installment(purchase.id) then raise exception 'already_reversed';end if;
 if exists(select 1 from public.card_installments i join public.card_statements s on s.id=i.statement_id where i.purchase_id=purchase.id and (s.closed_at is not null or exists(select 1 from public.statement_payments pay where pay.statement_id=s.id))) then raise exception 'purchase_has_closed_statement';end if;
 insert into public.financial_events(workspace_id,kind,description,effective_date,reversal_of,created_by) values(p_workspace,'card_refund',trim(p_reason),(now() at time zone 'America/Fortaleza')::date,purchase.event_id,auth.uid()) returning id into e;
 insert into public.ledger_entries(workspace_id,event_id,account_id,card_id,bucket,amount_cents) select workspace_id,e,account_id,card_id,bucket,-amount_cents from public.ledger_entries where event_id=purchase.event_id;
 insert into public.audit_events(workspace_id,actor_id,action,event_id,entity_id) values(p_workspace,auth.uid(),'card.purchase.cancelled',e,purchase.id);
 return finai_private.remember(p_workspace,p_key,p,jsonb_build_object('eventId',e));
end $$;
create function public.cancel_finai_bill(p_workspace uuid,p_key uuid,p_bill uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare p jsonb;r jsonb;b public.bills;
begin
 perform finai_private.require_writer(p_workspace);
 p=jsonb_build_object('op','cancel-bill','bill',p_bill);r=finai_private.prior_result(p_workspace,p_key,p);if r is not null then return r;end if;
 select * into b from public.bills where workspace_id=p_workspace and id=p_bill for update;if not found then raise exception 'bill_denied' using errcode='42501';end if;
 if b.status<>'pending' then raise exception 'bill_not_pending';end if;
 update public.bills set status='cancelled' where id=b.id;
 insert into public.audit_events(workspace_id,actor_id,action,entity_id) values(p_workspace,auth.uid(),'bill.cancelled',b.id);
 return finai_private.remember(p_workspace,p_key,p,jsonb_build_object('billId',b.id));
end $$;
revoke all on function public.cancel_finai_purchase(uuid,uuid,uuid,text),public.cancel_finai_bill(uuid,uuid,uuid) from public,anon;
grant execute on function public.cancel_finai_purchase(uuid,uuid,uuid,text),public.cancel_finai_bill(uuid,uuid,uuid) to authenticated;

commit;
