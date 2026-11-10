'use server';
import {goalCommandSchema} from '@/features/goals/domain';
import {supabaseServer} from '@/lib/supabase/server';
import {readSnapshot} from './snapshot';
import type {CommandResult} from './actions';
export async function executeGoalCommand(input:unknown):Promise<CommandResult>{
 const parsed=goalCommandSchema.safeParse(input);if(!parsed.success)return {ok:false,error:parsed.error.issues[0]?.message??'Confira os campos.'};
 let committed=false;
 try{
  const client=await supabaseServer();const {data:{user},error:authError}=await client.auth.getUser();if(authError||!user)return {ok:false,error:'Sua sessão expirou. Entre novamente.'};
  const c=parsed.data;const base={p_workspace:c.workspaceId,p_key:c.key};let result;
  switch(c.operation){
   case 'goal':result=await client.rpc('create_finai_goal',{...base,p_name:c.name,p_target:c.target,p_deadline:c.deadline});break;
   case 'reserve':case 'release':result=await client.rpc('allocate_finai_goal',{...base,p_goal:c.goalId,p_account:c.accountId,p_amount:c.amount,p_direction:c.operation});break;
   case 'edit-goal':result=await client.rpc('manage_finai_goal',{...base,p_goal:c.goalId,p_version:c.version,p_name:c.name,p_target:c.target,p_deadline:c.deadline,p_archive:false});break;
   case 'archive-goal':result=await client.rpc('manage_finai_goal',{...base,p_goal:c.goalId,p_version:c.version,p_name:null,p_target:null,p_deadline:null,p_archive:true});break;
   case 'classify-expense':result=await client.rpc('classify_finai_expense',{...base,p_event:c.eventId,p_behavior:c.behavior});break;
  }
  if(result.error){
   const messages:Record<string,string>={funds_reserved:'A conta não tem saldo livre suficiente para essa reserva.',release_exceeds_reserved:'O valor supera a reserva desta meta na conta selecionada.',goal_target_exceeded:'A reserva ultrapassaria o valor-alvo da meta.',goal_version_conflict:'A meta foi alterada em outra sessão. Recarregue antes de editar.',goal_target_below_reserved:'O novo valor-alvo é menor que a reserva existente.',goal_still_reserved:'Libere as reservas antes de arquivar esta meta.',idempotency_conflict:'Esta tentativa já foi usada com outros dados. Recarregue e confira o histórico.'};
   for(const [code,message] of Object.entries(messages))if(result.error.message.includes(code))return {ok:false,error:message};
   return {ok:false,error:result.error.code==='PGRST202'?'A atualização de metas ainda não foi aplicada ao banco.':'Não foi possível concluir. Confira os dados e sua permissão.'};
  }
  committed=true;return {ok:true,snapshot:await readSnapshot(c.workspaceId)};
 }catch{return {ok:false,committed,error:committed?'Operação registrada. Recarregue para atualizar o painel antes de repetir.':'Resposta não confirmada. Confira o histórico ou tente novamente sem alterar os dados.'};}
}
