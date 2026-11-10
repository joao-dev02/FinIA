import type {FinancialReport,ReportContext} from '@/features/reports/domain';
export function csvCell(input:unknown){
 let value=String(input??'').replace(/\u0000/g,'');
 if(/^[\s\u0000-\u001f\u200b]*[=+\-@]/.test(value))value="'"+value;
 return '"'+value.replace(/"/g,'""')+'"';
}
export function reportCsv(report:FinancialReport,context:ReportContext){
 const header=['Espaço','Período','Data','Descrição','Tipo','Categoria','Conta','Origem','Natureza','Valor_centavos','Valor_BRL'];
 const rows=report.rows.map(t=>[context.workspaceName,report.filters.period,t.date,t.description,t.kind==='income'?'Receita':'Despesa',t.category,context.accounts.find(a=>a.id===t.accountId)?.name??t.accountLabel??'',t.source==='card'?'Cartão':'Conta',t.kind==='income'?'':({fixed:'Fixa',variable:'Variável',unspecified:'Não classificada'}[t.expenseBehavior??'unspecified']),String(t.amount),`${Math.floor(t.amount/100)},${String(t.amount%100).padStart(2,'0')}`]);
 return '\uFEFF'+[header,...rows].map(row=>row.map(csvCell).join(';')).join('\r\n')+'\r\n';
}
