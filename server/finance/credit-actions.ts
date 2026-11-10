'use server';
import {creditCommandSchema} from '@/features/credit/domain';
import {supabaseServer} from '@/lib/supabase/server';
import {readSnapshot} from './snapshot';
import type {CommandResult} from './actions';
export async function executeCreditCommand(input:unknown):Promise<CommandResult> {
 const parsed=creditCommandSchema.safeParse(input);
 if(!parsed.success)return {ok:false,error:parsed.error.issues[0]?.message??'Confira os campos.'};
 let committed=false;
 try{
  const client=await supabaseServer();
  const {data:{user},error:authError}=await client.auth.getUser();
  if(authError||!user)return {ok:false,error:'Sua sessão expirou. Entre novamente.'};
  const c=parsed.data;const base={p_workspace:c.workspaceId,p_key:c.key};let result;
  switch(c.operation){
   case 'card':result=await client.rpc('create_finai_card',{...base,p_name:c.name,p_limit:c.limit,p_closing:c.closingDay,p_due:c.dueDay});break;
   case 'purchase':result=await client.rpc('purchase_finai_card',{...base,p_card:c.cardId,p_amount:c.amount,p_count:c.count,p_date:c.date,p_description:c.description,p_category:c.category});break;
   case 'close-statement':result=await client.rpc('close_finai_statement',{...base,p_statement:c.statementId});break;
   case 'pay-statement':result=await client.rpc('pay_finai_statement',{...base,p_statement:c.statementId,p_account:c.accountId,p_amount:c.amount,p_date:c.date});break;
   case 'advance':result=await client.rpc('advance_finai_installments',{...base,p_statement:c.statementId,p_count:c.count});break;
   case 'cancel-purchase':result=await client.rpc('cancel_finai_purchase',{...base,p_purchase:c.purchaseId,p_reason:c.reason});break;
   case 'bill':result=await client.rpc('schedule_finai_bill',{...base,p_kind:c.kind,p_amount:c.amount,p_due:c.dueOn,p_description:c.description,p_category:c.category});break;
   case 'rule':result=await client.rpc('create_finai_rule',{...base,p_kind:c.kind,p_amount:c.amount,p_start:c.startOn,p_cadence:c.cadence,p_description:c.description,p_category:c.category});break;
   case 'settle-bill':result=await client.rpc('settle_finai_bill',{...base,p_bill:c.billId,p_account:c.accountId,p_date:c.date});break;
   case 'cancel-bill':result=await client.rpc('cancel_finai_bill',{...base,p_bill:c.billId});break;
   case 'cancel-rule':result=await client.rpc('cancel_finai_rule',{...base,p_rule:c.ruleId});break;
   case 'generate-rules':result=await client.rpc('generate_finai_rules',base);break;
  }
  if(result.error){
   const messages:Record<string,string>={card_limit_exceeded:'Esta compra excede o limite disponível.',statement_closed:'A fatura já foi fechada. Revise a data ou o ciclo.',statement_not_closed:'Feche a fatura antes de registrar um pagamento.',statement_not_due_to_close:'Ainda não chegou a data de fechamento desta fatura.',payment_exceeds_remaining:'O pagamento excede o valor restante da fatura.',not_enough_future_installments:'Não há essa quantidade de parcelas futuras em faturas abertas.',bill_not_pending:'Esta conta já foi liquidada ou cancelada. Atualize o painel.',idempotency_conflict:'Esta tentativa já foi usada com outros dados. Recarregue para conferir o histórico.',recurrence_start_too_old:'A recorrência pode começar no máximo 12 meses atrás.'};
   messages.purchase_has_closed_statement='Esta compra já está em uma fatura fechada. Cancelamentos de compras fechadas ou pagas precisam de ajuste específico e não são suportados nesta etapa.';
   messages.already_reversed='Esta compra já foi cancelada. Recarregue o painel.';
   messages.funds_reserved='O saldo necessário está reservado em metas. Libere a reserva antes de pagar.';
   for(const [code,message] of Object.entries(messages))if(result.error.message.includes(code))return {ok:false,error:message};
   return {ok:false,error:result.error.code==='PGRST202'?'A atualização de cartões e assinaturas ainda não foi aplicada ao seu banco.':'Não foi possível concluir. Confira os dados e sua permissão no espaço.'};
  }
  committed=true;
  return {ok:true,snapshot:await readSnapshot(c.workspaceId)};
 }catch{return {ok:false,committed,error:committed?'Operação registrada, mas o painel não foi atualizado. Recarregue antes de repetir.':'Resposta não confirmada. Confira o histórico ou tente novamente com os mesmos dados.'};}
}
