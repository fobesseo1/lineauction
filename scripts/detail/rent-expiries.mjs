// 전월세 계약 만기 → public.market_rent_expiries ('곧 나올 전세'). No API call: the warehouse already keeps
// MOLIT's contractTerm in each row's raw answer.
//   node scripts/detail/rent-expiries.mjs [--months 36] [--kinds apt] [--dry-run]
import {DatabaseSync} from 'node:sqlite';
import {arg,flag,fetchAll,db,sleep,upsert} from './common.mjs';
import {contractTerm,expiryRows} from './core.mjs';
import {placeId} from '../molit/summary.mjs';

const months=Number(arg('--months','36')),kinds=arg('--kinds','apt').split(',');
const now=new Date(Date.now()+9*3600e3);
const start=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()-months,1)).toISOString().slice(0,10);
// Keep last month too: a contract ending last month may still be on the market.
const fromMonth=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()-1,1)).toISOString().slice(0,7);
const runAt=new Date().toISOString();

const places=new Map((await fetchAll('market_places','id,kapt_code',q=>q.in('kind',kinds),'id')).map(p=>[p.id,p.kapt_code]));
const wh=new DatabaseSync('data/molit/warehouse.sqlite',{readOnly:true});
const contracts=[];let scanned=0,noTerm=0,noPlace=0;
for(const t of wh.prepare(`select kind,lawd,umd,jibun,area,deal_date,deposit,monthly_rent,contract_type,cancel_date,json_extract(raw,'$.contractTerm') term
  from trades where deal='rent' and kind in (${kinds.map(k=>`'${k}'`).join(',')}) and deal_date>=? and umd is not null and jibun is not null and area is not null`).iterate(start)){
 scanned++;
 if(t.cancel_date)continue;
 const term=contractTerm(t.term);
 if(!term){noTerm++;continue;}
 const id=placeId(t.kind,t.lawd,t.umd,t.jibun);
 // market_places only lists places traded in its window; the rest have no row to point at.
 if(!places.has(id)){noPlace++;continue;}
 contracts.push({place_id:id,kapt_code:places.get(id),area_type:Math.floor(t.area),end:term.end,deposit:t.deposit,monthly_rent:t.monthly_rent??0,contract_type:t.contract_type,deal_date:t.deal_date});
}
wh.close();
const rows=expiryRows(contracts,fromMonth).map(r=>({...r,computed_at:runAt}));
const linked=rows.filter(r=>r.kapt_code);
console.log(JSON.stringify({scanned,noTerm,noPlace,contracts:contracts.length,rows:rows.length,linkedRows:linked.length,complexes:new Set(linked.map(r=>r.kapt_code)).size,fromMonth}));
if(!flag('--dry-run')){
 // A bad warehouse must not empty the table.
 const {count,error}=await db.from('market_rent_expiries').select('place_id',{count:'exact',head:true});
 if(error)throw Error(error.message);
 if(count>1000&&rows.length<count*0.7)throw Error(`DELETE_GUARD:${rows.length}/${count}`);
 await upsert('market_rent_expiries',rows,'place_id,area_type,end_month',1000);
 // Rows this run did not touch are months that passed or filings since cancelled.
 for(let attempt=1;;attempt++){
  const {error:e}=await db.from('market_rent_expiries').delete().lt('computed_at',runAt);
  if(!e)break;if(attempt>=3)throw Error(e.message);await sleep(5000*attempt);
 }
 console.log('WRITTEN');
}
