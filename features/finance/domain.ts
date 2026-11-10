import { z } from 'zod';
import type { Transaction, Account } from '@/types/finance';
export const centsSchema = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
export const transactionSchema = z.object({ description: z.string().trim().min(2).max(120), amount: centsSchema, kind: z.enum(['income', 'expense']), date: z.iso.date(), category: z.string().min(1), accountId: z.string().min(1), workspaceId: z.string().min(1) });
export function parseMoney(value: string): number {
  return centsSchema.parse(parseSignedMoney(value));
}
export function parseSignedMoney(value: string): number {
  const negative = value.startsWith('-');
  if (negative) value = value.slice(1);
  if (!/^\d{1,10}(,\d{1,2})?$/.test(value)) throw new Error('Use um valor como 125,90, sem separador de milhares.');
  const [whole, fraction = ''] = value.split(',');
  return addCents((Number(whole) * 100 + Number(fraction.padEnd(2, '0'))) * (negative ? -1 : 1), 0);
}
export function formatMoney(cents: number) { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100); }
export function addCents(a: number, b: number) {
  const result = a + b;
  if (![a, b, result].every(Number.isSafeInteger)) throw new Error('Valor excede o intervalo seguro de centavos.');
  return result;
}
export function splitInstallments(total: number, count: number): number[] {
  centsSchema.parse(total);
  if (!Number.isInteger(count) || count < 1 || count > total) throw new Error('Quantidade de parcelas inválida');
  return Array.from({ length: count }, (_, i) => Math.floor(total / count) + (i < total % count ? 1 : 0));
}
export function accountBalance(account: Account, entries: Transaction[]) {
  if (account.balance !== undefined) return addCents(account.balance, 0);
  return entries.filter(t => t.accountId === account.id && t.workspaceId === account.workspaceId).reduce((sum, t) => addCents(sum, t.kind === 'income' ? t.amount : -t.amount), account.openingBalance);
}
export function summarize(entries: Transaction[]) {
  return entries.filter(t => !t.reversed).reduce((a, t) => ({ ...a, [t.kind]: addCents(a[t.kind], t.amount) }), { income: 0, expense: 0 });
}
