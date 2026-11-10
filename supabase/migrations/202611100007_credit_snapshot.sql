begin;
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
commit;
