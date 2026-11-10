import {z} from 'zod';
import {financialToday} from '@/lib/dates';
import {monthDay} from '@/features/credit/domain';
const common={workspaceId:z.uuid(),key:z.uuid()};
const money=z.number().int().min(1).max(1_000_000_000_000);
const details={name:z.string().trim().min(1).max(80),target:money,deadline:z.iso.date().refine(v=>v>=financialToday()&&v<='2100-12-31','Defina um prazo entre hoje e 2100.')};
export const goalCommandSchema=z.discriminatedUnion('operation',[
 z.object({operation:z.literal('goal'),...common,...details}),
 z.object({operation:z.literal('reserve'),...common,goalId:z.uuid(),accountId:z.uuid(),amount:money}),
 z.object({operation:z.literal('release'),...common,goalId:z.uuid(),accountId:z.uuid(),amount:money}),
 z.object({operation:z.literal('edit-goal'),...common,goalId:z.uuid(),version:z.number().int().positive(),...details}),
 z.object({operation:z.literal('archive-goal'),...common,goalId:z.uuid(),version:z.number().int().positive()}),
 z.object({operation:z.literal('classify-expense'),...common,eventId:z.uuid(),behavior:z.enum(['fixed','variable','unspecified'])})
]);
export type GoalCommand=z.infer<typeof goalCommandSchema>;
export function simulateGoal(target:number,reserved:number,monthly:number,today:string){
 const remaining=Math.max(0,target-reserved);
 if(!remaining)return {remaining:0,months:0,estimatedOn:today};
 if(!Number.isSafeInteger(monthly)||monthly<=0)return {remaining,months:null,estimatedOn:null};
 const months=Math.ceil(remaining/monthly);const [y,m,d]=today.split('-').map(Number);
 if(months>1200)return {remaining,months,estimatedOn:null};
 return {remaining,months,estimatedOn:monthDay(y,m+months,d)};
}
