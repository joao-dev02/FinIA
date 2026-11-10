'use server';
import { financeCommandSchema } from '@/features/finance/commands';
import { supabaseServer } from '@/lib/supabase/server';
import { readSnapshot } from './snapshot';
import type { FinanceSnapshot } from '@/types/snapshot';
export type CommandResult = { ok: true; snapshot: FinanceSnapshot } | { ok: false; error: string; committed?: boolean };
export async function executeFinanceCommand(input: unknown): Promise<CommandResult> {
  const parsed = financeCommandSchema.safeParse(input);
  if (!parsed.success) return {ok:false,error:parsed.error.issues[0]?.message ?? 'Confira os campos.'};
  let committed=false;
  try {
    const client=await supabaseServer();
    const {data:{user},error:authError}=await client.auth.getUser();
    if(authError || !user) return {ok:false,error:'Sua sessão expirou. Entre novamente.'};
    const c=parsed.data;
    let result;
    switch(c.operation) {
      case 'initialize':result=await client.rpc('initialize_finai');break;
      case 'account':result=await client.rpc('create_finai_account',{p_workspace:c.workspaceId,p_key:c.key,p_name:c.name,p_kind:c.kind,p_opening:c.opening,p_date:c.date});break;
      case 'transaction':result=await client.rpc('post_finai_transaction',{p_workspace:c.workspaceId,p_key:c.key,p_account:c.accountId,p_kind:c.kind,p_amount:c.amount,p_date:c.date,p_description:c.description,p_category:c.category});break;
      case 'transfer':result=await client.rpc('transfer_finai',{p_workspace:c.workspaceId,p_key:c.key,p_source:c.sourceId,p_destination:c.destinationId,p_amount:c.amount,p_date:c.date,p_description:c.description});break;
      case 'reverse':result=await client.rpc('reverse_finai',{p_workspace:c.workspaceId,p_key:c.key,p_event:c.eventId,p_reason:c.reason});break;
      case 'archive':result=await client.rpc('archive_finai_account',{p_workspace:c.workspaceId,p_account:c.accountId});break;
    }
    if(result.error) {
      const message=result.error.message;
      if(message.includes('idempotency_conflict'))return {ok:false,error:'Esta tentativa já foi usada com outros dados. Atualize a página antes de tentar novamente.'};
      if(message.includes('already_reversed'))return {ok:false,error:'Este lançamento já foi estornado. Atualize a página.'};
      if(message.includes('nonzero_balance'))return {ok:false,error:'Transfira o saldo restante antes de arquivar esta conta.'};
      if(message.includes('funds_reserved'))return {ok:false,error:'Este valor está reservado em metas. Libere a reserva antes de movimentar a conta.'};
      return {ok:false,error:'Não foi possível concluir. Confira os dados e sua permissão no espaço.'};
    }
    committed=true;
    return {ok:true,snapshot:await readSnapshot(c.operation==='initialize'?undefined:c.workspaceId)};
  } catch { return {ok:false,committed,error:committed?'Operação registrada, mas o painel não foi atualizado. Recarregue a página antes de repetir.':'Conexão indisponível. Tente novamente mantendo os mesmos dados.'}; }
}
