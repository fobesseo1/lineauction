// How many complexes each detail table reaches.   node scripts/detail/coverage.mjs
import {db,complexes} from './common.mjs';

const all=await complexes('kapt_code,households');
const totalHh=all.reduce((s,c)=>s+(c.households??0),0),hh=new Map(all.map(c=>[c.kapt_code,c.households??0]));
async function distinct(table,filter=q=>q){
 const seen=new Set();
 for(let after='';;){
  const {data,error}=await filter(db.from(table).select('kapt_code')).gt('kapt_code',after).order('kapt_code').limit(1000);
  if(error)throw Error(`${table}: ${error.message}`);
  for(const r of data)if(r.kapt_code)seen.add(r.kapt_code);
  if(data.length<1000)break;
  after=data.at(-1).kapt_code;
 }
 return seen;
}
const pct=(n,d)=>`${(100*n/d).toFixed(1)}%`;
const report=async(name,table,filter)=>{
 const s=await distinct(table,filter);const known=[...s].filter(k=>hh.has(k));
 console.log(`${name}: ${known.length}/${all.length} (${pct(known.length,all.length)}), 세대 기준 ${pct(known.reduce((a,k)=>a+hh.get(k),0),totalHh)}`);
};
await report('관리비','complex_maintenance_fees');
await report('학교 연결','complex_schools');
await report('어린이집','complex_childcare',q=>q.eq('kind','daycare'));
await report('유치원','complex_childcare',q=>q.eq('kind','kindergarten'));
await report('동별 표제부','complex_buildings');
await report('동×타입','complex_dong_types');
await report('버스 500m~','complex_bus_stops');
await report('광역버스 1km','complex_bus_stops',q=>q.eq('is_express',true));
await report('전월세 만기','market_rent_expiries');
await report('공시가격','complex_official_prices');
