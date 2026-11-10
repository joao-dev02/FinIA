'use client';
import {useRef,useState} from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import {CreditCard,Plus,ShoppingBag,CalendarDays,ArrowUpRight,Repeat2,Check,X,ShieldCheck,Clock3} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {executeCreditCommand} from '@/server/finance/credit-actions';
import {formatMoney,parseMoney,splitInstallments,addCents} from '@/features/finance/domain';
import {statementDates,type CreditCommand} from './domain';
import {demoCredit} from '@/services/mock-credit';
import type {FinanceSnapshot} from '@/types/snapshot';
import type {Account} from '@/types/finance';

type Operation=CreditCommand['operation'];
const titles:Record<Operation,string>={card:'Novo cartão',purchase:'Nova compra no cartão','close-statement':'Fechar fatura','pay-statement':'Pagar fatura',advance:'Antecipar parcelas','cancel-purchase':'Cancelar compra',bill:'Nova conta a pagar ou receber',rule:'Nova recorrência','settle-bill':'Liquidar compromisso','cancel-bill':'Cancelar compromisso','cancel-rule':'Cancelar recorrência','generate-rules':'Atualizar próximos vencimentos'};
const descriptions:Record<Operation,string>={card:'Cadastre apenas o nome, limite e datas. Não informe número completo, CVV ou senha.',purchase:'A despesa integral entra na data da compra. As parcelas distribuem os vencimentos, sem retirar dinheiro da conta agora.','close-statement':'Após fechar, novas compras não poderão alterar este ciclo. Confira as parcelas antes de confirmar.','pay-statement':'O pagamento reduz seu saldo bancário e a dívida do cartão. Não cria uma nova despesa.',advance:'As primeiras parcelas futuras de faturas abertas serão movidas para esta fatura. Não há desconto ou alteração na dívida total.','cancel-purchase':'Cancela a compra inteira, libera o limite e preserva o histórico. Permitido somente antes do fechamento de qualquer fatura da compra.',bill:'Agendar não altera seu saldo. Confirme o pagamento ou recebimento quando acontecer.',rule:'Os próximos 12 meses serão preparados como compromissos pendentes. Nenhum pagamento é automático.','settle-bill':'Confirme apenas se o dinheiro já saiu ou entrou na conta selecionada.','cancel-bill':'Cancela este compromisso pendente sem alterar seu saldo. A recorrência, quando existir, continua para os outros meses.','cancel-rule':'Interrompe novas ocorrências e cancela compromissos pendentes de hoje em diante. Pagamentos e vencimentos anteriores ficam preservados.','generate-rules':'Estende a agenda até 12 meses à frente, sem duplicar competências e sem movimentar dinheiro.'};
const dateLabel=(date:string)=>date.split('-').reverse().join('/');

export function CreditPanel({section,snapshot,accounts,today,onSnapshot,hidden=false}:{section:'cards'|'bills';snapshot?:FinanceSnapshot;accounts:Account[];today:string;onSnapshot:(snapshot:FinanceSnapshot)=>void;hidden?:boolean}) {
 const demo=!snapshot;
 const data=snapshot?.credit??demoCredit;
 const canWrite=demo||!!snapshot?.workspaceId&&data.ready;
 const [selectedCard,setSelectedCard]=useState('');
 const [operation,setOperation]=useState<Operation|null>(null);
 const [target,setTarget]=useState('');
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 const key=useRef<string|null>(null);
 const [draftValue,setDraftValue]=useState('');
 const [draftCount,setDraftCount]=useState(1);
 const [draftDate,setDraftDate]=useState(today);
 const [billFilter,setBillFilter]=useState<'pending'|'paid'|'cancelled'>('pending');
 const card=data.cards.find(c=>c.id===selectedCard)??data.cards[0];
 const statements=data.statements.filter(s=>s.cardId===card?.id);
 const activeAccounts=accounts.filter(a=>!a.archived);
 const money=(cents:number)=>hidden?'••••••':formatMoney(cents);
 function open(op:Operation,id=''){setOperation(op);setTarget(id);setError('');setDraftValue('');setDraftCount(1);setDraftDate(today);}
 async function submit(event:React.FormEvent<HTMLFormElement>){
  event.preventDefault();if(demo||busy||!snapshot?.workspaceId)return;
  const fields=new FormData(event.currentTarget);const get=(name:string)=>String(fields.get(name)??'');
  key.current??=crypto.randomUUID();const common={workspaceId:snapshot.workspaceId,key:key.current};let command:CreditCommand;
  try{
   switch(operation){
    case 'card':command={...common,operation,name:get('name'),limit:parseMoney(get('amount')),closingDay:Number(get('closing')),dueDay:Number(get('due'))};break;
    case 'purchase':command={...common,operation,cardId:card!.id,amount:parseMoney(get('amount')),count:Number(get('count')),date:get('date'),description:get('description'),category:get('category')};break;
    case 'close-statement':command={...common,operation,statementId:target};break;
    case 'pay-statement':command={...common,operation,statementId:target,accountId:get('account'),amount:parseMoney(get('amount')),date:get('date')};break;
    case 'advance':command={...common,operation,statementId:target,count:Number(get('count'))};break;
    case 'cancel-purchase':command={...common,operation,purchaseId:target,reason:get('reason')};break;
    case 'bill':command={...common,operation,kind:get('kind') as 'income'|'expense',amount:parseMoney(get('amount')),dueOn:get('date'),description:get('description'),category:get('category')};break;
    case 'rule':command={...common,operation,kind:get('kind') as 'income'|'expense',amount:parseMoney(get('amount')),startOn:get('date'),cadence:Number(get('cadence')) as 1|12,description:get('description'),category:get('category')};break;
    case 'settle-bill':command={...common,operation,billId:target,accountId:get('account'),date:get('date')};break;
    case 'cancel-bill':command={...common,operation,billId:target};break;
    case 'cancel-rule':command={...common,operation,ruleId:target};break;
    case 'generate-rules':command={...common,operation};break;
    default:return;
   }
  }catch{setError('Use um valor positivo como 125,90, sem separador de milhares.');return;}
  setBusy(true);setError('');setNotice('');
  try{const result=await executeCreditCommand(command);if(!result.ok){setError(result.error);return;}onSnapshot(result.snapshot);key.current=null;setOperation(null);setNotice('Operação confirmada e salva no seu espaço.');}
  catch{setError('Resposta não confirmada. Confira o histórico ou tente novamente mantendo os mesmos dados.');}
  finally{setBusy(false);}
 }
 let preview:number[]=[];
 try{if(draftValue)preview=splitInstallments(parseMoney(draftValue),draftCount);}catch{/* Validation is shown on submit. */}
 const planned=(()=>{try{return operation==='purchase'&&card?statementDates(draftDate,card.closingDay,card.dueDay):null;}catch{return null;}})();
 const targetStatement=data.statements.find(s=>s.id===target);
 const targetBill=data.bills.find(b=>b.id===target);
 const pending=data.bills.filter(b=>b.status==='pending');
 const total=(kind:'income'|'expense')=>pending.filter(b=>b.kind===kind).reduce((a,b)=>addCents(a,b.amount),0);
 const list=data.bills.filter(b=>b.status===billFilter);
 if(!demo&&!snapshot.workspaceId)return <section className="panel credit-setup"><ShieldCheck size={30}/><h2>Crie seu espaço pessoal primeiro.</h2><p>Use o botão Criar meu espaço na barra acima. Depois você poderá cadastrar cartões e compromissos.</p></section>;
 if(!demo&&!data.ready)return <section className="panel credit-setup"><ShieldCheck size={30}/><h2>Seu módulo está pronto para conectar.</h2><p>Cartões e assinaturas precisam da atualização da fase 3 no banco. Suas contas e movimentações continuam disponíveis.</p><p>Depois da atualização, recarregue esta página.</p></section>;
 return <section className="credit-module">
  {demo&&<div className="module-note"><ShieldCheck size={17}/><span>Dados fictícios. Explore os formulários; gravações ficam disponíveis no espaço pessoal.</span></div>}
  {!demo&&!snapshot.workspaceId&&<div className="module-note"><ShieldCheck size={17}/>Crie seu espaço pessoal na barra acima para começar.</div>}
  {notice&&<div role="status" className="notice"><Check size={16}/>{notice}</div>}
  {section==='cards'?<>
   <div className="module-heading"><div><h2>Mais controle sobre o seu limite.</h2><p>Compras, parcelas e faturas em um só lugar.</p></div><Button disabled={!canWrite} onClick={()=>open('card')}><Plus size={16}/>Novo cartão</Button></div>
   <div className="credit-card-grid">{data.cards.map(c=><button key={c.id} onClick={()=>setSelectedCard(c.id)} className={`credit-card-tile ${card?.id===c.id?'selected':''}`} aria-pressed={card?.id===c.id}><div><span><CreditCard size={19}/>{c.name}</span><ArrowUpRight size={16}/></div><small>Limite disponível</small><strong>{money(c.available)}</strong><div className="credit-meter" role="meter" aria-label={`Limite utilizado de ${c.name}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(c.outstanding/c.limit*100)}><i style={{width:`${Math.min(100,c.outstanding/c.limit*100)}%`}}/></div><div className="credit-tile-foot"><span>Comprometido {money(c.outstanding)}</span><span>de {money(c.limit)}</span></div></button>)}</div>
   {!card?<div className="panel empty"><CreditCard size={30}/><h2>Seu primeiro cartão começa aqui.</h2><p>Adicione um cartão para registrar compras e acompanhar as próximas faturas.</p></div>:<>
    <div className="module-heading statement-heading"><div><h2>Faturas de {card.name}</h2><p>Fechamento dia {card.closingDay} · Vencimento dia {card.dueDay}</p></div><Button variant="outline" disabled={!canWrite} onClick={()=>open('purchase')}><ShoppingBag size={16}/>Nova compra</Button></div>
    <p className="accounting-note">A despesa é reconhecida integralmente na compra. As faturas abaixo mostram quando pagar.</p>
    <div className="statement-list">{statements.map(st=><article className="panel statement-card" key={st.id}><div className="statement-summary"><span className="statement-calendar"><CalendarDays size={20}/></span><div><h3>Vence em {dateLabel(st.dueOn)}</h3><small>Fecha em {dateLabel(st.closesOn)}</small></div><span className={`state-pill ${st.remaining===0?'paid':''}`}>{st.remaining===0?'Paga':st.closed?'Fechada':st.closesOn<=today?'Pronta para fechar':'Aberta'}</span></div><div className="statement-values"><div><small>Restante</small><strong>{money(st.remaining)}</strong></div><div><small>Total da fatura</small><span>{money(st.total)}</span></div><div><small>Já pago</small><span>{money(st.paid)}</span></div></div><details className="installment-details"><summary>Ver parcelas desta fatura</summary><ul>{data.installments.filter(i=>i.statementId===st.id).map(i=><li key={i.id}><span>{i.description}<small>{i.number} de {i.count}</small></span><strong>{money(i.amount)}</strong><button type="button" className="text-action" disabled={!canWrite||st.closed} onClick={()=>open('cancel-purchase',i.purchaseId)}>Cancelar compra</button></li>)}</ul></details><div className="statement-actions">{!st.closed?<><Button variant="outline" disabled={!canWrite||st.closesOn>today} onClick={()=>open('close-statement',st.id)}>Fechar fatura</Button><button disabled={!canWrite} onClick={()=>open('advance',st.id)}>Antecipar parcelas</button></>:st.remaining>0&&<Button disabled={!canWrite||!activeAccounts.length} onClick={()=>open('pay-statement',st.id)}>Registrar pagamento</Button>}</div></article>)}</div>
    {!statements.length&&<div className="panel empty"><p>As faturas aparecerão após sua primeira compra.</p></div>}
   </>}
  </>:<>
   <div className="module-heading"><div><h2>Seu futuro financeiro, organizado.</h2><p>Compromissos a pagar e receber, sem débitos automáticos.</p></div><div className="module-actions"><Button variant="outline" disabled={!canWrite} onClick={()=>open('bill')}><Plus size={16}/>Nova conta</Button><Button disabled={!canWrite} onClick={()=>open('rule')}><Repeat2 size={16}/>Nova recorrência</Button></div></div>
   <div className="commitment-stats"><article className="panel"><small>A pagar · agenda pendente</small><strong>{money(total('expense'))}</strong></article><article className="panel"><small>A receber · agenda pendente</small><strong>{money(total('income'))}</strong></article><article className="panel"><small>Recorrências ativas</small><strong>{data.rules.filter(r=>r.active).length}</strong></article></div>
   <div className="panel bills-panel"><div className="panel-heading"><div><h2>Agenda de compromissos</h2><p>Valores pendentes ainda não alteraram seu saldo.</p></div><label className="bill-filter"><span>Status</span><select aria-label="Status dos compromissos" value={billFilter} onChange={e=>setBillFilter(e.target.value as typeof billFilter)}><option value="pending">Pendentes</option><option value="paid">Liquidados</option><option value="cancelled">Cancelados</option></select></label></div><div className="bill-list">{list.map(b=><article className="bill-row" key={b.id}><span className={`bill-kind ${b.kind}`}><Clock3 size={18}/></span><div><h3>{b.description}</h3><small>{dateLabel(b.dueOn)} · {b.kind==='income'?'A receber':'A pagar'}{b.status==='pending'&&b.dueOn<today?' · Vencido':''}{b.ruleId?' · Recorrente':''}</small></div><strong>{money(b.amount)}</strong>{b.status==='pending'&&<Button variant="outline" disabled={!canWrite||!activeAccounts.length} onClick={()=>open('settle-bill',b.id)}>{b.kind==='income'?'Receber':'Pagar'}</Button>}{b.status==='pending'&&<button className="text-action" disabled={!canWrite} onClick={()=>open('cancel-bill',b.id)}>Cancelar conta</button>}</article>)}</div>{!list.length&&<div className="empty">Nenhum compromisso neste status.</div>}</div>
   <section className="panel rules-panel"><div className="panel-heading"><div><h2>Assinaturas e recorrências</h2><p>Mensais e anuais · vencimentos preparados para 12 meses.</p></div><button className="text-action" disabled={!canWrite} onClick={()=>open('generate-rules')}>Atualizar agenda <Repeat2 size={14}/></button></div><div className="rule-list">{data.rules.map(r=><article key={r.id}><span className="recurrence-icon"><Repeat2 size={18}/></span><div><h3>{r.description}</h3><small>{r.cadence===12?'Anual':'Mensal'} · {r.active?'Ativa':'Cancelada'}</small></div><strong>{money(r.amount)}</strong>{r.active&&<button className="text-action" disabled={!canWrite} onClick={()=>open('cancel-rule',r.id)}>Cancelar</button>}</article>)}</div>{!data.rules.length&&<div className="empty">Organize uma assinatura ou receita recorrente para começar.</div>}</section>
  </>}
  <Dialog.Root open={!!operation} onOpenChange={value=>{if(!value&&!busy)setOperation(null);}}><Dialog.Portal><Dialog.Overlay className="modal-overlay"/><Dialog.Content className="modal credit-modal"><Dialog.Title>{operation?titles[operation]:''}</Dialog.Title><Dialog.Description>{operation?descriptions[operation]:''}</Dialog.Description><Dialog.Close disabled={busy} className="modal-close" aria-label="Fechar"><X size={19}/></Dialog.Close><form onSubmit={submit}>
   {operation==='card'&&<><label>Nome do cartão<input name="name" required maxLength={80}/></label><label>Limite total em R$<input name="amount" inputMode="decimal" placeholder="0,00" required/></label><div className="form-row"><label>Dia de fechamento<input name="closing" type="number" min={1} max={31} defaultValue={5} required/></label><label>Dia de vencimento<input name="due" type="number" min={1} max={31} defaultValue={15} required/></label></div><p className="form-hint">Dias 29 a 31 são ajustados ao último dia de cada mês.</p></>}
   {['purchase','bill','rule'].includes(operation??'')&&<><label>Descrição<input name="description" required minLength={2} maxLength={120}/></label><label>Categoria<input name="category" required maxLength={60} defaultValue={operation==='purchase'?'Compras':'Assinaturas'}/></label></>}
   {['bill','rule'].includes(operation??'')&&<label>Tipo<select name="kind"><option value="expense">A pagar</option><option value="income">A receber</option></select></label>}
   {['purchase','bill','rule','pay-statement'].includes(operation??'')&&<label>{operation==='pay-statement'?'Valor do pagamento em R$':'Valor em R$'}<input name="amount" inputMode="decimal" required placeholder="0,00" value={draftValue} onChange={e=>setDraftValue(e.target.value)}/></label>}
   {['purchase','advance'].includes(operation??'')&&<label>{operation==='advance'?'Quantidade de parcelas futuras':'Número de parcelas'}<input name="count" type="number" min={1} max={120} required value={draftCount} onChange={e=>setDraftCount(Number(e.target.value))}/></label>}
   {['purchase','bill','rule','pay-statement','settle-bill'].includes(operation??'')&&<label>{operation==='rule'?'Primeiro vencimento':operation==='bill'?'Vencimento':'Data'}<input name="date" type="date" required min="1900-01-01" max={['purchase','pay-statement','settle-bill'].includes(operation??'')?today:'2100-12-31'} value={draftDate} onChange={e=>setDraftDate(e.target.value)}/></label>}
   {operation==='rule'&&<label>Frequência<select name="cadence"><option value="1">Mensal</option><option value="12">Anual</option></select></label>}
   {['pay-statement','settle-bill'].includes(operation??'')&&<label>Conta<select name="account" required>{activeAccounts.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>}
   {operation==='purchase'&&preview.length>0&&<div className="confirmation-box"><strong>{preview.length} parcela{preview.length>1?'s':''} · total {money(preview.reduce((a,b)=>a+b,0))}</strong><span>Primeira: {money(preview[0])}{preview.length>1?` · Última: ${money(preview.at(-1)!)}`:''}</span>{planned&&<span>Primeiro vencimento: {dateLabel(planned.dueOn)}</span>}</div>}
   {targetStatement&&<div className="confirmation-box"><strong>{card?.name} · {dateLabel(targetStatement.dueOn)}</strong><span>Restante na fatura: {money(targetStatement.remaining)}</span></div>}
   {['settle-bill','cancel-bill'].includes(operation??'')&&targetBill&&<div className="confirmation-box"><strong>{targetBill.description}</strong><span>{targetBill.kind==='income'?'Recebimento':'Pagamento'} de {money(targetBill.amount)}</span></div>}
   {operation==='cancel-purchase'&&<><div className="confirmation-box"><strong>{data.installments.find(i=>i.purchaseId===target)?.description}</strong><span>A despesa original ficará marcada como cancelada.</span></div><label>Motivo do cancelamento<input name="reason" minLength={2} maxLength={120} required/></label></>}
   {operation==='cancel-rule'&&<div className="confirmation-box"><strong>{data.rules.find(r=>r.id===target)?.description}</strong><span>Os compromissos pendentes futuros serão cancelados.</span></div>}
   {demo&&<p className="form-hint">Esta é uma prévia. Entre no espaço pessoal para confirmar operações.</p>}{error&&<p role="alert" className="error">{error}</p>}
   <Button type="submit" disabled={demo||busy}>{busy?'Salvando…':'Confirmar e salvar'}</Button><button disabled={busy} type="button" onClick={()=>setOperation(null)}>Cancelar</button>
  </form></Dialog.Content></Dialog.Portal></Dialog.Root>
 </section>;
}
