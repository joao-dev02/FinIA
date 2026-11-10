begin;
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
commit;
