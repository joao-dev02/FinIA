import {CalendarDays,ArrowUpRight} from 'lucide-react';
import type {CreditSnapshot} from '@/types/credit';
import {formatMoney} from '@/features/finance/domain';
export function UpcomingCommitments({data,today,hidden,onOpen}:{data:CreditSnapshot;today:string;hidden:boolean;onOpen:(section:'cards'|'bills')=>void}) {
 const items=[...data.bills.filter(b=>b.status==='pending').map(b=>({id:b.id,label:b.description,date:b.dueOn,amount:b.amount,kind:b.kind,section:'bills' as const})),...data.statements.filter(s=>s.remaining>0).map(s=>({id:s.id,label:`Fatura · ${data.cards.find(c=>c.id===s.cardId)?.name??'Cartão'}`,date:s.dueOn,amount:s.remaining,kind:'expense',section:'cards' as const}))].sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id)).slice(0,5);
 if(!data.ready||!items.length)return null;
 return <section className="panel upcoming-panel"><div className="panel-heading"><div><h2>Próximos vencimentos</h2><p>Compromissos pendentes · não são débitos automáticos.</p></div><CalendarDays size={18}/></div><div className="upcoming-list">{items.map(item=><button key={item.id} onClick={()=>onOpen(item.section)}><span className="upcoming-date">{item.date.slice(-2)}<small>{item.date.slice(5,7)}/{item.date.slice(0,4)}</small></span><span><strong>{item.label}</strong><small>{item.date<today?'Vencido':item.kind==='income'?'A receber':'A pagar'}</small></span><strong>{hidden?'••••••':formatMoney(item.amount)}</strong><ArrowUpRight size={15}/></button>)}</div></section>;
}
