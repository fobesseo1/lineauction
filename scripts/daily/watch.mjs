// Watchdog run by Windows Task Scheduler every 10 minutes. It never starts or stops collectors;
// it only notices stalls, crashes, missed starts, failed runs and repeated API refusals, and
// sends throttled Windows notifications. State lives in data/daily/watch-state.json.
import {readFile,writeFile,stat,readdir,mkdir} from 'node:fs/promises';
import {sendWindowsNotification} from '../court/windows-notify.mjs';
import {koreanDay} from './core.mjs';
import {evaluate,due} from './watch-core.mjs';

const root='data/daily';await mkdir(root,{recursive:true});
const readJson=async(path,fallback)=>{try{return JSON.parse(await readFile(path,'utf8'));}catch{return fallback;}};
const mtime=async path=>{try{return (await stat(path)).mtimeMs;}catch{return 0;}};
const alive=pid=>{try{process.kill(pid,0);return true;}catch(e){return e.code==='EPERM';}};
const now=Date.now(),day=koreanDay(new Date(now));

const lock=await readJson(`${root}/running.lock`,null);
const history=(await readFile(`${root}/runs.jsonl`,'utf8').catch(()=>'')).split('\n').filter(Boolean).flatMap(l=>{try{return [JSON.parse(l)];}catch{return [];}});

// Latest sign of work from any collector the runner may be driving.
const pipelineFiles=(await readdir('data/court/pipeline').catch(()=>[])).map(name=>`data/court/pipeline/${name}`);
const activityAt=Math.max(...await Promise.all([
 `${root}/current.json`,'data/court/standalone/events.jsonl','data/court/standalone/progress.json',
 'data/onbid/events.jsonl','data/onbid/progress.json','data/onbid/detail-progress.json',...pipelineFiles,
].map(mtime)));

// Consecutive KST days on which a provider refused requests.
const state=await readJson(`${root}/watch-state.json`,{sent:{},blockedDays:{}});
const onbidPause=await readJson('data/onbid/access-paused.json',{}),molitPause=await readJson('data/court/pipeline/molit-access-paused.json',null);
const blockedToday={onbid:[onbidPause.detail?.blockedDay,onbidPause.list?.day].includes(day),molit:!!molitPause&&(molitPause.day??koreanDay(new Date(molitPause.pausedAt??0)))===day};
const blockedStreaks={};
for(const [service,blocked] of Object.entries(blockedToday)){
 const days=new Set(state.blockedDays[service]??[]);if(blocked)days.add(day);
 state.blockedDays[service]=[...days].sort().slice(-10);
 let streak=0;for(let d=new Date(`${day}T12:00:00+09:00`);days.has(koreanDay(d));d=new Date(d.getTime()-86400000))streak++;
 blockedStreaks[service]=streak;
}

const problems=evaluate({now,day,lock,lockAlive:lock?alive(lock.pid):false,activityAt,history,blockedStreaks});
// Failures the runner already announced start their repeat clock without a duplicate notice.
for(const p of problems)if(p.initialSent&&state.sent[p.key]===undefined)state.sent[p.key]=now;
for(const p of due(problems,state.sent,now)){
 await sendWindowsNotification({title:`선경매 · ${p.title}`,message:p.message}).catch(e=>console.error('notification failed',e.message));
 state.sent[p.key]=now;
}
// Forget keys for problems that have cleared so a recurrence alerts again immediately.
const active=new Set(problems.map(p=>p.key));
for(const key of Object.keys(state.sent))if(!active.has(key))delete state.sent[key];
await writeFile(`${root}/watch-state.json`,JSON.stringify(state,null,2));
const health={checkedAt:new Date(now).toISOString(),ok:!problems.length,running:lock?{job:lock.job,trigger:lock.trigger,startedAt:lock.startedAt,alive:alive(lock.pid)}:null,lastActivityAt:activityAt?new Date(activityAt).toISOString():null,problems:problems.map(({key,title,message})=>({key,title,message}))};
await writeFile(`${root}/health.json`,JSON.stringify(health,null,2));
console.log(JSON.stringify({ok:health.ok,problems:health.problems.map(p=>p.title)}));
