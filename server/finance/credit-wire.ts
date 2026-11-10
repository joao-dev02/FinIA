import {z} from 'zod';
export const cents=z.union([z.string().regex(/^-?\d+$/),z.number().int()]).transform(Number).pipe(z.number().int().min(Number.MIN_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER));
export const creditWireSchema=z.object({
 ready:z.literal(true),
 cards:z.array(z.object({id:z.uuid(),name:z.string(),limit:cents,outstanding:cents,available:cents,closingDay:z.number().int(),dueDay:z.number().int()})),
 statements:z.array(z.object({id:z.uuid(),cardId:z.uuid(),closesOn:z.iso.date(),dueOn:z.iso.date(),closed:z.boolean(),total:cents,paid:cents,remaining:cents})),
 installments:z.array(z.object({id:z.uuid(),statementId:z.uuid(),purchaseId:z.uuid(),description:z.string(),number:z.number().int(),count:z.number().int(),amount:cents})),
 bills:z.array(z.object({id:z.uuid(),description:z.string(),kind:z.enum(['income','expense']),amount:cents,dueOn:z.iso.date(),status:z.enum(['pending','paid','cancelled']),ruleId:z.uuid().nullable()})),
 rules:z.array(z.object({id:z.uuid(),description:z.string(),kind:z.enum(['income','expense']),amount:cents,cadence:z.number().int(),nextOn:z.iso.date(),active:z.boolean()}))
});
