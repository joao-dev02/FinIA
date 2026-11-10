begin;
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
commit;
