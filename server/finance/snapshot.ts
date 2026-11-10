import 'server-only';
import { supabaseServer } from '@/lib/supabase/server';
import { financialToday } from '@/lib/dates';
import { addCents } from '@/features/finance/domain';
import type { FinanceSnapshot, FinancialEvent } from '@/types/snapshot';

export async function readSnapshot(): Promise<FinanceSnapshot> {
  const client = await supabaseServer();
  const { data: { user }, error: authError } = await client.auth.getUser();
  if (authError || !user) throw new Error('UNAUTHORIZED');
  const empty: FinanceSnapshot = { workspaceId: null, workspaceName: 'Meu espaço', email: user.email ?? '', today: financialToday(), accounts: [], transactions: [], events: [] };
  const membership = await client.from('workspace_members').select('workspace_id').eq('user_id',user.id).order('workspace_id').limit(1);
  if (membership.error) throw new Error('DATABASE_NOT_READY');
  const w = membership.data[0]?.workspace_id;
  if (!w) return empty;
  // Single statement avoids mixed commits and the default PostgREST table row limit.
  const { data, error } = await client.rpc('read_finai_snapshot',{ p_workspace:w });
  if (error || !data) throw new Error('DATABASE_NOT_READY');
  const raw = data as { name: string; accounts: { id: string; name: string; balance: number|string; archived: boolean }[]; transactions: { eventId: string; description:string; amount:number|string;kind:'income'|'expense';date:string;category:string;accountId:string;reversed:boolean }[]; events: (Omit<FinancialEvent,'amount'> & {amount:number|string})[] };
  function integer(value: number|string) { return addCents(Number(value),0); }
  return { ...empty, workspaceId: w, workspaceName:raw.name,
    accounts:raw.accounts.map(a=>({id:a.id,workspaceId:w,name:a.name,initials:a.name.slice(0,2).toUpperCase(),color:'#60a5fa',openingBalance:0,balance:integer(a.balance),archived:a.archived})),
    transactions:raw.transactions.map(t=>({id:t.eventId,workspaceId:w,description:t.description,amount:integer(t.amount),kind:t.kind,date:t.date,category:t.category,accountId:t.accountId,reversed:t.reversed})),
    events:raw.events.map(e=>({...e,amount:integer(e.amount)}))
  };
}
