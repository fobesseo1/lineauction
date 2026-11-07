// 평형별 임대 판정: 국토교통부 마이홈포털 공공임대주택 단지정보 (data.go.kr 15110581, MOLIT_API_KEY) → public.complex_rental_supplies,
// public.complex_area_rental.
//   node scripts/detail/rental-supply.mjs [--refresh] [--codes 11500,11710]
// Asked per 시군구 of the configured regions (about 140 calls); answers are cached for 25 days, so a stop on the budget resumes.
// The tables are written only when every 시군구 has answered. --codes tries a few and writes nothing.
import {writeJson} from '../onbid/atomic.mjs';
import {stat} from 'node:fs/promises';
import {singleRun} from '../single-run.mjs';
import {arg,flag,sleep,readJson,dir,complexes,fetchAll,replaceRows,eventLog} from './common.mjs';
import {matchRentalSupplies,areaRentalRows} from './core.mjs';

const root='data/detail/rental-supply';await dir(root,'regions');
if(!await singleRun(root,'scripts/detail/rental-supply.mjs')){console.log('ALREADY_RUNNING');process.exit(0);}
const event=eventLog(root),refresh=flag('--refresh'),only=arg('--codes',null)?.split(',');
const DAILY=900;   // 개발계정 1,000 a day
const budgetPath=`${root}/budget.json`,budget=await readJson(budgetPath,{});
const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul'}).format(new Date());
const fresh=async p=>{if(refresh)return false;try{return (Date.now()-(await stat(p)).mtimeMs)/86400e3<25;}catch(e){if(e.code==='ENOENT')return false;throw e;}};
class Stop extends Error{}

async function page(code,pageNo){
 if((budget[day]??0)>=DAILY)throw new Stop('DAILY_BUDGET');
 budget[day]=(budget[day]??0)+1;
 const u=new URL('https://apis.data.go.kr/1613000/HWSPR04/rentalHouseGwList');
 for(const [k,v] of Object.entries({serviceKey:process.env.MOLIT_API_KEY,brtcCode:code.slice(0,2),signguCode:code.slice(2),numOfRows:'1000',pageNo:String(pageNo)}))u.searchParams.set(k,v);
 for(let attempt=0;;attempt++){
  await sleep(250);
  try{
   const body=JSON.parse(await (await fetch(u,{signal:AbortSignal.timeout(60000)})).text());
   const gw=body.OpenAPI_ServiceResponse?.cmmMsgHeader?.returnReasonCode;
   if(gw)throw Error(`API_${gw}`);
   const res=body.response;
   if(!['00','000','03'].includes(String(res?.header?.resultCode)))throw Error(`API_${res?.header?.resultCode??'INVALID'}`);
   return {items:[].concat(res.body?.item??[]),total:Number(res.body?.totalCount??0)};
  }catch(e){
   if(/^API_(22|30|20)$/.test(e.message))throw new Stop(e.message);
   if(attempt>=2)throw Error(String(e.message).replaceAll(process.env.MOLIT_API_KEY,'***'));
   await sleep(5000*(attempt+1));
  }
 }
}
// 매입임대 (scattered bought units, nine rows in ten) is dropped here; it does not say which 평형 of a complex is rental.
async function region(code){
 const file=`${root}/regions/${code}.json`;
 if(await fresh(file))return readJson(file,[]);
 const rows=[];let got=0;
 for(let p=1;;p++){
  const {items,total}=await page(code,p);
  got+=items.length;rows.push(...items.filter(r=>r.suplyTyNm!=='매입임대'));
  if(!items.length||got>=total){if(got<total)throw Error(`INCOMPLETE:${code}:${got}/${total}`);break;}
 }
 await writeJson(file,rows);return rows;
}

try{
 const list=await complexes('kapt_code,name,pnu,road_address');
 const codes=only??[...new Set(list.map(c=>c.pnu?.slice(0,5)).filter(Boolean))].sort();
 const rows=[];let stopped=null,failed=0;
 for(const code of codes){
  try{rows.push(...await region(code));}
  catch(e){
   if(e instanceof Stop){stopped=e.message;break;}
   failed++;await event({code,error:e.message});console.log(`FAILED ${code}: ${e.message}`);
  }
 }
 await writeJson(budgetPath,budget);
 const {supplies,unmatched}=matchRentalSupplies(rows,list);
 const rental=new Map((await fetchAll('complex_rental_types','kapt_code,rental_households,private_rental')).map(r=>[r.kapt_code,r]));
 const areaOf=new Map();for(const a of await fetchAll('complex_area_types','kapt_code,exclusive_area,households'))(areaOf.get(a.kapt_code)??areaOf.set(a.kapt_code,[]).get(a.kapt_code)).push(a);
 const bySupply=new Map();for(const s of supplies)(bySupply.get(s.kapt_code)??bySupply.set(s.kapt_code,[]).get(s.kapt_code)).push(s);
 const verdicts=[...bySupply].flatMap(([k,s])=>areaRentalRows(k,s,areaOf.get(k)??[],rental.get(k)));
 const count=verdicts.reduce((m,r)=>(m[r.status]=(m[r.status]??0)+1,m),{});
 const summary={codes:codes.length,rows:rows.length,unmatchedComplexes:unmatched,complexes:bySupply.size,supplies:supplies.length,verdicts:verdicts.length,status:count,stopped,failed};
 if(only){console.log(JSON.stringify(summary));for(const r of verdicts)console.log(JSON.stringify(r));process.exit(0);}
 if(stopped||failed){await event(summary);console.log(JSON.stringify({...summary,written:false}));process.exitCode=stopped?0:1;process.exit();}
 const now=new Date().toISOString();
 const a=await replaceRows('complex_rental_supplies',supplies.map(s=>({...s,fetched_at:now})),['kapt_code','hsmp_sn','supply_type','style_name']);
 const b=await replaceRows('complex_area_rental',verdicts.map(v=>({...v,computed_at:now})),['kapt_code','area_type']);
 await event({...summary,a,b});
 console.log(JSON.stringify({...summary,supplyTable:a,areaTable:b}));
}catch(e){await writeJson(budgetPath,budget).catch(()=>{});console.error('FAILED',e.message);process.exitCode=1;}
