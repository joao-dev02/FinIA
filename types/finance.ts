export type Transaction = { id: string; description: string; amount: number; kind: 'income' | 'expense'; date: string; category: string; accountId: string; workspaceId: string; reversed?: boolean };
export type Account = { id: string; name: string; initials: string; color: string; openingBalance: number; workspaceId: string; balance?: number; archived?: boolean };
