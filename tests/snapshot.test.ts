import {beforeEach,describe,it,expect,vi} from 'vitest';
vi.mock('server-only',()=>({}));
const stub=vi.hoisted(()=>({client:{auth:{getUser:vi.fn()},from:vi.fn(),rpc:vi.fn()}}));
vi.mock('../lib/supabase/server',()=>({supabaseServer:async()=>stub.client}));
import {readSnapshot} from '../server/finance/snapshot';
const userId='11111111-1111-4111-8111-111111111111';const workspaceId='22222222-2222-4222-8222-222222222222';
const base={name:'Meu espaço',accounts:[],transactions:[],events:[]};
describe('Compatibilidade da leitura financeira',()=>{
 beforeEach(()=>{vi.resetAllMocks();stub.client.auth.getUser.mockResolvedValue({data:{user:{id:userId,email:'test@example.com'}},error:null});stub.client.from.mockReturnValue({select:()=>({eq:()=>({order:()=>({limit:async()=>({data:[{workspace_id:workspaceId}],error:null})})})})});});
 it('usa snapshot estendido quando a fase 3 está instalada',async()=>{
  stub.client.rpc.mockResolvedValue({data:{...base,credit:{ready:true,cards:[],statements:[],installments:[],bills:[],rules:[]}},error:null});
  const s=await readSnapshot();expect(s.credit.ready).toBe(true);expect(stub.client.rpc).toHaveBeenCalledOnce();
 });
 it('mantém contas existentes acessíveis se somente a nova RPC está ausente',async()=>{
  stub.client.rpc.mockResolvedValueOnce({data:null,error:{code:'PGRST202'}}).mockResolvedValueOnce({data:null,error:{code:'PGRST202'}}).mockResolvedValueOnce({data:base,error:null});
  const s=await readSnapshot();expect(s.workspaceId).toBe(workspaceId);expect(s.credit.ready).toBe(false);expect(stub.client.rpc).toHaveBeenLastCalledWith('read_finai_snapshot',{p_workspace:workspaceId});
 });
 it('não esconde uma falha de autorização com fallback',async()=>{
  stub.client.rpc.mockResolvedValue({data:null,error:{code:'42501'}});await expect(readSnapshot()).rejects.toThrow();expect(stub.client.rpc).toHaveBeenCalledOnce();
 });
 it('não trunca silenciosamente centavos fora do intervalo seguro',async()=>{
  stub.client.rpc.mockResolvedValue({data:{...base,accounts:[{id:userId,name:'Conta',balance:'9007199254740993',archived:false}]},error:null});await expect(readSnapshot()).rejects.toThrow(/intervalo seguro/);
 });
 it('recusa workspace de outra pessoa antes de chamar a RPC',async()=>{
  await expect(readSnapshot('99999999-9999-4999-8999-999999999999')).rejects.toThrow('WORKSPACE_DENIED');expect(stub.client.rpc).not.toHaveBeenCalled();
 });
});
