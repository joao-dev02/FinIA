import type {CreditSnapshot} from '@/types/credit';
export const demoCardId='demo-card';
export const demoCredit:CreditSnapshot={
 ready:true,
 cards:[{id:demoCardId,name:'Cartão principal',limit:800000,outstanding:120000,available:680000,closingDay:5,dueDay:15}],
 statements:[
  {id:'demo-statement-1',cardId:demoCardId,closesOn:'2026-11-05',dueOn:'2026-11-15',closed:false,total:40000,paid:0,remaining:40000},
  {id:'demo-statement-2',cardId:demoCardId,closesOn:'2026-12-05',dueOn:'2026-12-15',closed:false,total:40000,paid:0,remaining:40000},
  {id:'demo-statement-3',cardId:demoCardId,closesOn:'2027-01-05',dueOn:'2027-01-15',closed:false,total:40000,paid:0,remaining:40000}
 ],
 installments:[1,2,3].map(n=>({id:`demo-installment-${n}`,statementId:`demo-statement-${n}`,purchaseId:'demo-purchase',description:'Equipamento de trabalho',number:n,count:3,amount:40000})),
 bills:[{id:'demo-bill-1',description:'Aluguel',kind:'expense',amount:210000,dueOn:'2026-12-05',status:'pending',ruleId:'demo-rule-1'},{id:'demo-bill-2',description:'Spotify Premium',kind:'expense',amount:2190,dueOn:'2026-12-07',status:'pending',ruleId:'demo-rule-2'},{id:'demo-bill-3',description:'Projeto · Site institucional',kind:'income',amount:320000,dueOn:'2026-11-20',status:'pending',ruleId:null}],
 rules:[{id:'demo-rule-1',description:'Aluguel',kind:'expense',amount:210000,cadence:1,nextOn:'2027-11-05',active:true},{id:'demo-rule-2',description:'Spotify Premium',kind:'expense',amount:2190,cadence:1,nextOn:'2027-11-07',active:true}]
};
