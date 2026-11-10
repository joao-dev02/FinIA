import type { Account, Transaction } from './finance';
export type FinancialEvent = { id: string; kind: 'income'|'expense'|'transfer'|'opening'|'reversal'; description: string; date: string; reversed: boolean; amount?: number };
export type FinanceSnapshot = { workspaceId: string | null; workspaceName: string; email: string; today: string; accounts: Account[]; transactions: Transaction[]; events: FinancialEvent[] };
