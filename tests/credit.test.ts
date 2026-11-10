import {describe,it,expect} from 'vitest';
import {statementDates,monthDay} from '../features/credit/domain';
describe('Datas civis de cartão',()=>{
 it('inclui fechamento e vira o ciclo no dia seguinte',()=>{expect(statementDates('2026-01-10',10,20)).toEqual({closesOn:'2026-01-10',dueOn:'2026-01-20'});expect(statementDates('2026-01-11',10,5)).toEqual({closesOn:'2026-02-10',dueOn:'2026-03-05'});});
 it('ajusta dias inexistentes sem perder âncora e garante vencimento posterior',()=>{expect(monthDay(2028,2,31)).toBe('2028-02-29');expect(statementDates('2026-02-28',30,31)).toEqual({closesOn:'2026-02-28',dueOn:'2026-03-31'});expect(statementDates('2026-01-31',31,5,2).closesOn).toBe('2026-03-31');});
});
