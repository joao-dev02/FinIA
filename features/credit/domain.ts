import { z } from 'zod';
import { financialToday } from '@/lib/dates';
const day=z.number().int().min(1).max(31);
export function monthDay(year:number,month:number,requested:number) {
  day.parse(requested);
  const first=new Date(Date.UTC(year,month-1,1));
  const last=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0)).getUTCDate();
  return `${first.getUTCFullYear()}-${String(first.getUTCMonth()+1).padStart(2,'0')}-${String(Math.min(requested,last)).padStart(2,'0')}`;
}
export function statementDates(purchasedOn:string,closingDay:number,dueDay:number,offset=0) {
  z.iso.date().parse(purchasedOn);day.parse(closingDay);day.parse(dueDay);
  const [year,month]=purchasedOn.split('-').map(Number);
  const cycleOffset=(purchasedOn>monthDay(year,month,closingDay)?1:0)+offset;
  const closesOn=monthDay(year,month+cycleOffset,closingDay);
  let dueOn=monthDay(year,month+cycleOffset,dueDay);
  if(dueOn<=closesOn)dueOn=monthDay(year,month+cycleOffset+1,dueDay);
  return {closesOn,dueOn};
}
const common={workspaceId:z.uuid(),key:z.uuid()};
const money=z.number().int().min(1).max(1_000_000_000_000);
const date=z.iso.date().refine(v=>v>='1900-01-01'&&v<=financialToday(),'Use uma data entre 1900 e hoje.');
const scheduled=z.iso.date().refine(v=>v>='1900-01-01'&&v<='2100-12-31','Data fora do intervalo aceito.');
export const creditCommandSchema=z.discriminatedUnion('operation',[
  z.object({operation:z.literal('card'),...common,name:z.string().trim().min(1).max(80),limit:money,closingDay:day,dueDay:day}),
  z.object({operation:z.literal('purchase'),...common,cardId:z.uuid(),amount:money,count:z.number().int().min(1).max(120),date,description:z.string().trim().min(2).max(120),category:z.string().trim().min(1).max(60)}).refine(v=>v.count<=v.amount,'Cada parcela deve ter pelo menos um centavo.'),
  z.object({operation:z.literal('close-statement'),...common,statementId:z.uuid()}),
  z.object({operation:z.literal('pay-statement'),...common,statementId:z.uuid(),accountId:z.uuid(),amount:money,date}),
  z.object({operation:z.literal('advance'),...common,statementId:z.uuid(),count:z.number().int().min(1).max(120)}),
  z.object({operation:z.literal('cancel-purchase'),...common,purchaseId:z.uuid(),reason:z.string().trim().min(2).max(120)}),
  z.object({operation:z.literal('bill'),...common,kind:z.enum(['income','expense']),amount:money,dueOn:scheduled,description:z.string().trim().min(2).max(120),category:z.string().trim().min(1).max(60)}),
  z.object({operation:z.literal('rule'),...common,kind:z.enum(['income','expense']),amount:money,startOn:scheduled,cadence:z.union([z.literal(1),z.literal(12)]),description:z.string().trim().min(2).max(120),category:z.string().trim().min(1).max(60)}),
  z.object({operation:z.literal('settle-bill'),...common,billId:z.uuid(),accountId:z.uuid(),date}),
  z.object({operation:z.literal('cancel-bill'),...common,billId:z.uuid()}),
  z.object({operation:z.literal('cancel-rule'),...common,ruleId:z.uuid()}),
  z.object({operation:z.literal('generate-rules'),...common})
]);
export type CreditCommand=z.infer<typeof creditCommandSchema>;
