'use client';

import { useMemo, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useForm } from 'react-hook-form';
import { motion, MotionConfig } from 'framer-motion';
import dynamic from 'next/dynamic';
import { ArrowDownLeft, ArrowUpRight, Bell, ChartNoAxesCombined, ChevronDown, ChevronRight, CircleHelp, CreditCard, Eye, EyeOff, Goal, LayoutDashboard, Plus, Search, Settings2, Sparkles, Wallet, X, ArrowLeftRight, CalendarDays, Check, PanelLeftClose } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { accounts as demoAccounts, transactions, workspaceId as demoWorkspaceId } from '@/services/mock-finance';
import { executeFinanceCommand } from '@/server/finance/actions';
import { LiveControls } from '@/features/finance/live-controls';
import type { FinanceSnapshot } from '@/types/snapshot';
import { accountBalance, addCents, formatMoney, parseMoney, summarize, transactionSchema } from '@/features/finance/domain';
import { mockAI } from '@/services/ai/provider';
import { financialSummary } from '@/services/financial-summary';
import type { Transaction } from '@/types/finance';

const CashFlowChart = dynamic(() => import('./cash-flow-chart'), { ssr: false, loading: () => <div className='empty'>Carregando gráfico…</div> });
const navigation = [ { label: 'Visão geral', icon: LayoutDashboard }, { label: 'Movimentações', icon: ArrowLeftRight }, { label: 'Contas e carteiras', icon: Wallet }, { label: 'Cartões', icon: CreditCard }, { label: 'Contas e assinaturas', icon: CalendarDays }, { label: 'Metas', icon: Goal }, { label: 'Relatórios', icon: ChartNoAxesCombined } ];
type FormValues = { description: string; value: string; kind: 'income' | 'expense'; date: string; category: string; accountId: string };

export function Dashboard({ initialState }: { initialState?: FinanceSnapshot }) {
  const live=!!initialState;
  const [snapshot,setSnapshot]=useState(initialState);
  const accounts=snapshot?.accounts??demoAccounts;
  const workspaceId=snapshot?.workspaceId??demoWorkspaceId;
  const mutationKey=useRef<string|null>(null);
  const [saving,setSaving]=useState(false);
  const today=initialState?.today??'2026-11-09';
  function applySnapshot(value: FinanceSnapshot) { setSnapshot(value); setEntries(value.transactions); setInsight(''); }
  const [entries, setEntries] = useState(initialState?.transactions??transactions);
  const [active, setActive] = useState('Visão geral');
  const [period, setPeriod] = useState(today.slice(0,7));
  const [hidden, setHidden] = useState(false);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const [insight, setInsight] = useState('');
  const [loading, setLoading] = useState(false);
  const [notifications, setNotifications] = useState(false);
  const form = useForm<FormValues>({ defaultValues: { description: '', value: '', kind: 'expense', date: today, category: 'Alimentação', accountId: accounts.find(a=>!a.archived)?.id??'' } });
  const filtered = useMemo(() => entries.filter(t => t.date.startsWith(period) && !t.reversed), [entries, period]);
  const totals = summarize(filtered);
  const balance = accounts.reduce((a, account) => addCents(a, accountBalance(account, entries)), 0);
  const money = (n: number) => hidden ? '••••••' : formatMoney(n);
  const categories = Object.entries(filtered.filter(t => t.kind === 'expense').reduce<Record<string, number>>((a, t) => ({ ...a, [t.category]: (a[t.category] || 0) + t.amount }), {})).sort((a,b) => b[1]-a[1]);
  const chart = Array.from({ length: new Date(Number(period.slice(0,4)),Number(period.slice(5)),0).getDate() }, (_, i) => { const day = i + 1; const toDate = filtered.filter(t => Number(t.date.slice(-2)) <= day); const s = summarize(toDate); return { day: String(day).padStart(2, '0'), income: s.income / 100, expense: s.expense / 100 }; });
  const displayed = entries.filter(t=>t.date.startsWith(period)).filter(t => `${t.description} ${t.category}`.toLowerCase().includes(query.toLowerCase()));
  async function generateInsight() { if (hidden) { setNotice('Mostre os valores para visualizar o resumo.'); return; } setLoading(true); try { if(live){setInsight(financialSummary({...totals,period}));return;} const result = await mockAI.summarize({ ...totals, period }); setInsight(result.text); } finally { setLoading(false); } }
  async function addTransaction(values: FormValues) {
    try {
      const parsed = transactionSchema.parse({ ...values, amount: parseMoney(values.value), workspaceId });
      if (!accounts.some(a => a.id === parsed.accountId && a.workspaceId === parsed.workspaceId)) throw new Error('Conta inválida.');
      if(live) {
        if(saving)return; setSaving(true); mutationKey.current??=crypto.randomUUID();
        try {
          const result=await executeFinanceCommand({operation:'transaction',key:mutationKey.current,...parsed});
          if(!result.ok){form.setError('value',{message:result.error});return;}
          applySnapshot(result.snapshot);mutationKey.current=null;setOpen(false);form.reset({...values,description:'',value:''});setNotice('Movimentação confirmada e salva no seu espaço.');return;
        } catch { form.setError('value',{message:'Resposta não confirmada. Confira o histórico ou tente novamente sem alterar os dados.'});return; }
        finally{setSaving(false);}
      }
      setEntries(current => [{ ...parsed, id: crypto.randomUUID() }, ...current]);
      setInsight(''); setOpen(false); form.reset(); setNotice('Movimentação adicionada à demonstração. Os dados serão descartados ao recarregar.');
    } catch { form.setError('value', { message: 'Confira os campos. Use valor positivo, como 125,90, e uma data válida.' }); }
  }
  return <MotionConfig reducedMotion="user"><div className="app-shell">
    <aside className="sidebar">
      <a className="brand" href={live?"/":"/demo"} aria-label="FinAI início"><span className="brand-mark"><ChartNoAxesCombined size={23}/></span>fin<span>ai</span><span className="brand-dot">.</span></a>
      <div className="workspace"><span className="workspace-avatar">P</span><div><strong>{snapshot?.workspaceName??'Meu espaço'}</strong><small>Finanças pessoais</small></div><ChevronDown size={15}/></div>
      <p className="nav-label">PRINCIPAL</p>
      <nav aria-label="Navegação principal">{navigation.map(({label,icon: Icon}) => <button key={label} className={`nav-item ${active===label?'active':''}`} onClick={() => setActive(label)}><Icon size={18}/><span>{label}</span>{active===label && <span className="active-dot"/>}</button>)}</nav>
      <div className="sidebar-assistant"><span className="spark-icon"><Sparkles size={20}/></span><strong>Mais clareza. Menos esforço.</strong><p>Um novo olhar sobre suas finanças, com inteligência.</p><button onClick={() => { setActive('Visão geral'); void generateInsight(); }}>Conhecer o assistente <ArrowUpRight size={15}/></button></div>
      <div className="sidebar-bottom"><button onClick={() => setNotice(live?'Sua sessão e seus dados estão conectados ao Supabase. Use Sair da conta na barra acima para encerrar a sessão.':'Acesse a página inicial para entrar no seu espaço pessoal.')}><Settings2 size={17}/>Configurações</button><button onClick={() => setNotice(live?'Adicione contas, registre receitas e despesas e transfira entre contas. Estornos preservam o histórico.':'Demonstração local: use Nova movimentação para testar. Nada é enviado a serviços externos.')}><CircleHelp size={17}/>Ajuda e suporte</button><div className="profile"><span>VC</span><div><strong>Você</strong><small>{live?'Conta pessoal':'Conta demonstrativa'}</small></div><PanelLeftClose size={17}/></div></div>
    </aside>
    <main>
      <header className="topbar"><div className="breadcrumb">Meu espaço <ChevronRight size={13}/><strong>{active}</strong><select className="mobile-section-select" aria-label="Navegar para" value={active} onChange={e=>setActive(e.target.value)}>{navigation.map(n=><option key={n.label}>{n.label}</option>)}</select></div><div className="header-right"><span className="demo-badge"><span/> {live?'Espaço pessoal':'Ambiente demonstrativo'}</span><button className="icon-button" aria-label="Notificações" onClick={() => setNotifications(!notifications)}><Bell size={19}/><i/></button><span className="avatar">VC</span></div></header>
      <div className="content">
        <div className="page-heading"><div><div className="eyebrow">SEU DINHEIRO, COM CLAREZA</div><h1>{active === 'Visão geral' ? 'Tudo sob controle.' : active}</h1><p>{active === 'Visão geral' ? 'Um olhar completo para suas finanças e seus próximos passos.' : 'Seu espaço financeiro, organizado em um só lugar.'}</p></div><div className="heading-actions"><label className="period"><CalendarDays size={16}/>{live?<input type="month" aria-label="Período" value={period} max={today.slice(0,7)} onChange={e=>{if(e.target.value){setPeriod(e.target.value);setInsight('');}}}/>:<select aria-label="Período" value={period} onChange={e => {setPeriod(e.target.value);setInsight('');}}><option value="2026-11">Novembro, 2026</option><option value="2026-10">Outubro, 2026</option></select>}</label><Button disabled={live&&!accounts.some(a=>!a.archived)} onClick={() => { form.setValue('accountId',accounts.find(a=>!a.archived)?.id??'');setOpen(true); }}><Plus size={17}/>Nova movimentação</Button></div></div>
        {notifications && <div className="notification-panel"><strong>{live?'Notificações':'Você está em uma demonstração'}</strong><p>{live?'Alertas automáticos estarão disponíveis em uma próxima etapa. Seus lançamentos já são persistidos no seu espaço.':'Alertas e vencimentos são exemplos ilustrativos. Nenhuma notificação real está agendada.'}</p></div>}
        {snapshot && <LiveControls snapshot={snapshot} onSnapshot={applySnapshot} hidden={hidden}/>}
        {notice && <div className="notice" role="status"><Check size={17}/>{notice}<button aria-label="Fechar aviso" onClick={() => setNotice('')}><X size={16}/></button></div>}
        {(active === 'Visão geral' || active === 'Relatórios') && <>
          <section className="stats" aria-label="Resumo financeiro">
            {[{label:'Saldo total',value:balance,icon:Wallet,detail:`Disponível em ${accounts.filter(a=>!a.archived).length} contas`,className:'balance'}, {label:'Receitas do mês',value:totals.income,icon:ArrowDownLeft,detail:`${filtered.filter(t=>t.kind==='income').length} entradas no período`,className:'income'}, {label:'Despesas do mês',value:totals.expense,icon:ArrowUpRight,detail:`${filtered.filter(t=>t.kind==='expense').length} saídas no período`,className:'expense'}, {label:'Resultado do mês',value:totals.income-totals.expense,icon:ChartNoAxesCombined,detail:'Receitas menos despesas',className:'result'}].map(({label,value,icon:Icon,detail,className},i) => <motion.article initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} transition={{delay:i*.06}} className={`stat-card ${className}`} key={label}><div className="stat-label">{label}<Icon size={17}/></div><strong>{money(value)}</strong><div className="stat-detail"><span className="tiny-dot"/>{detail}</div>{i===0 && <button className="balance-eye" aria-label={hidden?'Mostrar valores':'Ocultar valores'} onClick={() => { setHidden(!hidden); setInsight(''); }}>{hidden?<EyeOff size={15}/>:<Eye size={15}/>}</button>}</motion.article>)}
          </section>
          <section className="insight"><span className="insight-symbol"><Sparkles size={23}/></span><div><div className="insight-title">Seu resumo inteligente <span>{live?'RESUMO LOCAL · SEM IA':'PRÉVIA · SEM IA REAL'}</span></div><p>{insight || 'Seus números contam uma história. Explore um resumo das entradas e saídas deste mês.'}</p></div><button disabled={loading} onClick={() => void generateInsight()}>{loading?'Preparando…':insight?'Atualizar resumo':'Ver meu resumo'}<ArrowUpRight size={17}/></button></section>
          <div className="charts-grid"><section className="panel flow"><div className="panel-heading"><div><h2>Fluxo de caixa</h2><p>Entradas e saídas acumuladas no período</p></div><span className="small-chip">Mensal</span></div><div className="chart-legend"><span><i className="blue"/>Receitas</span><span><i className="purple"/>Despesas</span></div><div className={`chart ${hidden?'values-hidden':''}`} aria-label="Gráfico de receitas e despesas acumuladas"><CashFlowChart data={chart} hidden={hidden}/></div><div className="chart-foot"><span>{live?'Valores registrados no seu espaço':'Valores realizados · dados simulados'}</span><strong>BRL</strong></div></section>
          <section className="panel categories"><div className="panel-heading"><div><h2>Para onde vai seu dinheiro</h2><p>Despesas por categoria</p></div><ChartNoAxesCombined size={17}/></div>{categories.length ? <><div className="category-total"><span>Total de despesas</span><strong>{money(totals.expense)}</strong></div><div className="category-bar">{categories.map(([name,amount],i)=><div key={name} style={{width:`${amount/totals.expense*100}%`,background:['#60a5fa','#a99ae2','#e4bb77'][i%3]}}/>)}</div><div className="category-list">{categories.map(([name,amount],i)=><div key={name}><span><i style={{background:['#60a5fa','#a99ae2','#e4bb77'][i%3]}}/>{name}</span><strong>{money(amount)}</strong><small>{Math.round(amount/totals.expense*100)}%</small></div>)}</div></>:<div className="empty">Nenhuma despesa neste período.</div>}<div className="panel-footer">Cada escolha faz parte do seu futuro.</div></section></div>
        </>}
        {(active === 'Visão geral' || active === 'Contas e carteiras') && <section className="accounts-section"><div className="section-title"><h2>Suas contas <span>{String(accounts.filter(a=>!a.archived).length).padStart(2,'0')}</span></h2><button onClick={() => active==='Visão geral'?setActive('Contas e carteiras'):setNotice(live?'Use Adicionar conta ou Transferir na barra acima. Conciliação será disponibilizada em etapa posterior.':'Cadastro de contas disponível no espaço pessoal. Entre pela página inicial.')}>Gerenciar contas <ArrowUpRight size={15}/></button></div><div className="account-grid">{accounts.filter(a=>!a.archived).map(account => <article className="account-card" key={account.id}><span className="bank-logo" style={{background:`${account.color}15`,color:account.color}}>{account.initials}</span><div><strong>{account.name}</strong><small>{account.id==='wallet'?'Dinheiro físico':'Conta corrente'}</small></div><span className="account-value">{money(accountBalance(account, entries))}</span></article>)}</div></section>}
        {(active === 'Visão geral' || active === 'Movimentações') && <section className="panel transactions"><div className="panel-heading"><div><h2>Últimas movimentações</h2><p>Os detalhes que fazem a diferença</p></div><label className="search"><Search size={15}/><input placeholder="Buscar movimentação" aria-label="Buscar movimentação" value={query} onChange={e=>setQuery(e.target.value)}/></label></div><div className="table-scroll"><table><thead><tr><th>Descrição</th><th>Categoria</th><th>Conta</th><th>Data</th><th className="align-right">Valor</th></tr></thead><tbody>{displayed.slice(0,active==='Visão geral'?5:undefined).map(t=><tr key={t.id} className={t.reversed?'reversed':''}><td><div className="transaction-description"><span className={`transaction-icon ${t.kind}`}>{t.kind==='income'?<ArrowDownLeft size={17}/>:<ArrowUpRight size={17}/>}</span><strong>{t.description}{t.reversed && <small> · Estornado</small>}</strong></div></td><td><span className="category-chip">{t.category}</span></td><td>{accounts.find(a=>a.id===t.accountId)?.name}</td><td>{t.date.split('-').reverse().slice(0,2).join('/')}</td><td className={`align-right amount ${t.kind}`}>{t.kind==='income'?'+':'−'} {money(t.amount)}</td></tr>)}</tbody></table></div>{!displayed.length && <div className="empty">Nenhuma movimentação encontrada.</div>}{active==='Visão geral' && <button className="table-more" onClick={()=>setActive('Movimentações')}>Ver todas as movimentações <ChevronRight size={14}/></button>}</section>}
        {['Cartões','Contas e assinaturas','Metas'].includes(active) && <section className="panel phase-placeholder"><span className="insight-symbol"><Sparkles size={25}/></span><h2>{active}: próxima etapa</h2><p>{live?'Este módulo será conectado em uma próxima etapa. Contas, receitas, despesas e transferências já estão disponíveis no seu espaço.':'Este módulo está planejado na arquitetura. A demonstração utiliza lançamentos simulados.'}</p><Button onClick={()=>setActive('Visão geral')}>Voltar à visão geral</Button></section>}
        <footer className="footer"><span><span className="tiny-dot"/> {live?'Dados pessoais · PostgreSQL · Histórico preservado':'Demonstração · Dados fictícios · Alterações somente em memória'}</span><span>Feito para cuidar do seu amanhã.</span></footer>
      </div>
    </main>
    <nav className="mobile-nav" aria-label="Navegação móvel">{navigation.slice(0,4).map(({label,icon:Icon})=><button aria-label={label} className={active===label?'selected':''} key={label} onClick={()=>setActive(label)}><Icon size={20}/><span>{label==='Contas e carteiras'?'Contas':label}</span></button>)}<button aria-label="Nova movimentação" onClick={()=>setOpen(true)}><Plus size={23}/><span>Adicionar</span></button></nav>
    <Dialog.Root open={open} onOpenChange={value=>{if(!saving)setOpen(value);}}><Dialog.Portal><Dialog.Overlay className="modal-overlay"/><Dialog.Content className="modal"><Dialog.Title>Nova movimentação</Dialog.Title><Dialog.Description>{live?'Revise os dados antes de confirmar. O lançamento será salvo no seu espaço.':'Confirme um lançamento na demonstração local. Os dados não serão persistidos.'}</Dialog.Description><Dialog.Close className="modal-close" aria-label="Fechar"><X size={20}/></Dialog.Close><form onSubmit={form.handleSubmit(addTransaction)}><label>Descrição<input required minLength={2} maxLength={120} {...form.register('description')}/></label><div className="form-row"><label>Tipo<select {...form.register('kind')}><option value="expense">Despesa</option><option value="income">Receita</option></select></label><label>Valor em R$<input required inputMode="decimal" placeholder="0,00" {...form.register('value')}/></label></div><div className="form-row"><label>Data<input required type="date" max={live?today:undefined} {...form.register('date')}/></label><label>Conta<select {...form.register('accountId')}>{accounts.filter(a=>!a.archived).map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label></div><label>Categoria<select {...form.register('category')}>{['Alimentação','Moradia','Transporte','Saúde','Lazer','Assinaturas','Projetos','Salário','Outros'].map(c=><option key={c}>{c}</option>)}</select></label>{form.formState.errors.value && <p className="error" role="alert">{form.formState.errors.value.message}</p>}<Button disabled={saving} type="submit"><Check size={17}/>{saving?'Salvando…':live?'Confirmar e salvar':'Confirmar lançamento simulado'}</Button></form></Dialog.Content></Dialog.Portal></Dialog.Root>
  </div></MotionConfig>;
}
