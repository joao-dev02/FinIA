import { describe, it, expect } from 'vitest';
import { parseMoney, parseSignedMoney, splitInstallments, accountBalance, summarize, transactionSchema, addCents } from '../features/finance/domain';
describe('Invariantes monetárias da fundação', () => {
  it('converte decimais sem aritmética fracionária', () => { expect(parseMoney('123,45')).toBe(12345); expect(parseMoney('0,01')).toBe(1); });
  it('recusa somas que perderiam precisão no JavaScript', () => expect(() => addCents(Number.MAX_SAFE_INTEGER, 1)).toThrow());
  it('aceita saldo inicial zerado ou negativo sem aceitar despesa negativa', () => {expect(parseSignedMoney('0,00')).toBe(0);expect(parseSignedMoney('-12,34')).toBe(-1234);expect(()=>parseMoney('-12,34')).toThrow();});
  it('não considera estorno como receita nem mantém original nos totais',()=>{expect(summarize([{id:'a',description:'Estornado',kind:'expense',amount:100,category:'Outros',accountId:'a',workspaceId:'w',date:'2026-01-01',reversed:true}])).toEqual({income:0,expense:0});});
  it.each(['0', '-1', '1.234,56', 'NaN', '2,999', '1e3'])('rejeita valor inválido %s', value => expect(() => parseMoney(value)).toThrow());
  it('distribui centavos restantes sem perda', () => { expect(splitInstallments(10000, 3)).toEqual([3334, 3333, 3333]); });
  it('preserva o total em várias divisões', () => { for (let n = 1; n < 50; n++) expect(splitInstallments(10001, n).reduce((a,b) => a+b, 0)).toBe(10001); });
  it('rejeita frações de centavo e datas impossíveis', () => {
    const valid = { description: 'Teste', amount: 100, kind: 'expense', date: '2026-11-01', category: 'Outros', accountId: 'a', workspaceId: 'w' };
    expect(transactionSchema.safeParse(valid).success).toBe(true);
    expect(transactionSchema.safeParse({ ...valid, amount: 1.5 }).success).toBe(false);
    expect(transactionSchema.safeParse({ ...valid, date: '2026-02-30' }).success).toBe(false);
  });
  it('não incorpora saldo de outro workspace', () => {
    const a = { id: 'a', workspaceId: 'w', name: 'Conta', initials: 'C', color: '', openingBalance: 100 };
    const t = { id: 't', workspaceId: 'outro', accountId: 'a', amount: 999, kind: 'income' as const, date: '2026-11-01', category: 'Teste', description: 'Teste' };
    expect(accountBalance(a, [t])).toBe(100); expect(summarize([])).toEqual({ income: 0, expense: 0 });
  });
  it('deriva saldo com entrada e saída sem alterar saldo inicial', () => {
    const account = { id: 'a', workspaceId: 'w', name: 'Conta', initials: 'C', color: '', openingBalance: 10000 };
    const base = { workspaceId: 'w', accountId: 'a', date: '2026-11-01', category: 'Outros', description: 'Teste' };
    const entries = [{ ...base, id: '1', amount: 1000, kind: 'income' as const }, { ...base, id: '2', amount: 1234, kind: 'expense' as const }];
    expect(accountBalance(account, entries)).toBe(9766);
    expect(summarize(entries)).toEqual({ income: 1000, expense: 1234 });
    expect(account.openingBalance).toBe(10000);
  });
});
