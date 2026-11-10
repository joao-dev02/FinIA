export type Card={id:string;name:string;limit:number;outstanding:number;available:number;closingDay:number;dueDay:number};
export type Statement={id:string;cardId:string;closesOn:string;dueOn:string;closed:boolean;total:number;paid:number;remaining:number};
export type Installment={id:string;statementId:string;purchaseId:string;description:string;number:number;count:number;amount:number};
export type Bill={id:string;description:string;kind:'income'|'expense';amount:number;dueOn:string;status:'pending'|'paid'|'cancelled';ruleId:string|null};
export type RecurringRule={id:string;description:string;kind:'income'|'expense';amount:number;cadence:number;nextOn:string;active:boolean};
export type CreditSnapshot={ready:boolean;cards:Card[];statements:Statement[];installments:Installment[];bills:Bill[];rules:RecurringRule[]};
