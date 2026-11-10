import {z} from 'zod';
import {cents} from './credit-wire';
export const goalWireSchema=z.object({ready:z.literal(true),
 goals:z.array(z.object({id:z.uuid(),name:z.string(),target:cents,deadline:z.iso.date(),reserved:cents,version:z.number().int(),archived:z.boolean()})),
 allocations:z.array(z.object({goalId:z.uuid(),accountId:z.uuid(),reserved:cents})),
 history:z.array(z.object({id:z.uuid(),goalId:z.uuid(),accountId:z.uuid(),amount:cents,date:z.iso.date()}))
});
