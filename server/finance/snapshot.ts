import 'server-only';
import { supabaseServer } from '@/lib/supabase/server';
import { financialToday } from '@/lib/dates';
import { addCents } from '@/features/finance/domain';
import type { FinanceSnapshot, FinancialEvent } from '@/types/snapshot';
import { creditWireSchema } from './credit-wire';
import {goalWireSchema} from './goal-wire';
import {z} from 'zod';

export async function readSnapshot(requestedWorkspace?:string): Promise<FinanceSnapshot> {
  const client = await supabaseServer();
  const { data: { user }, error: authError } = await client.auth.getUser();
  if (authError || !user) throw new Error('UNAUTHORIZED');
  const empty: FinanceSnapshot = { workspaceId: null, workspaceName: 'Meu espaço', email: user.email ?? '', today: financialToday(), accounts: [], transactions: [], events: [], credit:{ready:false,cards:[],statements:[],installments:[],bills:[],rules:[]},goals:{ready:false,goals:[],allocations:[],history:[]},workspaces:[] };
  if(requestedWorkspace&&!z.uuid().safeParse(requestedWorkspace).success)throw new Error('WORKSPACE_DENIED');
  const membership = await client.from('workspace_members').select('workspace_id').eq('user_id',user.id).order('workspace_id').limit(500);
  if (membership.error) throw new Error('DATABASE_NOT_READY');
  if(requestedWorkspace&&!membership.data.some(m=>m.workspace_id===requestedWorkspace))throw new Error('WORKSPACE_DENIED');
  const w = requestedWorkspace??membership.data[0]?.workspace_id;
  if (!w) return empty;
  // Single statement avoids mixed commits and the default PostgREST table row limit.
  let { data, error } = await client.rpc('read_finai_goal_snapshot',{ p_workspace:w });
  if (error?.code === 'PGRST202') ({data,error}=await client.rpc('read_finai_credit_snapshot',{p_workspace:w}));
  if (error?.code === 'PGRST202') ({data,error}=await client.rpc('read_finai_snapshot',{p_workspace:w}));
  if (error || !data) throw new Error('DATABASE_NOT_READY');
  const raw = data as { name: string; accounts: { id: string; name: string; balance: number|string; reserved?:number|string;archived: boolean }[]; transactions: { eventId: string; description:string; amount:number|string;kind:'income'|'expense';date:string;category:string;accountId:string;reversed:boolean;source?:'card'|'account';accountLabel?:string;expenseBehavior?:'fixed'|'variable'|'unspecified' }[]; events: (Omit<FinancialEvent,'amount'> & {amount:number|string})[];credit?:unknown;goals?:unknown;workspaces?:{id:string;name:string}[] };
  function integer(value: number|string) { return addCents(Number(value),0); }
  return { ...empty, workspaceId: w, workspaceName:raw.name,
    accounts:raw.accounts.map(a=>({id:a.id,workspaceId:w,name:a.name,initials:a.name.slice(0,2).toUpperCase(),color:'#60a5fa',openingBalance:0,balance:integer(a.balance),reserved:integer(a.reserved??0),archived:a.archived})),
    transactions:raw.transactions.map(t=>({id:t.eventId,workspaceId:w,description:t.description,amount:integer(t.amount),kind:t.kind,date:t.date,category:t.category,accountId:t.accountId,reversed:t.reversed,source:t.source,accountLabel:t.accountLabel,expenseBehavior:t.expenseBehavior??'unspecified'})).sort((a,b)=>b.date.localeCompare(a.date)||b.id.localeCompare(a.id)),
    events:raw.events.map(e=>({...e,amount:integer(e.amount)})),
    credit:raw.credit?creditWireSchema.parse(raw.credit):empty.credit,
    goals:raw.goals?goalWireSchema.parse(raw.goals):empty.goals,
    workspaces:raw.workspaces?z.array(z.object({id:z.uuid(),name:z.string()})).parse(raw.workspaces):[{id:w,name:raw.name}]
  };
}
