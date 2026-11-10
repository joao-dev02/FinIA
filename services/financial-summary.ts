import { formatMoney } from '@/features/finance/domain';
export function financialSummary({income,expense,period}:{income:number;expense:number;period:string}) {
  return `No período ${period}, você registrou ${formatMoney(income)} em receitas e ${formatMoney(expense)} em despesas. Resultado: ${formatMoney(income-expense)}. Fonte: lançamentos confirmados do seu espaço, sem os estornados. Este é um cálculo determinístico, sem projeção de receitas ou despesas futuras.`;
}
