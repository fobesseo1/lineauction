// Independent observer: never starts/restarts the collector or schedules refreshes.
import {readFile,writeFile,open,mkdir,unlink,stat} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {classifyHealth,pipelineHealth} from './monitor-core.mjs';
import {inSeoulGyeonggi} from './scope.mjs';
import {mapCourtProperty} from './pipeline-core.mjs';
import {replaceFile} from './store.mjs';
import {planNotification} from './notification-core.mjs';
import {sendWindowsNotification} from './windows-notify.mjs';
const root='data/court/standalone';await mkdir(root,{recursive:true});
const lock=await open(`${root}/monitor.lock`,'wx');await lock.writeFile(JSON.stringify({pid:process.pid}));
const read=async(path,fallback)=>{try{return JSON.parse(await readFile(path,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;return fallback;}};
let stop=false;process.on('SIGINT',()=>stop=true);process.on('SIGTERM',()=>stop=true);
let summary=null,summaryAt=0;
let notificationState=await read(`${root}/notification-state.json`,{});
let lastNotification=notificationState.lastNotification??null,notificationRetryAt=0;
async function notify(progress,health){
 const plan=planNotification({progress,health,state:notificationState});
 if(plan.notification&&Date.now()<notificationRetryAt)return;
 if(plan.notification){
  try{lastNotification=await sendWindowsNotification(plan.notification);}
  catch(error){lastNotification={status:'failed',at:new Date().toISOString(),error:error.message};notificationRetryAt=Date.now()+60000;return;}
 }
 notificationState={...plan.state,lastNotification};
 const temp=`${root}/notification-${randomUUID()}.tmp`;await writeFile(temp,JSON.stringify(notificationState,null,2));await replaceFile(temp,`${root}/notification-state.json`);
}
async function tick(){
 const checkedAt=new Date().toISOString();
 const progress=await read(`${root}/progress.json`,null);
 let alive=null;
 if(progress?.pid){try{process.kill(progress.pid,0);alive=true;}catch(e){alive=e.code==='ESRCH'?false:null;}}
 const lastActivityAt=await stat(`${root}/progress.json`).then(s=>s.mtime.toISOString()).catch(()=>null);
 const file=await open(`${root}/events.jsonl`,'r').catch(()=>null);
 let events=[];
 if(file){try{const s=await file.stat();const size=Math.min(s.size,131072);const b=Buffer.alloc(size);await file.read(b,0,size,s.size-size);events=b.toString().split('\n').flatMap(line=>{try{return [JSON.parse(line)];}catch{return [];}}).filter(e=>e.run===progress?.id);}finally{await file.close();}}
 const successes=events.filter(e=>e.stage==='saved');
 const lastSuccessAt=successes.at(-1)?.at??null;
 const recent=successes.slice(-20);
 const perItemSeconds=recent.length>1?(Date.parse(recent.at(-1).at)-Date.parse(recent[0].at))/(recent.length-1)/1000:null;
 if(Date.now()-summaryAt>60000){
  const state=await read('data/court/current.json',{items:{}});
  const items=Object.values(state.items).filter(i=>inSeoulGyeonggi(i)&&mapCourtProperty(i));
  const keys=new Set(items.map(i=>i.key));
  const media=(await read('data/court/media/manifest.json',[])).filter(m=>keys.has(m.key));
  summary={total:items.length,details:items.filter(i=>i.detail).length,photoProperties:new Set(media.map(m=>m.key)).size,photoFiles:media.length,asOf:checkedAt};summaryAt=Date.now();
 }
 const pipeline=await read('data/court/pipeline/latest.json',null);
 const matchingPaused=!!await stat('data/court/pipeline/molit-access-paused.json').catch(()=>null);
 const stages=pipelineHealth(pipeline,progress,{matchingPaused});
 const health=classifyHealth({progress,alive,lastActivityAt,pipeline,matchingPaused});
 await notify(progress,health);
 const output={checkedAt,health,collectorAlive:alive,lastActivityAt,lastSuccessAt,perItemSeconds,summary,
  notifications:{enabled:process.platform==='win32',last:lastNotification},
  run:progress?{startedAt:progress.startedAt,finishedAt:progress.finishedAt,status:progress.status,attempted:progress.attempted,succeeded:progress.succeeded,failed:progress.failed,photos:progress.photos,current:progress.current,syncStatus:progress.syncStatus,lastSyncAt:progress.lastSyncAt,error:progress.error,errors:(progress.errors??[]).slice(-5).map(e=>({key:e.key,message:e.message}))}:null,
  pipeline:pipeline?{finishedAt:pipeline.finishedAt,status:pipeline.status,errors:pipeline.errors?.length??0,matchedProperties:pipeline.matchedProperties??0,matchedTrades:pipeline.matchedTrades??0,...stages}:null};
 const temp=`${root}/health-${randomUUID()}.tmp`;await writeFile(temp,JSON.stringify(output,null,2));await replaceFile(temp,`${root}/health.json`);
}
try{while(!stop){try{await tick();}catch(error){console.error(new Date().toISOString(),error.message);await notify(null,{state:'error',label:'감시 오류',message:'감시기가 수집 상태를 읽지 못했습니다. 설정 화면을 확인해 주세요.'}).catch(e=>console.error(e.message));}await delay(20000);}}
finally{await lock.close();await unlink(`${root}/monitor.lock`);}
