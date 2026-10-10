export const SERVICE_LIMIT=1000;
export function reserve(budget,day,service){
 if(budget.version!==2)throw Error('BUDGET_MIGRATION_REQUIRED');
 if(!['list','detail'].includes(service))throw Error('INVALID_BUDGET_SERVICE');
 const usage=budget.serviceDays[day]??{list:0,detail:0};
 if(usage[service]>=SERVICE_LIMIT)throw Error('DAILY_BUDGET_EXHAUSTED');
 budget.serviceDays[day]=usage;usage[service]++;budget.days[day]=usage.list+usage.detail;
 return usage[service];
}
export function migrate(budget,day,listRequests,detailRequests){
 if(budget.version===2)return budget;
 // Two stored list probes and two detail probes (prior code30 + approval verification).
 const list=listRequests+2,detail=detailRequests+2;
 if(budget.days[day]!==list+detail)throw Error('BUDGET_RECONCILIATION_MISMATCH');
 return {...budget,version:2,serviceDays:{[day]:{list,detail}},migration:{at:new Date().toISOString(),day,priorCombined:budget.days[day],listProbes:2,detailProbes:2}};
}
