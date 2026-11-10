import {describe,it,expect} from 'vitest';
import {buildReport,type ReportContext} from '../features/reports/domain';
import {csvCell,reportCsv} from '../services/reports/csv';
import {reportPdf,pdfText} from '../services/reports/pdf';
import {PDFDocument} from 'pdf-lib';
import {simulateGoal} from '../features/goals/domain';
const context:ReportContext={workspaceId:'w',workspaceName:'Pessoal',today:'2026-11-10',accounts:[{id:'a',workspaceId:'w',name:'Conta',initials:'C',color:'',openingBalance:0,balance:10000,reserved:2000}],transactions:[
 {id:'1',workspaceId:'w',accountId:'a',kind:'income',amount:50000,description:'Salário',date:'2026-11-01',category:'Salário'},
 {id:'2',workspaceId:'w',accountId:'a',kind:'expense',amount:10000,description:'Aluguel',date:'2026-11-02',category:'Moradia',expenseBehavior:'fixed'},
 {id:'3',workspaceId:'w',accountId:'a',kind:'expense',amount:99999,description:'Estornado',date:'2026-11-03',category:'Outros',reversed:true},
 {id:'4',workspaceId:'outro',accountId:'a',kind:'expense',amount:88888,description:'Outro tenant',date:'2026-11-03',category:'Outros'}
],credit:{ready:true,cards:[{id:'c',name:'Cartão',limit:10000,outstanding:3000,available:7000,closingDay:1,dueDay:10}],statements:[{id:'s',cardId:'c',closesOn:'2026-11-01',dueOn:'2026-11-15',closed:true,total:3000,paid:0,remaining:3000}],bills:[{id:'b',description:'Pendente',kind:'income',amount:1000,dueOn:'2026-11-09',status:'pending',ruleId:null}],installments:[],rules:[]}};
const filters={period:'2026-11',account:'',category:''};
describe('Relatórios e exportação',()=>{
 it('isola workspace e ignora estornados nos agregados',()=>{const r=buildReport(context,filters);expect(r.rows).toHaveLength(2);expect(r.totals).toEqual({income:50000,expense:10000});expect(r.behavior.fixed).toBe(10000);});
 it('reservas não duplicam patrimônio e projeção usa só pendências',()=>{const r=buildReport(context,filters);expect(r.position).toMatchObject({assets:10000,reserved:2000,debt:3000,net:7000,free:8000});expect(r.projection[0]).toMatchObject({income:1000,expense:3000,cash:8000,freeCash:6000});});
 it('filtros afetam lançamentos sem reescrever a posição atual do espaço',()=>{const r=buildReport(context,{...filters,category:'Moradia'});expect(r.rows).toHaveLength(1);expect(r.totals.income).toBe(0);expect(r.position.assets).toBe(10000);expect(r.months).toHaveLength(6);});
 it('recusa posição ou projeção que excederia a precisão segura',()=>{const extreme={...context,accounts:[{...context.accounts[0],balance:Number.MIN_SAFE_INTEGER,reserved:0}]};expect(()=>buildReport(extreme,filters)).toThrow(/intervalo seguro/);});
 it.each(['=HYPERLINK("x")',' +SUM(A1)','\t@SUM(1)','\r-1+1'])('protege fórmula CSV %s',value=>{expect(csvCell(value).startsWith('"\'')).toBe(true);});
 it('escapa aspas e preserva centavos, Unicode e filtros no CSV',()=>{const c={...context,workspaceName:'=fórmula',transactions:[{...context.transactions[0],description:'Receita; "especial" 🐧'}]};const csv=reportCsv(buildReport(c,filters),c);expect(csv.startsWith('\uFEFF')).toBe(true);expect(csv).toContain('"\'=fórmula"');expect(csv).toContain('"Receita; ""especial"" 🐧"');expect(csv).toContain('"50000";"500,00"');});
 it('gera PDF válido sem falhar por emoji ou descrição longa',async()=>{const c={...context,transactions:[{...context.transactions[0],description:'Relatório 🐧 '+ 'W'.repeat(100)}]};const bytes=await reportPdf(buildReport(c,filters),c);expect(new TextDecoder().decode(bytes.slice(0,5))).toBe('%PDF-');expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThan(0);expect(pdfText('ação🐧')).toBe('ação?');});
 it('simula prazo sem rendimentos e sem arredondar parcelas para baixo',()=>{expect(simulateGoal(10000,0,3333,'2026-01-31')).toMatchObject({months:4,estimatedOn:'2026-05-31'});expect(simulateGoal(10000,10000,0,'2026-01-01').months).toBe(0);expect(simulateGoal(10000,0,0,'2026-01-01').months).toBeNull();});
});
