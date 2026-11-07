// 관리비 (K-APT 공용관리비·개별사용료·장기수선충당금 APIs) → public.complex_maintenance_fees.
//   node scripts/detail/fees.mjs [--month 202608] [--limit N] [--until HH:MM] [--concurrency 3] [--probe]
// One complex-month is up to 31 calls; each finished complex is cached, so a stop loses nothing and the next run
// continues. A complex with no 인건비 row for the month has filed nothing: it costs one call and is cached as empty.
// Without --month it finds the newest month enough complexes have filed for (see --probe), then goes on to BACKFILL.
import {appendFile} from 'node:fs/promises';
import {writeJson} from '../onbid/atomic.mjs';
import {singleRun} from '../single-run.mjs';
import {arg,flag,sleep,exists,readJson,kstDay,dir,complexes,upsert,untilFromArg,eventLog} from './common.mjs';
import {FEE_OPS,feeUrl,feeRow,monthsBefore} from './core.mjs';

const root='data/detail/fees';await dir(root,'raw');
if(!await singleRun(root,'scripts/detail/fees.mjs')){console.log('ALREADY_RUNNING');process.exit(0);}
const limit=Number(arg('--limit','0'))||Infinity,until=untilFromArg(),concurrency=Number(arg('--concurrency','3'));
const OP_DAILY=4900;   // measured 2026-11-06: 개발계정 answers API_22 after about 5,000 calls per operation per day
const event=eventLog(root);
const budgetPath=`${root}/budget.json`,budget=await readJson(budgetPath,{});
class Stop extends Error{}

async function call(o,kapt,ym){
 const used=budget[kstDay()]??={};
 if((used[o.op]??0)>=OP_DAILY)throw new Stop('DAILY_BUDGET');
 used[o.op]=(used[o.op]??0)+1;
 const u=new URL(feeUrl(o));
 for(const [k,v] of Object.entries({serviceKey:process.env.MOLIT_API_KEY,kaptCode:kapt,searchDate:ym}))u.searchParams.set(k,v);
 for(let attempt=0;;attempt++){
  await sleep(150);
  try{
   const r=await fetch(u,{signal:AbortSignal.timeout(25000),redirect:'error'});
   const raw=await r.text();
   if(raw.trimStart().startsWith('<')){const code=raw.match(/<returnReasonCode>(\d+)</)?.[1]??raw.match(/<resultCode>(\d+)</)?.[1]??'XML';throw Error(`API_${code}`);}
   const body=JSON.parse(raw);
   const gw=body.OpenAPI_ServiceResponse?.cmmMsgHeader?.returnReasonCode;
   if(gw)throw Error(`API_${gw}`);
   const res=body.response;
   const code=String(res?.header?.resultCode??'');
   if(code==='03')return null;      // NODATA
   if(!['00','000'].includes(code))throw Error(`API_${code||'INVALID'}`);
   return res.body?.item??[].concat(res.body?.items?.item??res.body?.items??[])[0]??null;
  }catch(e){
   if(['API_22','API_30','API_12','API_20'].includes(e.message))throw new Stop(e.message);
   if(e.message==='API_23'&&attempt<4){await sleep(3000*2**attempt);continue;}
   if(e.message==='API_04'&&attempt<3){await sleep(30000*2**attempt);continue;}
   if(attempt>=3)throw e;
   await sleep(3000*(attempt+1));
  }
 }
}
// A month nobody filed still answers 00, with every field (kaptCode too) null. Zero amounts are real filings.
const hasAmount=item=>item?.kaptCode!=null;

// The newest month where at least half of a small sample has filed.
async function latestMonth(list){
 const sample=list.filter((_,i)=>i%Math.ceil(list.length/12)===0).slice(0,12);
 for(const ym of monthsBefore(new Date(),6)){
  let filed=0;
  for(const c of sample){if(hasAmount(await call(FEE_OPS[0],c.kapt_code,ym)))filed++;}
  console.log(`PROBE ${ym}: ${filed}/${sample.length} filed`);
  if(filed>=sample.length/2)return ym;
 }
 throw Error('NO_FILED_MONTH');
}

// Older months to fill once the newest is done, for a winter figure next to the latest one. Rows are per month, so these never
// replace it. Their deadline has passed, so a complex found empty is not asked again.
const BACKFILL=['202601'];
async function collectMonth(ym,list,recheck){
 await dir(`${root}/raw/${ym}`);
 const pending=[];
 // Late filers: a complex found empty is asked again after 20 days.
 const stale=new Date(Date.now()-20*86400e3).toISOString();
 for(const c of list){const cached=await readJson(`${root}/raw/${ym}/${c.kapt_code}.json`,null);if(!cached||(recheck&&!cached.filed&&cached.fetchedAt<stale))pending.push(c);}
 console.log(`MONTH ${ym}: ${list.length-pending.length} cached, ${pending.length} to fetch, ${FEE_OPS.length} ops`);
 let next=0,done=0,empty=0,failed=0,stopped=null,consecutive=0;const buffer=[];
 const flush=async()=>{const rows=buffer.splice(0);if(rows.length)await upsert('complex_maintenance_fees',rows,'kapt_code,ym');await writeJson(budgetPath,budget);};
 const worker=async()=>{
  while(!stopped&&next<pending.length&&done<limit){
   const c=pending[next++];
   if(Date.now()>=until){stopped='UNTIL';break;}
   if(await exists(`${root}/STOP`)){stopped='STOP_PRESENT';break;}
   try{
    const answers={},first=await call(FEE_OPS[0],c.kapt_code,ym);
    answers[FEE_OPS[0].op]=first;
    if(hasAmount(first))for(const o of FEE_OPS.slice(1))answers[o.op]=await call(o,c.kapt_code,ym);
    const fetchedAt=new Date().toISOString(),filed=hasAmount(first);
    await writeJson(`${root}/raw/${ym}/${c.kapt_code}.json`,{fetchedAt,filed,answers});
    done++;consecutive=0;
    if(filed)buffer.push(feeRow(c.kapt_code,ym,answers,c,fetchedAt));else empty++;
    if(buffer.length>=100)await flush();
    if(done%200===0)console.log(`fees ${done}/${pending.length} (empty ${empty}, failed ${failed})`);
   }catch(e){
    if(e instanceof Stop){stopped=e.message;break;}
    failed++;await appendFile(`${root}/errors.log`,`${ym} ${c.kapt_code} ${e.message}\n`);
    if(++consecutive>=10){stopped=`CONSECUTIVE:${e.message}`;break;}
   }
  }
 };
 await Promise.all(Array.from({length:concurrency},worker));
 await flush();
 let remaining=0;for(const c of list)if(!await exists(`${root}/raw/${ym}/${c.kapt_code}.json`))remaining++;
 await event({ym,done,empty,failed,stopped,remaining});
 console.log(JSON.stringify({ym,done,empty,failed,stopped,remaining}));
 return stopped;
}
const list=(await complexes()).sort((a,b)=>(b.households??0)-(a.households??0));
try{
 const only=arg('--month',null),latest=only??await latestMonth(list);
 if(flag('--probe')){await writeJson(budgetPath,budget);process.exit(0);}
 const months=only?[only]:[latest,...BACKFILL.filter(m=>m!==latest)];
 for(const ym of months)if(await collectMonth(ym,list,ym===latest))break;
}catch(e){
 await writeJson(budgetPath,budget);
 // The day's budget ending during the month probe is a normal stop: tomorrow continues.
 if(e instanceof Stop)console.log(JSON.stringify({stopped:e.message}));
 else{console.error('FAILED',e.message);process.exitCode=1;}
}
