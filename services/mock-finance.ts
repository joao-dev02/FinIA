import { demoCardId } from './mock-credit';
import type { Account, Transaction } from '@/types/finance';
export const workspaceId = 'demo-personal';
export const accounts: Account[] = [
  { id: 'nubank', name: 'Nubank', reserved: 200000, initials: 'nu', color: '#a779ef', openingBalance: 625000, workspaceId },
  { id: 'inter', name: 'Banco Inter', reserved: 100000, initials: 'in', color: '#f9a466', openingBalance: 345000, workspaceId },
  { id: 'wallet', name: 'Carteira', initials: '$', color: '#60a5fa', openingBalance: 42000, workspaceId }
];
export const transactions: Transaction[] = [
  { id: 'demo-card-purchase', description: 'Equipamento de trabalho', amount: 120000, kind: 'expense', date: '2026-11-03', category: 'Compras', accountId: demoCardId, workspaceId, source: 'card', accountLabel: 'Cartão principal', expenseBehavior: 'variable' },
  { id: '1', description: 'Projeto · Identidade visual', amount: 380000, kind: 'income', date: '2026-11-08', category: 'Projetos', accountId: 'inter', workspaceId },
  { id: '2', description: 'Supermercado', expenseBehavior: 'variable', amount: 28790, kind: 'expense', date: '2026-11-08', category: 'Alimentação', accountId: 'nubank', workspaceId },
  { id: '3', description: 'Spotify Premium', expenseBehavior: 'fixed', amount: 2190, kind: 'expense', date: '2026-11-07', category: 'Assinaturas', accountId: 'nubank', workspaceId },
  { id: '4', description: 'Salário', amount: 850000, kind: 'income', date: '2026-11-05', category: 'Salário', accountId: 'nubank', workspaceId },
  { id: '5', description: 'Aluguel', expenseBehavior: 'fixed', amount: 210000, kind: 'expense', date: '2026-11-05', category: 'Moradia', accountId: 'inter', workspaceId },
  { id: '6', description: 'Café & companhia', expenseBehavior: 'variable', amount: 3450, kind: 'expense', date: '2026-11-04', category: 'Alimentação', accountId: 'nubank', workspaceId },
  { id: '7', description: 'Internet residencial', expenseBehavior: 'fixed', amount: 11990, kind: 'expense', date: '2026-11-03', category: 'Moradia', accountId: 'inter', workspaceId }
];
