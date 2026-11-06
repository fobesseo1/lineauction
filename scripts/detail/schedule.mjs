// Runs whichever complex-detail collectors are due today (KST), once a day.
//  - 07:00–07:30 start: stops by 07:30, the earliest the market job may start, so what it gets reaches that job's
//    complex-briefs step the same morning and the job's bundle download never lands on files a collector is writing.
//  - Later start (PC turned on late; the task also fires at logon): waits for today's market job, then runs with the
//    whole day's budget. What it gets reaches complex-briefs the next morning.
//  - Second start the same day, even after a run cut short at 07:30: stops at once. The caches let the next day continue.
// Quick steps come first and fees takes what is left.
//   node scripts/detail/schedule.mjs [--dry-run] [--any-time]
// DETAIL_FAKE_STEPS (ms per step) and DETAIL_POLL_MS are for trying the waiting and the once-a-day rule without collecting.
import {spawnSync} from 'node:child_process';
import {writeFile} from 'node:fs/promises';
import {singleRun} from '../single-run.mjs';
import {db,flag,readJson,sleep} from './common.mjs';
import {schedulePlan,marketGate,DETAIL_CUTOFF,DETAIL_LATEST} from './core.mjs';

const kstNow=()=>new Date(Date.now()+9*3600e3);
const minutes=()=>kstNow().getUTCHours()*60+kstNow().getUTCMinutes();
const today=()=>kstNow().toISOString().slice(0,10);
const say=m=>console.log(`${kstNow().toISOString().slice(0,16)} ${m}`);
const dry=flag('--dry-run'),anyTime=flag('--any-time'),day=today();
const fake=Number(process.env.DETAIL_FAKE_STEPS??0),POLL=Number(process.env.DETAIL_POLL_MS??60_000);
// Local on purpose: data/daily is in no bundle, so another PC's upload cannot bring back an old value.
const markerPath='data/daily/detail-schedule.json';

// Today's market row across PCs, null if none, undefined if it could not be read.
async function readLease(){
 try{
  const {data,error}=await db.from('factory_job_leases').select('status,lease_until').eq('job','market').eq('day',day).maybeSingle();
  return error?undefined:data;
 }catch{return undefined;}
}
const alive=pid=>{try{process.kill(pid,0);return true;}catch(e){return e.code==='EPERM';}};
// A half-written lock reads as not locked here; the lease says the same thing a moment later.
const marketLocked=async()=>{let l=null;try{l=await readJson('data/daily/running.lock',null);}catch{}return l?.job==='market'&&alive(l.pid);};

const plan=anyTime?'any-time':schedulePlan({minutes:minutes(),day,ranDay:(await readJson(markerPath,null))?.day,lease:await readLease()});
say(`PLAN ${plan}`);
if(['ran-today','too-early','too-late'].includes(plan))process.exit(0);
// The task's vbs returns at once, so the scheduler's IgnoreNew cannot stop a second logon while this one waits.
if(!dry&&!await singleRun('data/detail','scripts/detail/schedule.mjs')){say('ALREADY_RUNNING');process.exit(0);}

if(plan==='late'){
 const started=Date.now();
 for(;;){
  const decision=marketGate({lease:await readLease(),lockBusy:await marketLocked(),nowMs:Date.now(),waitedMs:Date.now()-started});
  if(dry){say(`MARKET ${decision}`);break;}
  if(decision==='go'){say(`MARKET done, waited ${Math.round((Date.now()-started)/60000)} min`);break;}
  // The day is not marked as run, so a later logon can try again.
  if(decision==='give-up'||today()!==day||minutes()>=DETAIL_LATEST){say('MARKET still not done, skipping today');process.exit(0);}
  await sleep(POLL);
 }
}
if(!dry&&!anyTime)await writeFile(markerPath,JSON.stringify({day,plan,startedAt:new Date(Date.now()).toISOString()}));

// Late runs stop before midnight, so one run stays within one day's budget and clear of any night run.
const until=plan==='late'?'23:30':'07:30',stopAt=plan==='late'?23.5*60:plan==='morning'?DETAIL_CUTOFF:Infinity;
const kst=kstNow(),date=kst.getUTCDate(),weekday=kst.getUTCDay(),month=kst.getUTCMonth()+1;
const busRefresh=date===7&&[1,4,7,10].includes(month);
const STEPS=[
 // 전월세 신고가 매일 들어오지만 만기 분포는 천천히 바뀐다.
 {name:'rent-expiries',when:weekday===1,args:['scripts/detail/rent-expiries.mjs']},
 {name:'childcare',when:date===5,args:['scripts/detail/childcare.mjs']},
 // 공시는 5월·9월 전후로 바뀐다.
 {name:'schools',when:date===8&&[6,10].includes(month),args:['scripts/detail/schools.mjs']},
 // 분기마다: TAGO 파일은 연 1회, 서울 파일은 월 1회 갱신되고 광역 노선은 드물게 바뀐다.
 {name:'bus',when:busRefresh,args:['scripts/detail/bus.mjs','--refresh']},
 // 서울 정류소별 노선은 하루 약 1,000건 한도라 날마다 이어 받는다. 다 받으면 아무것도 쓰지 않는다.
 {name:'bus-seoul',when:!busRefresh,args:['scripts/detail/bus.mjs','--if-new']},
 // 새 단지만 부른다 (필지별 캐시).
 {name:'buildings',when:date===6,args:['scripts/detail/buildings.mjs','--phase','titles','--until',until]},
 // 아침 30분이면 약 1,200곳이라 한 달 치가 9일쯤 걸린다. 날짜를 가리지 않고 받을 게 있으면 이어 받는다.
 {name:'fees',when:true,args:['scripts/detail/fees.mjs','--until',until]},
];
let failed=0;
for(const s of STEPS.filter(s=>s.when)){
 if(minutes()>=stopAt){say(`SKIP ${s.name}: past ${until}`);continue;}
 say(`RUN ${s.name}${s.args.includes('--until')?` until ${until}`:''}`);
 if(dry)continue;
 if(fake){await sleep(fake);continue;}
 const r=spawnSync(process.execPath,s.args,{stdio:'inherit',windowsHide:true});
 if(r.status!==0){failed++;say(`FAILED ${s.name}: ${r.status}`);}
}
process.exitCode=failed?1:0;
