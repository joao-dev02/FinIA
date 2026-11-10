import { z } from 'zod';
import { financialToday } from '@/lib/dates';
const money = z.number().int().min(1).max(1_000_000_000_000);
const workspace = { workspaceId: z.uuid() };
const keyed = { ...workspace, key: z.uuid() };
const date = z.iso.date().refine(value => value >= '1900-01-01' && value <= financialToday(), 'Use uma data entre 1900 e hoje.');
export const financeCommandSchema = z.discriminatedUnion('operation', [
  z.object({ operation: z.literal('initialize') }),
  z.object({ operation: z.literal('account'), ...keyed, name: z.string().trim().min(1).max(80), kind: z.enum(['bank','wallet','cash']), opening: z.number().int().min(-1_000_000_000_000).max(1_000_000_000_000), date }),
  z.object({ operation: z.literal('transaction'), ...keyed, accountId: z.uuid(), kind: z.enum(['income','expense']), amount: money, date, description: z.string().trim().min(2).max(120), category: z.string().trim().min(1).max(60) }),
  z.object({ operation: z.literal('transfer'), ...keyed, sourceId: z.uuid(), destinationId: z.uuid(), amount: money, date, description: z.string().trim().min(2).max(120) }).refine(v => v.sourceId !== v.destinationId, 'Escolha contas diferentes.'),
  z.object({ operation: z.literal('reverse'), ...keyed, eventId: z.uuid(), reason: z.string().trim().min(2).max(120) }),
  z.object({ operation: z.literal('archive'), ...workspace, accountId: z.uuid() })
]);
export type FinanceCommand = z.infer<typeof financeCommandSchema>;
