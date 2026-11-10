import { describe,it,expect } from 'vitest';
import { financeCommandSchema } from '../features/finance/commands';
import { financialToday } from '../lib/dates';
describe('Contratos de comandos',()=>{
  it('usa o dia financeiro de Fortaleza, independente de UTC',()=>{
    expect(financialToday(new Date('2026-11-10T01:30:00Z'))).toBe('2026-11-09');
  });
  it('recusa frações, campos ausentes e datas futuras',()=>{
    const base={operation:'transaction',workspaceId:'11111111-1111-4111-8111-111111111111',key:'22222222-2222-4222-8222-222222222222',accountId:'33333333-3333-4333-8333-333333333333',kind:'expense',amount:100,date:'2026-01-01',description:'Teste',category:'Outros'};
    expect(financeCommandSchema.safeParse(base).success).toBe(true);
    expect(financeCommandSchema.safeParse({...base,amount:0.1}).success).toBe(false);
    expect(financeCommandSchema.safeParse({...base,date:'2999-01-01'}).success).toBe(false);
    expect(financeCommandSchema.safeParse({...base,key:undefined}).success).toBe(false);
  });
});
