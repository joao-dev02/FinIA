import {beforeEach,describe,it,expect,vi} from 'vitest';
const mocks=vi.hoisted(()=>({readSnapshot:vi.fn()}));
vi.mock('../server/finance/snapshot',()=>({readSnapshot:mocks.readSnapshot}));
import {GET} from '../app/api/reports/export/route';
const workspace='11111111-1111-4111-8111-111111111111';const request=()=>new Request(`http://localhost/api/reports/export?period=2026-11&format=csv&workspace=${workspace}`);
describe('Autorização de exportações',()=>{
 beforeEach(()=>{vi.resetAllMocks();});
 it('exige sessão e não armazena resposta em cache compartilhado',async()=>{mocks.readSnapshot.mockRejectedValue(new Error('UNAUTHORIZED'));const response=await GET(request());expect(response.status).toBe(401);expect(response.headers.get('Cache-Control')).toBe('private, no-store');});
 it('recusa workspace não autorizado e repassa o workspace para validação',async()=>{mocks.readSnapshot.mockRejectedValue(new Error('WORKSPACE_DENIED'));const response=await GET(request());expect(response.status).toBe(403);expect(mocks.readSnapshot).toHaveBeenCalledWith(workspace);});
 it('rejeita formato e filtros inválidos antes de consultar dados',async()=>{const response=await GET(new Request('http://localhost/api/reports/export?period=2026-99&format=html&workspace=x'));expect(response.status).toBe(400);expect(mocks.readSnapshot).not.toHaveBeenCalled();});
 it('entrega CSV como arquivo privado para um espaço autorizado',async()=>{
  mocks.readSnapshot.mockResolvedValue({workspaceId:workspace,workspaceName:'Meu espaço',today:'2026-11-10',accounts:[],transactions:[],credit:{ready:true,cards:[],statements:[],bills:[],rules:[],installments:[]}});
  const response=await GET(request());expect(response.status).toBe(200);expect(response.headers.get('Content-Disposition')).toContain('attachment;');expect(response.headers.get('Content-Type')).toContain('text/csv');expect(await response.text()).toContain('Valor_centavos');
 });
});
