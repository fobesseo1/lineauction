// Daily runner: one entry point for the 10:00 Onbid and 15:00 court jobs, started either by
// Windows Task Scheduler (--trigger=schedule) or by hand (--trigger=manual, desktop shortcut or
// the local settings page). It owns ordering between jobs; each collector keeps its own
// checkpoint, quota and STOP handling.
import {mkdir,readFile,writeFile,appendFile,open,unlink} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {sendWindowsNotification} from '../court/windows-notify.mjs';
import {JOBS,koreanDay,scheduledSkip,lockState,onbidMessage,beforeSchedule} from './core.mjs';

const root='data/daily';await mkdir(root,{recursive:true});
const arg=key=>process.argv.find(a=>a.startsWith(`--${key}=`))?.slice(key.length+3);
const job=arg('job'),trigger=arg('trigger')??'manual';
if(!JOBS.includes(job))throw Error(`--job must be one of ${JOBS.join(', ')}`);
if(!['schedule','manual'].includes(trigger))throw Error('--trigger must be schedule or manual');
const label=job==='onbid'?'온비드 공매':'법원 경매';
const day=koreanDay();

const readJson=async(path,fallback)=>{try{return JSON.parse(await readFile(path,'utf8'));}catch(e){if(e.code==='ENOENT')return fallback;throw e;}};
const history=async()=>(await readFile(`${root}/runs.jsonl`,'utf8').catch(()=>'')).split('\n').filter(Boolean).map(l=>JSON.parse(l));
const record=run=>appendFile(`${root}/runs.jsonl`,JSON.stringify(run)+'\n');
const notify=(title,message)=>sendWindowsNotification({title:`선경매 · ${title}`,message}).catch(e=>console.error('notification failed',e.message));
const alive=pid=>{try{process.kill(pid,0);return true;}catch(e){return e.code==='EPERM';}};

// 1. Scheduled starts (daily time, missed-run catch-up, or logon) wait for the job's hour and skip
//    when the job already ran today. Manual runs always proceed.
if(trigger==='schedule'&&beforeSchedule(job))process.exit(0);
if(trigger==='schedule'){
 const skip=scheduledSkip(await history(),job,day);
 if(skip.skip){
  await record({job,trigger,day,status:'skipped',reason:skip.reason,at:new Date().toISOString()});
  if(skip.reason==='manual-today')await notify(`${label} 자동 실행 건너뜀`,`오늘 이미 수동으로 실행했습니다${skip.at?` (${new Date(skip.at).toLocaleTimeString('ko-KR',{timeZone:'Asia/Seoul'})})`:''}.\n내일 정해진 시간에 다시 실행합니다.`);
  process.exit(0);
 }
}

// 2. One job at a time. Manual starts report a busy runner; scheduled ones wait their turn.
const lockPath=`${root}/running.lock`;
let lock;
for(const started=Date.now();;){
 const state=lockState(await readJson(lockPath,null),alive);
 if(state==='stale')await unlink(lockPath).catch(()=>{});
 try{lock=await open(lockPath,'wx');break;}catch(e){if(e.code!=='EEXIST')throw e;}
 const holder=await readJson(lockPath,null);
 if(trigger==='manual'){await notify(`${label} 실행 안 함`,`${holder?.job==='onbid'?'온비드 공매':'법원 경매'} 작업이 이미 실행 중입니다.\n끝난 뒤 다시 시도해 주세요.`);process.exit(0);}
 if(Date.now()-started>8*3600_000){await record({job,trigger,day,status:'failed',reason:'lock-timeout',at:new Date().toISOString()});await notify(`${label} 시작 실패`,'다른 작업이 8시간 넘게 끝나지 않았습니다. 설정 화면을 확인해 주세요.');process.exit(1);}
 await delay(60_000);
}
const run={job,trigger,day,startedAt:new Date().toISOString(),pid:process.pid,steps:[]};
await lock.writeFile(JSON.stringify({job,trigger,pid:process.pid,startedAt:run.startedAt}));
await writeFile(`${root}/current.json`,JSON.stringify(run,null,2));

// Each step is a separate collector process with its own time limit.
function step(name,script,args,timeoutMs){
 return new Promise(resolve=>{
  const started=Date.now();let out='';
  const child=spawn(process.execPath,[script,...args],{windowsHide:true,stdio:['ignore','pipe','pipe']});
  child.stdout.on('data',d=>{out=(out+d).slice(-4000);});child.stderr.on('data',d=>{out=(out+d).slice(-4000);});
  const timer=setTimeout(()=>child.kill(),timeoutMs);
  child.on('exit',code=>{clearTimeout(timer);const last=out.trim().split('\n').at(-1)??'';let result=null;try{result=JSON.parse(last);}catch{}
   const entry={name,code,seconds:Math.round((Date.now()-started)/1000),timedOut:Date.now()-started>=timeoutMs,result:result??last.slice(0,300)};
   run.steps.push(entry);void writeFile(`${root}/current.json`,JSON.stringify(run,null,2));resolve(entry);});
 });
}

await notify(`${label} ${trigger==='manual'?'수동':'자동'} 실행 시작`,'진행 상황은 바탕화면 "선경매 진행 상황 보기"에서 볼 수 있습니다.\n끝나면 결과를 알려드립니다.');
try{
 if(job==='onbid'){
  // List refresh (≈276 requests) then detail backfill/new listings up to the daily 1,000.
  const list=await step('onbid-list','scripts/onbid/collect.mjs',['--refresh'],3*3600_000);
  const detail=await step('onbid-detail','scripts/onbid/detail.mjs',[],4*3600_000);
  const progress=await readJson('data/onbid/progress.json',{}),detailState=await readJson('data/onbid/detail-progress.json',{}),budget=await readJson('data/onbid/budget.json',{});
  const {runStartedAt,status,properties,conditions,requests,refresh,added,removed,listFinishedAt}=progress;
  run.summary={list:{runStartedAt,status,properties,conditions,requests,refresh,added,removed,listFinishedAt},detail:{processed:detailState.processed,total:detailState.total,remaining:detailState.remaining,status:detailState.status},usage:budget.serviceDays?.[day]??{list:0,detail:0}};
  const listOk=list.code===0||/LIST_ALREADY_COMPLETED/.test(JSON.stringify(list.result));
  const detailOk=detail.code===0;
  run.status=listOk&&detailOk?'completed':'failed';
  const message=onbidMessage({list:run.summary.list,detail:run.summary.detail,usage:run.summary.usage});
  const note=detailState.status==='budget_wait'?'\n오늘 상세 한도를 다 써서 내일 이어서 받습니다.':detailState.status==='completed'?'\n상세 수집이 모두 끝났습니다.':'';
  const failure=[!listOk&&`목록: ${progress.errors?.[0]?.code??list.result}`,!detailOk&&`상세: ${detailState.errors?.[0]?.code??detail.result}`].filter(Boolean).join('\n');
  await notify(run.status==='completed'?`${label} 완료`:`${label} 일부 실패`,run.status==='completed'?message+note:`${failure}\n${message}`);
 }else{
  if(await readFile('data/court/standalone/STOP').then(()=>true,()=>false)){
   run.status='skipped';run.reason='court-stop-file';
   await notify(`${label} 건너뜀`,'법원 수집 중지(STOP) 파일이 있어 실행하지 않았습니다.\n다시 수집하려면 data/court/standalone/STOP 파일을 지워 주세요.');
  }else{
   // A crashed collector can leave its own lock behind; clear it only when that process is gone.
   for(const path of ['data/court/standalone/running.lock','data/court/pipeline/running.lock']){const held=await readJson(path,null);if(held&&!alive(held.pid))await unlink(path).catch(()=>{});}
   // 1) List/status refresh of all 16 courts + details/photos for new or due items, 2) DB + MOLIT.
   const list=await step('court-list','scripts/court/standalone.mjs',['--limit=100000','--repair-pass'],6*3600_000);
   const pipeline=await step('court-pipeline','scripts/court/pipeline-bulk.mjs',['--months=24'],3*3600_000);
   const collector=await readJson('data/court/standalone/progress.json',{}),latest=await readJson('data/court/pipeline/latest.json',{}),molit=await readJson('data/court/pipeline/molit-request-budget.json',{});
   run.summary={collector:{status:collector.status,attempted:collector.attempted,succeeded:collector.succeeded,failed:collector.failed,photos:collector.photos,skipped:collector.skipped,error:collector.error},
    pipeline:{status:latest.status,properties:latest.properties,lifecycle:latest.lifecycle,matchedProperties:latest.matchedProperties,matchedTrades:latest.matchedTrades,unmatched:latest.unmatched,errors:latest.errors?.length??null},
    molit:{used:molit.day===day?molit.requests:0,limit:molit.limit}};
   const listOk=list.code===0,pipelineOk=pipeline.code===0&&!(latest.errors??[]).filter(e=>e.stage!=='matching').length;
   run.status=listOk&&pipelineOk?'completed':'failed';
   const p=latest.properties??{};
   const message=[`목록·상세 확인 ${collector.attempted??0}건 (성공 ${collector.succeeded??0} · 실패 ${collector.failed??0}) · 새 사진 ${collector.photos??0}장`,
    `DB 신규 ${p.created??0} · 변경 ${p.updated??0} · 재확인 필요 ${latest.lifecycle?.['needs-recheck']??0} · 종결 ${latest.lifecycle?.closed??0}`,
    `실거래 연결 ${latest.matchedProperties??0}건 · 국토부 요청 ${run.summary.molit.used}/${run.summary.molit.limit??10000}`].join('\n');
   const failure=[!listOk&&`목록·사진: ${collector.error??collector.status??list.result}`,!pipelineOk&&`DB·실거래: ${latest.errors?.[0]?.message??latest.status??pipeline.result}`].filter(Boolean).join('\n');
   await notify(run.status==='completed'?`${label} 완료`:`${label} 일부 실패`,run.status==='completed'?message:`${failure}\n${message}`);
  }
 }
}catch(error){run.status='failed';run.error=error.message;await notify(`${label} 실패`,error.message);}
finally{
 run.finishedAt=new Date().toISOString();
 await record(run);await writeFile(`${root}/last-${job}.json`,JSON.stringify(run,null,2));
 await unlink(`${root}/current.json`).catch(()=>{});await lock.close();await unlink(lockPath).catch(()=>{});
 console.log(JSON.stringify({job,trigger,status:run.status,steps:run.steps.map(s=>({name:s.name,code:s.code,seconds:s.seconds}))}));
 process.exitCode=run.status==='completed'?0:1;
}
