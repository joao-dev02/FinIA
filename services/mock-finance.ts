import type { Account, Transaction } from '@/types/finance';
export const workspaceId = 'demo-personal';
export const accounts: Account[] = [
  { id: 'nubank', name: 'Nubank', initials: 'nu', color: '#a779ef', openingBalance: 625000, workspaceId },
  { id: 'inter', name: 'Banco Inter', initials: 'in', color: '#f9a466', openingBalance: 345000, workspaceId },
  { id: 'wallet', name: 'Carteira', initials: '$', color: '#60a5fa', openingBalance: 42000, workspaceId }
];
export const transactions: Transaction[] = [
  { id: '1', description: 'Projeto · Identidade visual', amount: 380000, kind: 'income', date: '2026-11-08', category: 'Projetos', accountId: 'inter', workspaceId },
  { id: '2', description: 'Supermercado', amount: 28790, kind: 'expense', date: '2026-11-08', category: 'Alimentação', accountId: 'nubank', workspaceId },
  { id: '3', description: 'Spotify Premium', amount: 2190, kind: 'expense', date: '2026-11-07', category: 'Assinaturas', accountId: 'nubank', workspaceId },
  { id: '4', description: 'Salário', amount: 850000, kind: 'income', date: '2026-11-05', category: 'Salário', accountId: 'nubank', workspaceId },
  { id: '5', description: 'Aluguel', amount: 210000, kind: 'expense', date: '2026-11-05', category: 'Moradia', accountId: 'inter', workspaceId },
  { id: '6', description: 'Café & companhia', amount: 3450, kind: 'expense', date: '2026-11-04', category: 'Alimentação', accountId: 'nubank', workspaceId },
  { id: '7', description: 'Internet residencial', amount: 11990, kind: 'expense', date: '2026-11-03', category: 'Moradia', accountId: 'inter', workspaceId }
];
