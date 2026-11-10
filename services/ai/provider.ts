export interface AIProvider {
  readonly mode: 'mock' | 'live';
  summarize(input: { income: number; expense: number; period: string }, signal?: AbortSignal): Promise<{ text: string; source: string }>;
}
export const mockAI: AIProvider = {
  mode: 'mock',
  async summarize(input) {
    return { text: `No período ${input.period}, suas entradas superam as saídas em ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((input.income - input.expense) / 100)}. Este é um cálculo determinístico sobre os dados demonstrativos, sem previsão de receitas futuras.`, source: 'Lançamentos simulados do período selecionado' };
  }
};
