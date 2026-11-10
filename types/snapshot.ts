import type { Account, Transaction } from './finance';
import type { CreditSnapshot } from './credit';
import type {GoalSnapshot} from './goals';
export type FinancialEvent = { id: string; kind: 'income'|'expense'|'transfer'|'opening'|'reversal'|'card_purchase'|'card_payment'|'card_refund'; description: string; date: string; reversed: boolean; amount?: number };
export type FinanceSnapshot = { workspaceId: string | null; workspaceName: string; email: string; today: string; accounts: Account[]; transactions: Transaction[]; events: FinancialEvent[]; credit: CreditSnapshot; goals:GoalSnapshot; workspaces:{id:string;name:string}[] };
