'use client';
import {useRef,useState} from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import {Goal as GoalIcon,Plus,ArrowDownToLine,ArrowUpFromLine,Pencil,Archive,X,History} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {executeGoalCommand} from '@/server/finance/goal-actions';
import {accountBalance,addCents,formatMoney,parseMoney} from '@/features/finance/domain';
import {simulateGoal,type GoalCommand} from './domain';
import {demoGoals} from '@/services/mock-goals';
import type {FinanceSnapshot} from '@/types/snapshot';
import type {Account,Transaction} from '@/types/finance';

type Operation='goal'|'reserve'|'release'|'edit-goal'|'archive-goal';
const labels:Record<Operation,string>={goal:'Nova meta',reserve:'Reservar para a meta',release:'Liberar reserva','edit-goal':'Editar meta','archive-goal':'Arquivar meta'};
const dateLabel=(v:string)=>v.split('-').reverse().join('/');
export function GoalsPanel({snapshot,accounts,entries,today,onSnapshot,hidden=false}:{snapshot?:FinanceSnapshot;accounts:Account[];entries:Transaction[];today:string;onSnapshot:(s:FinanceSnapshot)=>void;hidden?:boolean}){
 const demo=!snapshot;const data=snapshot?.goals??demoGoals;
 const [operation,setOperation]=useState<Operation|null>(null);const [target,setTarget]=useState('');const [pending,setPending]=useState(false);const [error,setError]=useState('');const [notice,setNotice]=useState('');const key=useRef<string|null>(null);
 const [filter,setFilter]=useState<'active'|'archived'>('active');const [simGoal,setSimGoal]=useState('');const [monthly,setMonthly]=useState('500,00');const [accountId,setAccountId]=useState('');
 const active=data.goals.filter(g=>!g.archived);const goal=data.goals.find(g=>g.id===target);const simulationGoal=active.find(g=>g.id===simGoal)??active[0];const availableAccounts=accounts.filter(a=>!a.archived);
 const money=(amount:number)=>hidden?'••••••':formatMoney(amount);
 const reserved=accounts.reduce((s,a)=>addCents(s,a.reserved??0),0);const cash=accounts.reduce((s,a)=>addCents(s,accountBalance(a,entries)),0);
 const selectedAccount=accounts.find(a=>a.id===accountId);const held=data.allocations.find(a=>a.goalId===target&&a.accountId===accountId)?.reserved??0;
 let contribution=0;try{contribution=parseMoney(monthly);}catch{/* Empty simulation input is valid while editing. */}
 const simulation=simulationGoal?simulateGoal(simulationGoal.target,simulationGoal.reserved,contribution,today):null;
 const formAccounts=operation==='release'?availableAccounts.filter(a=>data.allocations.some(x=>x.goalId===target&&x.accountId===a.id&&x.reserved>0)):availableAccounts;
 function open(op:Operation,id=''){setOperation(op);setTarget(id);setError('');setAccountId(op==='release'?data.allocations.find(a=>a.goalId===id&&a.reserved>0)?.accountId??'':availableAccounts[0]?.id??'');}
 async function submit(event:React.FormEvent<HTMLFormElement>){
  event.preventDefault();if(demo||pending||!snapshot?.workspaceId)return;
  const form=new FormData(event.currentTarget);const get=(name:string)=>String(form.get(name)??'');key.current??=crypto.randomUUID();const common={workspaceId:snapshot.workspaceId,key:key.current};let command:GoalCommand;
  try{
   if(operation==='goal')command={...common,operation,name:get('name'),target:parseMoney(get('amount')),deadline:get('deadline')};
   else if(operation==='edit-goal'&&goal)command={...common,operation,goalId:goal.id,version:goal.version,name:get('name'),target:parseMoney(get('amount')),deadline:get('deadline')};
   else if(operation==='archive-goal'&&goal)command={...common,operation,goalId:goal.id,version:goal.version};
   else if((operation==='reserve'||operation==='release')&&goal)command={...common,operation,goalId:goal.id,accountId:get('account'),amount:parseMoney(get('amount'))};
   else return;
  }catch{setError('Use um valor positivo como 125,90.');return;}
  setPending(true);setError('');setNotice('');
  try{const result=await executeGoalCommand(command);if(!result.ok){setError(result.error);return;}onSnapshot(result.snapshot);key.current=null;setOperation(null);setNotice('Meta atualizada. O saldo bancário não foi alterado.');}
  catch{setError('Resposta não confirmada. Confira o histórico ou repita sem alterar os dados.');}finally{setPending(false);}
 }
 if(!demo&&(!snapshot.workspaceId||!data.ready))return <section className="panel credit-setup"><GoalIcon size={30}/><h2>{snapshot.workspaceId?'Suas metas estão prontas para conectar.':'Crie seu espaço pessoal primeiro.'}</h2><p>{snapshot.workspaceId?'Aplique a atualização da fase 4 no banco e recarregue. Suas contas e cartões continuam disponíveis.':'Use Criar meu espaço na barra acima para começar.'}</p></section>;
 return <section className="goals-module">
  {demo&&<div className="module-note">Demonstração com reservas fictícias. Os formulários são prévias sem gravação.</div>}{notice&&<p className="notice" role="status">{notice}</p>}
  <div className="module-heading"><div><h2>Dê um destino ao seu dinheiro.</h2><p>Reservas dentro das suas contas, sem duplicar saldos.</p></div><Button onClick={()=>open('goal')}><Plus size={16}/>Nova meta</Button></div>
  <div className="commitment-stats"><article className="panel"><small>Saldo nas contas</small><strong>{money(cash)}</strong></article><article className="panel"><small>Separado para metas</small><strong>{money(reserved)}</strong></article><article className="panel"><small>Livre de reservas</small><strong>{money(cash-reserved)}</strong></article></div>
  <div className="section-title"><h2>Seus objetivos</h2><label className="bill-filter"><select aria-label="Status das metas" value={filter} onChange={e=>setFilter(e.target.value as typeof filter)}><option value="active">Ativas</option><option value="archived">Arquivadas</option></select></label></div>
  <div className="goal-grid">{data.goals.filter(g=>g.archived===(filter==='archived')).map(g=><article key={g.id} className="panel goal-card"><div className="goal-title"><span><GoalIcon size={20}/></span><div><h3>{g.name}</h3><small>Prazo {dateLabel(g.deadline)}{g.deadline<today&&g.reserved<g.target?' · Em atraso':''}</small></div><strong>{Math.round(g.reserved/g.target*100)}%</strong></div><div className="goal-amount"><strong>{money(g.reserved)}</strong><span>de {money(g.target)}</span></div><div className="goal-progress" role="progressbar" aria-label={`Progresso de ${g.name}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100,Math.round(g.reserved/g.target*100))}><i style={{width:`${Math.min(100,g.reserved/g.target*100)}%`}}/></div><p>Faltam {money(Math.max(0,g.target-g.reserved))}</p><div className="goal-accounts">{data.allocations.filter(a=>a.goalId===g.id).map(a=><span key={a.accountId}>{accounts.find(account=>account.id===a.accountId)?.name}: {money(a.reserved)}</span>)}</div>{!g.archived&&<div className="goal-actions"><Button variant="outline" disabled={!availableAccounts.length||g.reserved>=g.target} onClick={()=>open('reserve',g.id)}><ArrowDownToLine size={14}/>Reservar</Button><button disabled={!g.reserved} onClick={()=>open('release',g.id)}><ArrowUpFromLine size={14}/>Liberar</button><button aria-label={`Editar ${g.name}`} onClick={()=>open('edit-goal',g.id)}><Pencil size={15}/></button><button disabled={g.reserved>0} title={g.reserved?'Libere a reserva antes de arquivar':'Arquivar meta'} aria-label={`Arquivar ${g.name}`} onClick={()=>open('archive-goal',g.id)}><Archive size={15}/></button></div>}</article>)}</div>
  {!data.goals.some(g=>g.archived===(filter==='archived'))&&<div className="panel empty">Nenhuma meta neste status.</div>}
  {!!active.length&&<section className="panel goal-simulator"><div><h2>Planeje seu próximo passo</h2><p>Simulação com contribuição constante, sem rendimentos. Não movimenta dinheiro.</p></div><div className="simulation-inputs"><label>Objetivo<select aria-label="Objetivo da simulação" value={simulationGoal?.id??''} onChange={e=>setSimGoal(e.target.value)}>{active.map(g=><option value={g.id} key={g.id}>{g.name}</option>)}</select></label><label>Contribuição mensal em R$<input aria-label="Contribuição mensal em R$" inputMode="decimal" value={monthly} onChange={e=>setMonthly(e.target.value)}/></label></div>{simulation?.estimatedOn&&simulationGoal&&simulation.estimatedOn>simulationGoal.deadline&&<p className="form-hint">Nesse ritmo, a data estimada ultrapassa o prazo escolhido.</p>}<div className="simulation-result" role="status">{simulation?.months===0?'Meta já alcançada.':simulation?.months?`Com ${money(contribution)} por mês: ${simulation.months} meses${simulation.estimatedOn?`, até ${dateLabel(simulation.estimatedOn)}`:''}.`:'Informe uma contribuição mensal positiva para simular.'}</div></section>}
  {!!data.history.length&&<details className="activity-history"><summary><History size={14}/> Histórico de reservas</summary><ul>{data.history.map(h=><li key={h.id}><span><strong>{data.goals.find(g=>g.id===h.goalId)?.name}</strong><small>{dateLabel(h.date)} · {accounts.find(a=>a.id===h.accountId)?.name} · {h.amount>0?'Reservado':'Liberado'}</small></span><span>{money(Math.abs(h.amount))}</span></li>)}</ul></details>}
  <Dialog.Root open={!!operation} onOpenChange={value=>{if(!value&&!pending)setOperation(null);}}><Dialog.Portal><Dialog.Overlay className="modal-overlay"/><Dialog.Content className="modal"><Dialog.Title>{operation?labels[operation]:''}</Dialog.Title><Dialog.Description>{operation==='reserve'?'Esse valor fica separado na conta escolhida. Libere a reserva antes de gastá-lo ou transferi-lo.':operation==='release'?'Libera dinheiro reservado para uso na própria conta, sem gerar receita.':operation==='archive-goal'?'O objetivo fica no histórico. Reservas devem estar zeradas.':'Defina valor-alvo e prazo. Alterar uma meta não cria nem remove dinheiro.'}</Dialog.Description><Dialog.Close disabled={pending} className="modal-close" aria-label="Fechar"><X size={19}/></Dialog.Close><form onSubmit={submit}>
   {['goal','edit-goal'].includes(operation??'')&&<><label>Nome da meta<input name="name" required maxLength={80} defaultValue={goal?.name??''}/></label><label>Valor-alvo em R$<input name="amount" required inputMode="decimal" defaultValue={goal?(goal.target/100).toFixed(2).replace('.',','):''}/></label><label>Prazo<input type="date" name="deadline" min={today} max="2100-12-31" required defaultValue={goal?.deadline??''}/></label></>}
   {['reserve','release'].includes(operation??'')&&<><label>Conta<select name="account" required value={accountId} onChange={e=>setAccountId(e.target.value)}>{formAccounts.map(a=><option value={a.id} key={a.id}>{a.name}</option>)}</select></label><label>Valor em R$<input name="amount" required inputMode="decimal" placeholder="0,00"/></label><div className="confirmation-box"><strong>{goal?.name}</strong><span>{operation==='release'?`Reservado nesta conta: ${money(held)}`:`Saldo livre na conta: ${money(selectedAccount?accountBalance(selectedAccount,entries)-(selectedAccount.reserved??0):0)}`}</span></div></>}
   {operation==='archive-goal'&&<div className="confirmation-box"><strong>{goal?.name}</strong></div>}{error&&<p className="error" role="alert">{error}</p>}{demo&&<p className="form-hint">Entre no espaço pessoal para confirmar operações.</p>}
   <Button disabled={demo||pending} type="submit">{pending?'Salvando…':'Confirmar e salvar'}</Button><button type="button" disabled={pending} onClick={()=>setOperation(null)}>Cancelar</button>
  </form></Dialog.Content></Dialog.Portal></Dialog.Root>
 </section>;
}
