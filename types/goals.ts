export type Goal={id:string;name:string;target:number;deadline:string;reserved:number;version:number;archived:boolean};
export type GoalAllocation={goalId:string;accountId:string;reserved:number};
export type GoalHistory={id:string;goalId:string;accountId:string;amount:number;date:string};
export type GoalSnapshot={ready:boolean;goals:Goal[];allocations:GoalAllocation[];history:GoalHistory[]};
export type ExpenseBehavior='fixed'|'variable'|'unspecified';
