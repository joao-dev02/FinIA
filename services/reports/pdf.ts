import {PDFDocument,StandardFonts,rgb,type PDFPage} from 'pdf-lib';
import type {FinancialReport,ReportContext} from '@/features/reports/domain';
import {formatMoney} from '@/features/finance/domain';
export function pdfText(text:string){return [...text.replace(/[\r\n\t]/g,' ')].map(c=>{const n=c.codePointAt(0)!;return n>=32&&n<=126||n>=160&&n<=255?c:'?';}).join('');}
export async function reportPdf(report:FinancialReport,context:ReportContext){
 if(report.rows.length>5000)throw new Error('EXPORT_TOO_LARGE');
 const pdf=await PDFDocument.create();const font=await pdf.embedFont(StandardFonts.Helvetica);const bold=await pdf.embedFont(StandardFonts.HelveticaBold);
 pdf.setTitle('FinAI - Relatório financeiro');pdf.setAuthor('FinAI');
 let page:PDFPage;let y=0;
 function newPage(){page=pdf.addPage([595,842]);y=796;page.drawText('FinAI | Relatório financeiro',{x:36,y,size:17,font:bold,color:rgb(.12,.3,.56)});y-=24;}
 function line(text:string,size=10,strong=false){
  const selected=strong?bold:font;let remaining=pdfText(text);
  do{
   let length=remaining.length;
   if(selected.widthOfTextAtSize(remaining,size)>520){let lo=1,hi=length;while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(selected.widthOfTextAtSize(remaining.slice(0,mid),size)<=520)lo=mid;else hi=mid-1;}length=lo;const space=remaining.lastIndexOf(' ',length);if(space>length/2)length=space;}
   if(y<45)newPage();page.drawText(remaining.slice(0,length),{x:36,y,size,font:selected});y-=size+8;remaining=remaining.slice(length).trimStart();
  }while(remaining);
 }
 newPage();line(`Espaço: ${context.workspaceName.slice(0,80)}`);line(`Período: ${report.filters.period} | Emitido em ${context.today}`);
 line(`Filtro de conta: ${report.filters.account?context.accounts.find(a=>a.id===report.filters.account)?.name??context.credit.cards.find(c=>c.id===report.filters.account)?.name??report.filters.account:'Todas'}`);
 line(`Categoria: ${report.filters.category||'Todas'}`);line('Base de competência: compra integral no cartão; pagamento de fatura não duplica despesa.',8);
 y-=8;line(`Receitas: ${formatMoney(report.totals.income)} | Despesas: ${formatMoney(report.totals.expense)}`,11,true);line(`Resultado: ${formatMoney(report.totals.income-report.totals.expense)}`,11,true);
 y-=6;line('Posição atual do espaço completo (todos os saldos):',10,true);line(`Contas: ${formatMoney(report.position.assets)} | Reservas: ${formatMoney(report.position.reserved)}`);line(`Dívida em cartões: ${formatMoney(report.position.debt)} | Posição líquida: ${formatMoney(report.position.net)}`);
 if(!report.position.creditComplete)line('Dados parciais: módulo de cartões ainda não conectado.',9);
 y-=8;line('Projeção do espaço: apenas compromissos pendentes cadastrados, sem garantia de realização.',8);
 for(const p of report.projection)line(`${p.period} | Entradas previstas ${formatMoney(p.income)} | Saídas previstas ${formatMoney(p.expense)} | Saldo simulado ${formatMoney(p.cash)}`,8);
 y-=8;line(`Lançamentos confirmados filtrados: ${report.rows.length}`,11,true);
 for(const row of report.rows){if(y<100)newPage();line(`${row.date} | ${row.kind==='income'?'Receita':'Despesa'} | ${formatMoney(row.amount)}`,9,true);line(`${row.description.slice(0,100)} | ${row.category.slice(0,60)}`,9);line(`Origem: ${row.accountLabel??context.accounts.find(a=>a.id===row.accountId)?.name??row.accountId}`,8);y-=3;}
 const pages=pdf.getPages();pages.forEach((p,i)=>p.drawText(`FinAI | Página ${i+1}/${pages.length} | CSV preserva descrições completas e caracteres especiais.`,{x:36,y:22,size:7,font,color:rgb(.4,.45,.5)}));
 return pdf.save();
}
