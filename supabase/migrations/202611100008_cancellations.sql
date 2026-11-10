begin;
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
