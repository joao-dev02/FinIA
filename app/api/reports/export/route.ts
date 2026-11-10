import {z} from 'zod';
import {readSnapshot} from '@/server/finance/snapshot';
import {buildReport,reportFiltersSchema} from '@/features/reports/domain';
import {reportCsv} from '@/services/reports/csv';
const querySchema=reportFiltersSchema.extend({format:z.enum(['csv','pdf']),workspace:z.uuid()});
export async function GET(request:Request){
 const query=querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
 const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
 if(!query.success)return Response.json({error:'Filtros de exportação inválidos.'},{status:400,headers});
 try{
  const q=query.data;const snapshot=await readSnapshot(q.workspace);
  if(!snapshot.workspaceId)return Response.json({error:'Crie seu espaço antes de exportar.'},{status:409,headers});
  const context={...snapshot,workspaceId:snapshot.workspaceId};const report=buildReport(context,q);
  if(report.rows.length>5000)return Response.json({error:'A exportação excede 5.000 lançamentos. Use filtros mais específicos.'},{status:413,headers});
  const fileHeaders={...headers,'Content-Disposition':`attachment; filename="finai-${q.period}.${q.format}"`};
  if(q.format==='csv')return new Response(reportCsv(report,context),{headers:{...fileHeaders,'Content-Type':'text/csv; charset=utf-8'}});
  const {reportPdf}=await import('@/services/reports/pdf');const bytes=await reportPdf(report,context);
  return new Response(new Uint8Array(bytes),{headers:{...fileHeaders,'Content-Type':'application/pdf'}});
 }catch(error){
  const message=error instanceof Error?error.message:'';
  return Response.json({error:message==='UNAUTHORIZED'?'Entre novamente para exportar.':message==='WORKSPACE_DENIED'?'Você não tem acesso a esse espaço.':'Não foi possível gerar o relatório.'},{status:message==='UNAUTHORIZED'?401:message==='WORKSPACE_DENIED'?403:503,headers});
 }
}
