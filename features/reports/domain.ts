import {z} from 'zod';
import type {Account,Transaction} from '@/types/finance';
import type {CreditSnapshot} from '@/types/credit';
import {accountBalance,addCents,summarize} from '@/features/finance/domain';
export const reportFiltersSchema=z.object({period:z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).refine(v=>v>='1900-01'&&v<='2100-12'),account:z.string().max(80).default(''),category:z.string().max(60).default('')});
export type ReportFilters=z.infer<typeof reportFiltersSchema>;
export type ReportContext={workspaceId:string;workspaceName:string;today:string;accounts:Account[];transactions:Transaction[];credit:CreditSnapshot};
export function shiftMonth(period:string,offset:number){const [y,m]=period.split('-').map(Number);const d=new Date(Date.UTC(y,m-1+offset,1));return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}`;}
export function buildReport(context:ReportContext,input:ReportFilters){
 const filters=reportFiltersSchema.parse(input);
 const scoped=context.transactions.filter(t=>t.workspaceId===context.workspaceId&&!t.reversed&&(!filters.account||t.accountId===filters.account)&&(!filters.category||t.category===filters.category));
 const rows=scoped.filter(t=>t.date.startsWith(filters.period)).sort((a,b)=>b.date.localeCompare(a.date)||a.id.localeCompare(b.id));
 const totals=summarize(rows);const previous=summarize(scoped.filter(t=>t.date.startsWith(shiftMonth(filters.period,-1))));
 const months=Array.from({length:6},(_,i)=>{const period=shiftMonth(filters.period,i-5);return {period,...summarize(scoped.filter(t=>t.date.startsWith(period)))};});
 const categories=Object.entries(rows.filter(t=>t.kind==='expense').reduce<Record<string,number>>((a,t)=>({...a,[t.category]:addCents(a[t.category]??0,t.amount)}),{})).sort((a,b)=>b[1]-a[1]);
 const behavior={fixed:0,variable:0,unspecified:0};for(const t of rows.filter(t=>t.kind==='expense')){const key=t.expenseBehavior??'unspecified';behavior[key]=addCents(behavior[key],t.amount);}
 const accounts=context.accounts.filter(a=>a.workspaceId===context.workspaceId);
 const assets=accounts.reduce((sum,a)=>addCents(sum,accountBalance(a,context.transactions)),0);
 const reserved=accounts.reduce((sum,a)=>addCents(sum,a.reserved??0),0);
 const debt=context.credit.cards.reduce((sum,c)=>addCents(sum,c.outstanding),0);
 const agenda=[...context.credit.bills.filter(b=>b.status==='pending').map(b=>({date:b.dueOn,amount:b.amount,kind:b.kind})),...context.credit.statements.filter(s=>s.remaining>0).map(s=>({date:s.dueOn,amount:s.remaining,kind:'expense' as const}))];
 let projected=assets;
 const projection=Array.from({length:6},(_,i)=>{const period=shiftMonth(context.today.slice(0,7),i);const due=agenda.filter(a=>(a.date<context.today?context.today:a.date).startsWith(period));const income=due.filter(a=>a.kind==='income').reduce((s,a)=>addCents(s,a.amount),0);const expense=due.filter(a=>a.kind==='expense').reduce((s,a)=>addCents(s,a.amount),0);projected=addCents(projected,addCents(income,-expense));return {period,income,expense,cash:projected,freeCash:addCents(projected,-reserved)};});
 return {filters,rows,totals,previous,months,categories,behavior,position:{assets,reserved,debt,net:addCents(assets,-debt),free:addCents(assets,-reserved),creditComplete:context.credit.ready},projection};
}
export type FinancialReport=ReturnType<typeof buildReport>;
