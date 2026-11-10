import type {GoalSnapshot} from '@/types/goals';
export const demoGoals:GoalSnapshot={ready:true,
 goals:[{id:'demo-goal-1',name:'Reserva de emergência',target:1000000,deadline:'2027-06-30',reserved:200000,version:1,archived:false},{id:'demo-goal-2',name:'Próxima viagem',target:500000,deadline:'2027-03-31',reserved:100000,version:1,archived:false}],
 allocations:[{goalId:'demo-goal-1',accountId:'nubank',reserved:200000},{goalId:'demo-goal-2',accountId:'inter',reserved:100000}],
 history:[{id:'demo-reserve-1',goalId:'demo-goal-1',accountId:'nubank',amount:200000,date:'2026-11-05'},{id:'demo-reserve-2',goalId:'demo-goal-2',accountId:'inter',amount:100000,date:'2026-11-05'}]
};
