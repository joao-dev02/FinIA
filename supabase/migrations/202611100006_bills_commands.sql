begin;
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
commit;
