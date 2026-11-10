'use client';
import { useRef, useState } from 'react';
import { LogOut, Plus, ArrowLeftRight, History, Archive, ShieldCheck } from 'lucide-react';
import * as Dialog from '@radix-ui/react-dialog';
import { Button } from '@/components/ui/button';
import { executeFinanceCommand } from '@/server/finance/actions';
import { signOut } from '@/app/auth/actions';
import { formatMoney, parseMoney, parseSignedMoney } from './domain';
import type { FinanceSnapshot } from '@/types/snapshot';
import type { FinanceCommand } from './commands';

export function LiveControls({ snapshot, onSnapshot, hidden = false }: { snapshot: FinanceSnapshot; onSnapshot: (snapshot: FinanceSnapshot) => void; hidden?: boolean }) {
  const [operation,setOperation]=useState<'account'|'transfer'|'reverse'|'archive'|null>(null);
  const [error,setError]=useState('');
  const [pending,setPending]=useState(false);
  const [status,setStatus]=useState('');
  const key=useRef<string|null>(null);
  const active=snapshot.accounts.filter(a=>!a.archived);
  async function run(command: FinanceCommand) {
    setPending(true);setError('');setStatus('');
    try {
      const result=await executeFinanceCommand(command);
      if(!result.ok){setError(result.error);return;}
      onSnapshot(result.snapshot);setOperation(null);key.current=null;setStatus('Operação confirmada e salva no seu espaço.');
    }catch{setError('Não foi possível confirmar a resposta. Mantenha os dados e tente novamente ou recarregue para conferir o histórico.');}
    finally{setPending(false);}
  }
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if(!snapshot.workspaceId || pending)return;
    const data=new FormData(event.currentTarget);
    const get=(name:string)=>String(data.get(name)??'');
    key.current??=crypto.randomUUID();
    const common={workspaceId:snapshot.workspaceId,key:key.current};
    try {
      if(operation==='account')void run({...common,operation,name:get('name'),kind:get('kind') as 'bank'|'wallet'|'cash',opening:parseSignedMoney(get('opening')),date:get('date')});
      if(operation==='transfer')void run({...common,operation,sourceId:get('source'),destinationId:get('destination'),amount:parseMoney(get('amount')),date:get('date'),description:get('description')});
      if(operation==='reverse')void run({...common,operation,eventId:get('event'),reason:get('reason')});
      if(operation==='archive')void run({...common,operation,accountId:get('account')});
    }catch{setError('Confira os valores. Use o formato 125,90, sem separador de milhares.');}
  }
  const labels={account:'Adicionar conta',transfer:'Transferir entre contas',reverse:'Estornar lançamento',archive:'Arquivar conta'};
  return <section className="live-controls">
    {!snapshot.workspaceId?<div className="welcome-real"><ShieldCheck size={28}/><div><h2>Bem-vindo ao seu espaço.</h2><p>Comece sem dados fictícios. Crie seu espaço e adicione sua primeira conta.</p></div><Button disabled={pending} onClick={()=>void run({operation:'initialize'})}>{pending?'Criando…':'Criar meu espaço'}</Button></div>:<div className="live-toolbar"><span><ShieldCheck size={16}/> Dados salvos no seu Supabase</span><div><Button variant="outline" onClick={()=>{setOperation('account');setError('');}}><Plus size={15}/>Adicionar conta</Button><Button variant="outline" disabled={active.length<2} onClick={()=>{setOperation('transfer');setError('');}}><ArrowLeftRight size={15}/>Transferir</Button><Button variant="outline" onClick={()=>{setOperation('reverse');setError('');}}><History size={15}/>Estornar</Button><Button variant="outline" onClick={()=>{setOperation('archive');setError('');}}><Archive size={15}/>Arquivar</Button></div></div>}
    <div className="session-info"><span>{snapshot.email}</span><form action={signOut}><button type="submit"><LogOut size={13}/>Sair da conta</button></form></div>
    {!!snapshot.events.length && <details className="activity-history"><summary>Histórico de operações · {snapshot.events.length}</summary><ul>{snapshot.events.map(event=><li key={event.id}><span><strong>{event.description}</strong><small>{event.date.split('-').reverse().join('/')} · {{income:'Receita',expense:'Despesa',transfer:'Transferência',opening:'Saldo inicial',reversal:'Estorno'}[event.kind]}{event.reversed?' · Estornado':''}</small></span><span>{hidden?'••••••':event.amount===undefined?'':formatMoney(event.amount)}</span></li>)}</ul></details>}
    {status && <p role="status" className="notice">{status}</p>}
    {!operation && error && <p className="error" role="alert">{error}</p>}
    <Dialog.Root open={operation!==null} onOpenChange={value=>{if(!value&&!pending)setOperation(null);}}><Dialog.Portal><Dialog.Overlay className="modal-overlay"/><Dialog.Content className="modal"><Dialog.Title>{operation?labels[operation]:''}</Dialog.Title><Dialog.Description>{operation==='transfer'?'O valor sai de uma conta e entra na outra, sem contar como receita ou despesa.':operation==='reverse'?'O estorno cria um registro inverso e preserva o histórico. O lançamento original fica fora dos totais de receitas e despesas.':operation==='archive'?'A conta deve ter saldo zero. Seu histórico será preservado.':'Informe o saldo atual como saldo inicial. Ele não será contado como receita.'}</Dialog.Description><form onSubmit={submit}>
      {operation==='account' && <><label>Nome da conta<input required name="name" maxLength={80}/></label><label>Tipo<select name="kind"><option value="bank">Conta bancária</option><option value="wallet">Carteira digital</option><option value="cash">Dinheiro físico</option></select></label><label>Saldo inicial em R$<input name="opening" defaultValue="0" inputMode="decimal" required/></label><label>Data do saldo<input name="date" type="date" defaultValue={snapshot.today} max={snapshot.today} required/></label></>}
      {operation==='transfer' && <><label>Conta de origem<select name="source" required>{active.map(a=><option value={a.id} key={a.id}>{a.name}</option>)}</select></label><label>Conta de destino<select name="destination" defaultValue={active[1]?.id} required>{active.map(a=><option value={a.id} key={a.id}>{a.name}</option>)}</select></label><label>Valor em R$<input name="amount" inputMode="decimal" required placeholder="0,00"/></label><label>Data<input name="date" type="date" defaultValue={snapshot.today} max={snapshot.today} required/></label><label>Descrição<input name="description" required minLength={2} maxLength={120} defaultValue="Transferência entre contas"/></label></>}
      {operation==='reverse' && <><label>Lançamento<select name="event" required><option value="">Selecione um lançamento</option>{snapshot.events.filter(e=>!e.reversed&&!['reversal','opening'].includes(e.kind)).map(e=><option key={e.id} value={e.id}>{e.date.split('-').reverse().join('/')} · {e.description}</option>)}</select></label><label>Motivo do estorno<input name="reason" minLength={2} maxLength={120} required/></label></>}
      {operation==='archive' && <label>Conta<select name="account" required><option value="">Selecione uma conta</option>{active.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>}
      {error && <p role="alert" className="error">{error}</p>}
      <Button disabled={pending} type="submit">{pending?'Salvando…':operation==='reverse'?'Confirmar estorno':operation==='archive'?'Confirmar arquivamento':'Confirmar e salvar'}</Button><button type="button" disabled={pending} onClick={()=>setOperation(null)}>Cancelar</button>
    </form></Dialog.Content></Dialog.Portal></Dialog.Root>
  </section>;
}
